// Local402: pay for any x402 agent service in your own currency.
// 1. GET  /catalog?currency=wARS   services priced in pesos, reais or naira (Textile levels)
// 2. send wARS / wBRL / wCOP / cNGN to the gateway wallet on Celo
// 3. POST /deposit {txHash}          the gateway converts it to USD₮ on Textile FX, returns a credit token
// 4. POST /call/:serviceId           the gateway pays the service over x402 and returns its answer
import express from 'express';
import { decodeEventLog, erc20Abi } from 'viem';
import { LOCAL, tokenByAddress, ATTRIBUTION_CODE } from './config.mjs';
import { publicClient, loadAccount } from './chain.mjs';
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
  if (!found) return res.status(400).json({ error: `no ${LOCAL.join('/')} transfer to ${account.address} in that transaction` });
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
    creditedUSDT: Number(fx.bought) / 1e6,
    currency: found.tok.symbol,
    textileTx: fx.txHash,
    note: 'Keep the credit token: it is shown once.',
  });
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
