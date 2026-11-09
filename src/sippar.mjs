// Sippar (sippar.network) as an external service, alongside buy. Sippar's shop sells data and AI per call
// and takes Celo's native USDC on its `celo-x402` rail: the agent sends ONE tagged USDC transfer to the pay-to
// the 402 names, then retries with `X-PAYMENT: eip155:42220:<tx>`. Sippar verifies the transfer on Celo and answers.
//
// USDC comes from a small float, the same idea as the FX channel: when the float is short, ONE Textile fill
// (USD₮ to USDC, at least about $1) refills it, and the next calls pay from it with no exchange at all.
import { parseUnits } from 'viem';
import { TOKENS, CHAIN_ID } from './config.mjs';
import { balanceOf, transferTagged } from './chain.mjs';
import { convertExactOut } from './textile.mjs';

export const SIPPAR = (process.env.SIPPAR_URL || 'https://sippar.network').replace(/\/$/, '');
const SELL = `${SIPPAR}/api/sippar/sell`;
const RAIL = 'celo-x402';
// USDC bought per refill: Textile's minimum is about $1, so a refill never buys less.
const FLOAT_USDC = Number(process.env.SIPPAR_USDC_FLOAT || '1.05');
export const PREFIX = 'sippar.';

let cache = { at: 0, products: [] };

/** Sippar's products that can be paid on Celo, with ids prefixed `sippar.` so they sit beside buy's. */
export async function sipparProducts() {
  if (Date.now() - cache.at < 10 * 60_000 && cache.products.length) return cache.products;
  const res = await fetch(`${SELL}/catalog`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Sippar catalog answered ${res.status}`);
  const { data } = await res.json();
  // Only offered when Sippar's shop lists the Celo rail; otherwise there is no way to pay it from here.
  const onCelo = (data?.payment?.rails || []).some((r) => r.rail === RAIL);
  const products = !onCelo ? [] : (data.products || []).map((p) => ({
    id: PREFIX + p.id,
    method: p.method || 'POST',
    url: p.url || `${SELL}/${p.id}`,
    usd: String(p.priceUSD),
    atomic: String(Math.round(Number(p.priceUSD) * 1e6)),
    description: p.description || p.summary || p.name || '',
    example: p.input,
    provider: 'sippar',
  }));
  cache = { at: Date.now(), products };
  return products;
}

export const isSippar = (id) => typeof id === 'string' && id.startsWith(PREFIX);

async function post(url, body, headers = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { res, text, json };
}

/** Keep at least `need` USDC in the wallet, refilling the float from USD₮ in one Textile fill when short. */
async function ensureUsdc(account, need) {
  const have = await balanceOf(TOKENS.USDC.address, account.address);
  if (have >= need) return null;
  const target = parseUnits(FLOAT_USDC.toFixed(6), 6);
  const buyAmount = (need - have) > target ? (need - have) : target;
  return convertExactOut(account, { from: 'USDT', to: 'USDC', buyAmount });
}

/**
 * Buy one Sippar product call on Celo. Reads the price from Sippar's 402 (it can depend on the request),
 * refuses above `maxAtomic`, pays one tagged USDC transfer, presents it, and returns the answer.
 * If the answer fails after paying, the same tx is presented once more: Sippar keeps an unused payment
 * re-presentable, so a failed call is not paid twice and not lost.
 */
export async function paySippar(account, product, input, { maxAtomic } = {}) {
  const url = product.url;
  const first = await post(url, input);
  if (first.res.status !== 402) return { paid: false, status: first.res.status, body: first.text };
  const rail = (first.json?.rails || []).find((r) => r.rail === RAIL);
  const req = rail?.paymentRequirements;
  if (!req) throw new Error('Sippar offers no Celo payment for this product right now');
  if (req.network !== `eip155:${CHAIN_ID}` || req.asset.toLowerCase() !== TOKENS.USDC.address.toLowerCase()) {
    throw new Error(`unexpected Celo requirements: ${req.network} ${req.asset}`);
  }
  const amount = BigInt(req.amount);
  if (maxAtomic !== undefined && amount > BigInt(maxAtomic)) throw new Error(`Sippar price ${amount} above cap ${maxAtomic}`);
  const fx = await ensureUsdc(account, amount);
  const sent = await transferTagged(account, TOKENS.USDC.address, req.payTo, amount);
  const tx = sent.transactionHash;
  const proof = `eip155:${CHAIN_ID}:${tx}`;
  let r = await post(url, input, { 'X-PAYMENT': proof });
  if (!r.res.ok && r.json?.paymentReusable) {
    await new Promise((ok) => setTimeout(ok, Math.min(Number(r.res.headers.get('retry-after') || 5), 10) * 1000));
    r = await post(url, input, { 'X-PAYMENT': proof });
  }
  return { paid: r.res.ok, status: r.res.status, priceAtomic: amount.toString(), payTo: req.payTo, tx, proof, textileRefill: fx, body: r.text };
}
