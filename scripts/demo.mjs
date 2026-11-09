// End-to-end demo on Celo mainnet, every transaction tagged:
//   a buyer holding USD₮ gets local currency on Textile (as a LatAm user would already hold it),
//   pays the gateway in that currency, the gateway converts it back on Textile,
//   and the buyer spends the credit on real services from buy's catalogue.
// Usage: GATEWAY_URL=http://localhost:4020 CURRENCY=wARS USD=1.2 node scripts/demo.mjs
import fs from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseUnits } from 'viem';
import { TOKENS } from '../src/config.mjs';
import { balanceOf, transferTagged, loadAccount } from '../src/chain.mjs';
import { convert } from '../src/textile.mjs';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4020';
const CURRENCY = process.env.CURRENCY || 'wARS';
const USD = process.env.USD || '1.2';
const BUYER_KEY = process.env.BUYER_KEY_FILE || 'buyer.key';

if (!fs.existsSync(BUYER_KEY)) fs.writeFileSync(BUYER_KEY, generatePrivateKey(), { mode: 0o600 });
const buyer = privateKeyToAccount(fs.readFileSync(BUYER_KEY, 'utf8').trim());
const info = await (await fetch(GATEWAY_URL)).json();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

log('gateway', info.gateway, '· buyer', buyer.address);
let usdt = await balanceOf(TOKENS.USDT.address, buyer.address);
const need = parseUnits(USD, 6) + 50_000n; // the swap plus a little USD₮ for gas (fee abstraction)
if (usdt < need && process.env.FUND_FROM_GATEWAY === '1') {
  // Demo only: the buyer wallet is ours and is funded by us, so it is NOT an independent user.
  const f = await transferTagged(loadAccount(), TOKENS.USDT.address, buyer.address, need - usdt);
  log('funded demo buyer from gateway', f.transactionHash);
  usdt = await balanceOf(TOKENS.USDT.address, buyer.address);
}
log('buyer USD₮', Number(usdt) / 1e6);

// 1. Buyer acquires local currency on Textile (one firm-quote fill).
const spend = parseUnits(USD, 6);
const toLocal = await convert(buyer, { from: 'USDT', to: CURRENCY, sellAmount: spend });
log(`Textile fill: ${USD} USD₮ -> ${CURRENCY}`, toLocal.txHash);

// 2. Buyer pays the gateway in local currency (tagged transfer).
const local = await balanceOf(TOKENS[CURRENCY].address, buyer.address);
const pay = await transferTagged(buyer, TOKENS[CURRENCY].address, info.gateway, local);
log(`paid gateway ${Number(local) / 10 ** TOKENS[CURRENCY].decimals} ${CURRENCY}`, pay.transactionHash);

// 3. Gateway converts it on Textile and credits the buyer.
const dep = await (await fetch(`${GATEWAY_URL}/deposit`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: pay.transactionHash }),
})).json();
log('deposit', JSON.stringify({ ...dep, credit: dep.credit ? `${dep.credit.slice(0, 10)}…` : undefined }));
if (!dep.credit) process.exit(1);

// 4. Buyer spends the credit on services the gateway does not own.
const calls = [
  ['x.posts.search', { query: 'celo stablecoins latam' }],
  ['chainstack.celo', [{ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }]],
];
for (const [id, body] of calls) {
  const r = await (await fetch(`${GATEWAY_URL}/call/${id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dep.credit}` }, body: JSON.stringify(body),
  })).json();
  log(`call ${id}`, r.error ? `ERROR ${r.error}` : `paid ${r.paidUSDT} USD₮ to ${r.payTo} · settlement ${JSON.stringify(r.settlement)?.slice(0, 140)}`);
}
const bal = await (await fetch(`${GATEWAY_URL}/balance`, { headers: { Authorization: `Bearer ${dep.credit}` } })).json();
log('remaining credit', bal);
