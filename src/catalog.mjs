// The services a buyer can reach, priced in their own currency from Textile's live ladder.
import { BUY_GATEWAY, TOKENS, LOCAL } from './config.mjs';
import { levels } from './textile.mjs';
import { pay, quote as probe402, pickOffer } from './x402.mjs';
import { sipparProducts, isSippar, paySippar, sipparTerms } from './sippar.mjs';

let cache = { at: 0, services: [] };

/** buy's Celo catalogue (Chainstack, Cencori, Apify, TikHub, Google Cloud and more), then Sippar's products. */
export async function services() {
  if (Date.now() - cache.at < 10 * 60_000 && cache.services.length) return cache.services;
  const res = await fetch(`${BUY_GATEWAY}/v1/catalog`, { signal: AbortSignal.timeout(20_000) });
  const cat = await res.json();
  const list = (cat.capabilities || [])
    .filter((c) => c.price?.usd && (c.price.tokens || []).includes('USDT'))
    .map((c) => ({ id: c.id, method: c.method || 'POST', url: c.url || c.path || c.resource, usd: c.price.usd, atomic: c.price.atomic, description: c.description || c.summary || '', schema: c.inputSchema, provider: 'buy' }));
  // Sippar's products, paid in USDC on Celo (src/sippar.mjs). A Sippar outage never hides buy's catalogue.
  let sippar = [];
  try { sippar = await sipparProducts(); } catch (e) { console.warn('Sippar catalog unavailable:', e.message); }
  const all = [...list, ...sippar];
  cache = { at: Date.now(), services: all };
  return all;
}

export async function findService(id) {
  const svc = (await services()).find((s) => s.id === id);
  if (!svc) throw Object.assign(new Error(`unknown service ${id}`), { status: 404 });
  return svc;
}

/**
 * The seller's own live payment terms, read from its 402 for free: who gets paid (payTo), in which
 * token, how much. The buyer's wallet pays exactly this address; nothing passes through Local402.
 */
export async function sellerTerms(svc, input) {
  if (isSippar(svc.id)) return sipparTerms(svc, input);
  const first = await probe402(svc.url, { method: svc.method, body: input ?? sampleInput(svc) });
  if (first.free) {
    if (first.status < 400) return { free: true, status: first.status };
    // The seller checks the request before quoting; fall back to the catalogue's price.
    return { symbol: 'USDT', amount: String(svc.atomic), payTo: null, from: 'catalogue', note: `the seller answered ${first.status} to the probe; pass the real input to read its live payTo` };
  }
  const req = pickOffer(first.offer, 'USDT');
  if (!req) throw new Error(`${svc.id}: the seller offers no USD₮ payment on Celo`);
  return {
    scheme: 'x402 exact (EIP-3009, settled by the seller\'s facilitator)', network: req.network,
    asset: req.asset, symbol: 'USDT', payTo: req.payTo, amount: String(req.maxAmountRequired ?? req.amount),
  };
}

/** A minimal request that passes a seller's schema check, so its 402 can be read for free. */
export function sampleInput(svc) {
  if (svc.example) return svc.example;
  if (svc.id.startsWith('chainstack.')) return [{ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }];
  const schema = svc.schema;
  if (!schema?.properties) return {};
  const out = {};
  for (const k of schema.required || []) {
    const p = schema.properties[k] || {};
    out[k] = p.enum ? p.enum[0] : p.type === 'number' || p.type === 'integer' ? (p.minimum ?? 1) : p.type === 'array' ? [] : p.type === 'object' ? {} : 'celo';
  }
  return out;
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
