// Local402: pay for any x402 agent service in your own currency.
// 1. GET  /catalog?currency=wARS   services priced in pesos, reais or naira (Textile levels)
// 2. send wARS / wBRL / wCOP / cNGN to the gateway wallet on Celo
// 3. POST /deposit {txHash}          the gateway converts it to USD₮ on Textile FX, returns a credit token
// 4. POST /call/:serviceId           the gateway pays the service over x402 and returns its answer
import express from 'express';
import { decodeEventLog, erc20Abi } from 'viem';
import { LOCAL, TOKENS, tokenByAddress, ATTRIBUTION_CODE } from './config.mjs';
import { publicClient, loadAccount, transferTagged } from './chain.mjs';
import { domain as channelDomain, types as channelTypes, verifyVoucher, decodeVoucher } from './channel.mjs';
import { convert } from './textile.mjs';
import { pay } from './x402.mjs';
import { services, pricedCatalog, ratesPerUsd } from './catalog.mjs';
import * as ledger from './ledger.mjs';

const account = loadAccount();
const app = express();
app.use(express.json({ limit: '256kb' }));
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(e.status || 500).json({ error: e.message }));

app.get('/', (req, res) => res.json({
  service: 'Local402',
  gateway: account.address,
  chainId: 42220,
  payIn: LOCAL,
  settlesUpstreamIn: 'USDT',
  fx: 'Textile FX (firm RFQ quotes)',
  upstream: 'buy (gateway.usebuy.ai) x402 catalogue',
  attribution: ATTRIBUTION_CODE || null,
  flow: [
    'GET /catalog?currency=wARS',
    'transfer the local token to the gateway on Celo',
    'POST /deposit {txHash}',
    'POST /call/:serviceId with Authorization: Bearer <credit>',
  ],
}));

app.get('/rates', wrap(async (req, res) => res.json(await ratesPerUsd())));

app.get('/catalog', wrap(async (req, res) => {
  const currency = req.query.currency || 'wARS';
  if (!LOCAL.includes(currency)) return res.status(400).json({ error: `currency must be one of ${LOCAL.join(', ')}` });
  const cat = await pricedCatalog(currency);
  const q = (req.query.q || '').toString().toLowerCase();
  if (q) cat.services = cat.services.filter((s) => `${s.id} ${s.description}`.toLowerCase().includes(q));
  res.json(cat);
}));

app.post('/deposit', wrap(async (req, res) => {
  const txHash = (req.body?.txHash || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) return res.status(400).json({ error: 'txHash required' });
  if (ledger.depositSeen(txHash)) return res.status(409).json({ error: 'deposit already credited' });
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') return res.status(400).json({ error: 'transaction failed' });
  let found = null;
  for (const log of receipt.logs) {
    const tok = tokenByAddress(log.address);
    if (!tok || !LOCAL.includes(tok.symbol)) continue;
    try {
      const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (ev.eventName === 'Transfer' && ev.args.to.toLowerCase() === account.address.toLowerCase()) {
        found = { tok, from: ev.args.from, amount: ev.args.value };
      }
    } catch { /* not a Transfer */ }
  }
  if (!found || found.amount === 0n) return res.status(400).json({ error: `no ${LOCAL.join('/')} transfer to ${account.address} in that transaction` });
  const fx = await convert(account, { from: found.tok.symbol, to: 'USDT', sellAmount: found.amount });
  const credit = ledger.recordDeposit(txHash, {
    from: found.from,
    currency: found.tok.symbol,
    amountLocal: found.amount.toString(),
    creditedAtomic: fx.bought,
    textileTx: fx.txHash,
    textileRfq: fx.rfqId,
    textileFee: fx.fee,
  });
  res.json({
    credit,
    channel: txHash,
    owner: found.from,
    creditedUSDT: Number(fx.bought) / 1e6,
    currency: found.tok.symbol,
    textileTx: fx.txHash,
    voucher: { domain: channelDomain(account.address), types: channelTypes, note: 'sign Voucher{channel, cumulative} with the depositing wallet for each call' },
    note: 'Two ways to spend: a signed cumulative voucher per call on /channel/:channel/call/:service, or the bearer credit token (shown once).',
  });
}));

// ---- FX channels: signed cumulative vouchers, one Textile fill to open, one to close ----

app.get('/channel/:id', wrap(async (req, res) => {
  const ch = ledger.channel(req.params.id);
  if (!ch) return res.status(404).json({ error: 'unknown channel' });
  const { credit, ...pub } = ch;
  res.json({ channel: req.params.id, ...pub, remaining: (BigInt(ch.credited) - BigInt(ch.spent)).toString() });
}));

app.post('/channel/:id/call/:service', wrap(async (req, res) => {
  const id = req.params.id.toLowerCase();
  const ch = ledger.channel(id);
  if (!ch) return res.status(404).json({ error: 'unknown channel' });
  const svc = (await services()).find((s) => s.id === req.params.service);
  if (!svc) return res.status(404).json({ error: 'unknown service' });
  const header = req.headers['x-voucher'];
  const expected = (BigInt(ch.spent) + BigInt(svc.atomic)).toString();
  if (!header) {
    // A 402 that names the exact voucher to sign, like an x402 challenge.
    return res.status(402).json({ error: 'voucher required', channel: id, cumulative: expected, priceAtomic: svc.atomic, domain: channelDomain(account.address), types: { Voucher: channelTypes.Voucher } });
  }
  const v = decodeVoucher(header);
  const ok = await verifyVoucher({ gateway: account.address, owner: ch.owner, channel: id, cumulative: v.cumulative, signature: v.signature });
  if (!ok) return res.status(401).json({ error: 'voucher not signed by the channel owner' });
  ledger.draw(id, v.cumulative, svc.atomic, { service: svc.id, usd: svc.usd });
  try {
    const r = await pay(account, svc.url, { method: svc.method, body: req.body, symbol: 'USDT', maxAtomic: svc.atomic });
    if (!r.paid) throw Object.assign(new Error(`upstream answered ${r.status}: ${(r.body || '').slice(0, 300)}`), { status: 502 });
    let body;
    try { body = JSON.parse(r.body); } catch { body = r.body; }
    res.json({ service: svc.id, channel: id, cumulative: v.cumulative, paidUSDT: Number(r.priceAtomic) / 1e6, settlement: r.receipt?.transaction || r.receipt, result: body });
  } catch (e) {
    ledger.undraw(id, svc.atomic); // the voucher's total is not spent if the service failed
    throw e;
  }
}));

app.post('/channel/:id/close', wrap(async (req, res) => {
  const id = req.params.id.toLowerCase();
  const ch = ledger.channel(id);
  if (!ch) return res.status(404).json({ error: 'unknown channel' });
  const { cumulative, signature } = req.body || {};
  if (String(cumulative) !== ch.spent) return res.status(409).json({ error: `close must carry cumulative ${ch.spent}` });
  const ok = await verifyVoucher({ gateway: account.address, owner: ch.owner, channel: id, cumulative, signature, kind: 'Close' });
  if (!ok) return res.status(401).json({ error: 'close not signed by the channel owner' });
  const remaining = BigInt(ch.credited) - BigInt(ch.spent);
  let refund = { remainingUSDT: Number(remaining) / 1e6 };
  if (remaining > 0n) {
    // Send the rest back in the owner's own currency when Textile can fill it; else in USD₮.
    try {
      if (remaining < 1_000_000n) throw new Error('below Textile minimum');
      const fx = await convert(account, { from: 'USDT', to: ch.currency, sellAmount: remaining });
      const sent = await transferTagged(account, TOKENS[ch.currency].address, ch.owner, BigInt(fx.bought));
      refund = { ...refund, currency: ch.currency, amount: fx.bought, textileTx: fx.txHash, refundTx: sent.transactionHash };
    } catch (e) {
      const sent = await transferTagged(account, TOKENS.USDT.address, ch.owner, remaining);
      refund = { ...refund, currency: 'USDT', amount: remaining.toString(), refundTx: sent.transactionHash, why: e.message };
    }
  }
  ledger.closeChannel(id, { refund });
  res.json({ channel: id, spentUSDT: Number(ch.spent) / 1e6, calls: ch.calls, refund });
}));

// Unlock codes: pay once in local currency, hand out codes; a code spends with no wallet at all.
app.post('/unlock-codes', wrap(async (req, res) => {
  const count = Math.min(Math.max(parseInt(req.body?.count, 10) || 1, 1), 50);
  const eachUSDT = Number(req.body?.eachUSDT || 0.1);
  if (!(eachUSDT >= 0.01 && eachUSDT <= 20)) return res.status(400).json({ error: 'eachUSDT must be between 0.01 and 20' });
  const codes = ledger.mintCodes(bearer(req), count, BigInt(Math.round(eachUSDT * 1e6)));
  res.json({ codes, eachUSDT, how: 'Send the code to anyone. They call POST /call/:service with Authorization: Bearer <code>, or use it from the MCP server. No wallet, account or ID needed.' });
}));

app.get('/balance', wrap(async (req, res) => {
  const b = ledger.balance(bearer(req));
  if (!b) return res.status(401).json({ error: 'unknown credit token' });
  res.json({ balanceUSDT: Number(b.balance) / 1e6 });
}));

app.post('/call/:id', wrap(async (req, res) => {
  const token = bearer(req);
  const svc = (await services()).find((s) => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: 'unknown service' });
  ledger.debit(token, svc.atomic, { service: svc.id, usd: svc.usd });
  try {
    const r = await pay(account, svc.url, { method: svc.method, body: req.body, symbol: 'USDT', maxAtomic: svc.atomic });
    if (!r.paid) throw Object.assign(new Error(`upstream answered ${r.status}: ${(r.body || '').slice(0, 300)}`), { status: 502 });
    let body;
    try { body = JSON.parse(r.body); } catch { body = r.body; }
    res.json({ service: svc.id, paidUSDT: Number(r.priceAtomic) / 1e6, payTo: r.payTo, settlement: r.receipt, result: body });
  } catch (e) {
    ledger.refund(token, svc.atomic);
    throw e;
  }
}));

app.get('/history', (req, res) => res.json(ledger.history()));

const port = Number(process.env.PORT || 4020);
app.listen(port, () => console.log(`Local402 gateway ${account.address} on :${port}`));
