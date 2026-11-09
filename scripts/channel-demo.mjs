// FX channel on mainnet: open with one Textile fill, draw N calls with signed vouchers, close with one
// Textile fill back to the buyer's own currency.
// Usage: GATEWAY_URL=http://localhost:4020 CURRENCY=wARS TOPUP_USD=1.3 CALLS=4 node scripts/channel-demo.mjs
import fs from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { parseUnits } from 'viem';
import { TOKENS } from '../src/config.mjs';
import { balanceOf, transferTagged, loadAccount } from '../src/chain.mjs';
import { convert } from '../src/textile.mjs';
import { signVoucher, encodeVoucher } from '../src/channel.mjs';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4020';
const CURRENCY = process.env.CURRENCY || 'wARS';
const TOPUP_USD = process.env.TOPUP_USD || '0';
const CALLS = Number(process.env.CALLS || 4);
const buyer = privateKeyToAccount(fs.readFileSync(process.env.BUYER_KEY_FILE || 'buyer.key', 'utf8').trim());
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const post = async (path, body, headers = {}) => (await fetch(`${GATEWAY_URL}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
})).json();
const info = await (await fetch(GATEWAY_URL)).json();
const tok = TOKENS[CURRENCY];

// Optional top-up so the channel is worth opening (demo only; this buyer is our own wallet).
let expectLocal = 1n;
if (Number(TOPUP_USD) > 0) {
  const before = await balanceOf(tok.address, buyer.address);
  const want = parseUnits(TOPUP_USD, 6) + 30_000n;
  const have = await balanceOf(TOKENS.USDT.address, buyer.address);
  if (have < want) {
    const f = await transferTagged(loadAccount(), TOKENS.USDT.address, buyer.address, want - have);
    log('demo top-up to buyer', f.transactionHash);
  }
  const fx = await convert(buyer, { from: 'USDT', to: CURRENCY, sellAmount: parseUnits(TOPUP_USD, 6) });
  log(`buyer buys ${CURRENCY} on Textile`, fx.txHash);
  expectLocal = before + BigInt(fx.bought);
}
let local = 0n;
for (let i = 0; i < 20 && local < expectLocal; i++) { local = await balanceOf(tok.address, buyer.address); if (local < expectLocal) await new Promise((r) => setTimeout(r, 1500)); }
log(`buyer holds ${Number(local) / 10 ** tok.decimals} ${CURRENCY}`);

// OPEN: one transfer + one Textile fill.
const pay = await transferTagged(buyer, tok.address, info.gateway, local);
log('open: pay gateway', pay.transactionHash);
const dep = await post('/deposit', { txHash: pay.transactionHash });
if (!dep.channel) { log('deposit failed', dep); process.exit(1); }
log(`open: channel ${dep.channel.slice(0, 12)}… credited ${dep.creditedUSDT} USD₮ (Textile ${dep.textileTx})`);

// DRAW: each call is one signed voucher; no transaction, no FX.
const plan = ['x.posts.search', 'reddit.posts.search', 'chainstack.celo', 'x.posts.search', 'reddit.posts.search', 'chainstack.celo'].slice(0, CALLS);
const bodies = {
  'x.posts.search': { query: `${CURRENCY} stablecoin` },
  'reddit.posts.search': { query: 'agents paying in local currency' },
  'chainstack.celo': [{ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }],
};
for (const svc of plan) {
  const challenge = await post(`/channel/${dep.channel}/call/${svc}`, bodies[svc]); // 402 names the voucher
  const signature = await signVoucher(buyer, info.gateway, dep.channel, challenge.cumulative);
  const r = await post(`/channel/${dep.channel}/call/${svc}`, bodies[svc], { 'X-Voucher': encodeVoucher({ cumulative: challenge.cumulative, signature }) });
  log(`draw ${svc}: voucher cumulative ${challenge.cumulative}`, r.error ? `ERROR ${r.error}` : `paid ${r.paidUSDT} · settlement ${r.settlement}`);
}

// CLOSE: one signed close, one Textile fill back to the buyer's currency, one transfer.
const ch = await (await fetch(`${GATEWAY_URL}/channel/${dep.channel}`)).json();
const closeSig = await signVoucher(buyer, info.gateway, dep.channel, ch.spent, 'Close');
const closed = await post(`/channel/${dep.channel}/close`, { cumulative: ch.spent, signature: closeSig });
log('close', JSON.stringify(closed));
