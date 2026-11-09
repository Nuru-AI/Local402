// Paid, on Celo mainnet: the agent buys Sippar products with USDC on Celo, refilling its USDC float from
// USD₮ in one Textile fill when short. Every transfer carries the attribution tag.
// Usage: ATTRIBUTION_CODE=... AGENT_KEY_FILE=agent.key node scripts/sippar-demo.mjs
import { loadAccount } from '../src/chain.mjs';
import { services, payService } from '../src/catalog.mjs';

const account = loadAccount();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const all = await services();
for (const [id, input] of [
  ['sippar.reddit-social', { query: 'pagos con stablecoins Argentina' }],
  ['sippar.news-search', { query: 'Celo stablecoins Latin America' }],
]) {
  const svc = all.find((s) => s.id === id);
  if (!svc) { log(`${id}: not payable on Celo right now`); continue; }
  const r = await payService(account, svc, input);
  log(`${id}: ${r.paid ? 'paid' : `FAILED ${r.status}`} ${Number(r.priceAtomic) / 1e6} USDC · tx ${r.tx}${r.textileRefill ? ` · USDC float refilled on Textile ${r.textileRefill.txHash}` : ''}`);
  if (r.paid) log('  ', r.body.slice(0, 300));
}
