// Free: read Sippar's catalogue and one product's 402, and print what a Celo payment would be. Sends nothing.
// Usage: node scripts/sippar-quote.mjs [product-id] [json-input]
import { sipparProducts, SIPPAR } from '../src/sippar.mjs';

const id = process.argv[2] || 'reddit-social';
const products = await sipparProducts();
console.log(`${SIPPAR}: ${products.length} products payable on Celo`);
const p = products.find((x) => x.id === `sippar.${id}`);
if (!p) { console.log(`no Celo-payable product ${id}`); process.exit(products.length ? 1 : 2); }
const input = process.argv[3] ? JSON.parse(process.argv[3]) : p.example || {};
const r = await fetch(p.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
const j = await r.json().catch(() => ({}));
const celo = (j.rails || []).find((x) => x.rail === 'celo-x402');
console.log(JSON.stringify({ product: p.id, status: r.status, listUSD: p.usd, celo: celo?.paymentRequirements || null }, null, 2));
