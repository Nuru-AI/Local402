// The services a buyer can reach, priced in their own currency from Textile's live ladder.
import { BUY_GATEWAY, TOKENS, LOCAL } from './config.mjs';
import { levels } from './textile.mjs';
import { pay } from './x402.mjs';
import { sipparProducts, isSippar, paySippar } from './sippar.mjs';

let cache = { at: 0, services: [] };

/** buy's Celo catalogue (Chainstack, Cencori, Apify, TikHub, Google Cloud and more), then Sippar's products. */
export async function services() {
  if (Date.now() - cache.at < 10 * 60_000 && cache.services.length) return cache.services;
  const res = await fetch(`${BUY_GATEWAY}/v1/catalog`, { signal: AbortSignal.timeout(20_000) });
  const cat = await res.json();
  const list = (cat.capabilities || [])
    .filter((c) => c.price?.usd && (c.price.tokens || []).includes('USDT'))
    .map((c) => ({ id: c.id, method: c.method || 'POST', url: c.url || c.path || c.resource, usd: c.price.usd, atomic: c.price.atomic, description: c.description || c.summary || '', provider: 'buy' }));
  // Sippar's products, paid in USDC on Celo (src/sippar.mjs). A Sippar outage never hides buy's catalogue.
  let sippar = [];
  try { sippar = await sipparProducts(); } catch (e) { console.warn('Sippar catalog unavailable:', e.message); }
  const all = [...list, ...sippar];
  cache = { at: Date.now(), services: all };
  return all;
}

/** Pay one call to a service from either catalogue: buy over x402 in USD₮, Sippar in USDC on its Celo rail. */
export async function payService(account, svc, body) {
  const r = isSippar(svc.id)
    ? await paySippar(account, svc, body, { maxAtomic: svc.atomic })
    : await pay(account, svc.url, { method: svc.method, body, symbol: 'USDT', maxAtomic: svc.atomic });
  return { ...r, settlement: r.tx || r.receipt?.transaction || r.receipt || null };
}

/** Local units per one USD₮, from the smallest firm level on the local → USD₮ ladder. */
export async function ratesPerUsd() {
  const data = await levels();
  const usdt = TOKENS.USDT.address.toLowerCase();
  const out = {};
  for (const sym of LOCAL) {
    const t = TOKENS[sym];
    const pair = data.pairs.find((p) => p.sellToken.toLowerCase() === t.address.toLowerCase() && p.buyToken.toLowerCase() === usdt);
    const lvl = pair?.levels?.[0];
    if (!lvl) { out[sym] = null; continue; }
    const local = Number(lvl.sellAmount) / 10 ** t.decimals;
    const usd = Number(lvl.buyAmount) / 1e6;
    out[sym] = { perUsd: local / usd, minDepositLocal: Number(pair.minSellAmount) / 10 ** t.decimals, maxDepositLocal: Number(pair.maxSellAmount) / 10 ** t.decimals };
  }
  return { asOf: data.asOf, rates: out };
}

export async function pricedCatalog(currency) {
  const [list, { asOf, rates }] = await Promise.all([services(), ratesPerUsd()]);
  const r = rates[currency];
  return {
    currency, asOf, ratePerUsd: r?.perUsd ?? null, source: 'Textile FX levels (indicative; the deposit converts at a firm quote)',
    services: list.map((s) => ({ ...s, local: r ? +(Number(s.usd) * r.perUsd).toFixed(2) : null })),
  };
}
