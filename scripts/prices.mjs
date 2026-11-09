// Read-only: live rates and a few services priced in each local currency. Sends nothing.
import { ratesPerUsd, services } from '../src/catalog.mjs';

const { asOf, rates } = await ratesPerUsd();
console.log('Textile levels as of', asOf);
for (const [sym, r] of Object.entries(rates)) {
  console.log(sym.padEnd(5), r ? `${r.perUsd.toFixed(2)} per USD₮ · min deposit ${r.minDepositLocal.toFixed(2)} · max ${r.maxDepositLocal.toFixed(0)}` : 'no depth');
}
const list = await services();
console.log(`\n${list.length} services payable in USD₮ through buy; for example:`);
for (const s of list.filter((x) => /^(x\.posts\.search|flights\.search|reddit\.posts\.search)$|chainstack|cencori/.test(x.id)).slice(0, 6)) {
  const local = Object.entries(rates).map(([k, r]) => (r ? ` · ${(Number(s.usd) * r.perUsd).toFixed(2)} ${k}` : '')).join('');
  console.log(`- ${s.id}: $${s.usd}${local}`);
}
