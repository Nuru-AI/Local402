// Sippar (sippar.network) as an external service, alongside buy. Sippar's shop sells data and AI per call and takes
// two kinds of Celo payment:
//
//   1. `celo-x402-exact`, the standard x402 "exact" scheme: the 402's accepts[] carries one entry per token on
//      eip155:42220 (USD₮, USA₮, USDC). The agent signs ONE EIP-3009 authorization and pays no gas; Celo's facilitator
//      (x402.celo.org) settles it. Preferred, USD₮ first, because the agent already holds USD₮: no exchange at all.
//   2. `celo-x402`, the raw-transfer fallback: the agent sends ONE tagged USDC transfer to the pay-to the 402 names,
//      then retries with `X-PAYMENT: eip155:42220:<tx>`. Used only when Sippar offers no signed Celo entry, or the
//      wallet holds none of those tokens, or Sippar refused the signed payment before settling it.
//
// For the fallback, USDC comes from a small float: when the float is short, ONE Textile fill (USD₮ to USDC, at least
// about $1) refills it, and the next calls pay from it with no exchange at all.
import crypto from 'node:crypto';
import { parseUnits, toHex } from 'viem';
import { TOKENS, CHAIN_ID } from './config.mjs';
import { balanceOf, transferTagged, toSigner } from './tx.mjs';
import { convertExactOut } from './textile.mjs';

export const SIPPAR = (process.env.SIPPAR_URL || 'https://sippar.network').replace(/\/$/, '');
const SELL = `${SIPPAR}/api/sippar/sell`;
const RAIL = 'celo-x402';
const SIGNED_RAIL = 'celo-x402-exact';
const NETWORK = `eip155:${CHAIN_ID}`;
// The tokens tried for a signed payment, in order. USD₮ first: it is what this agent holds.
const SIGNED_ORDER = (process.env.SIPPAR_CELO_TOKENS || 'USDT,USAT,USDC').split(',').map((s) => s.trim()).filter((s) => TOKENS[s]);
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
  // Only offered when Sippar's shop lists a Celo rail; otherwise there is no way to pay it from here.
  const onCelo = (data?.payment?.rails || []).some((r) => r.rail === RAIL || r.rail === SIGNED_RAIL);
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

/** Sippar's live Celo terms for one call, from its 402 (free). */
export async function sipparTerms(product, input) {
  const first = await post(product.url, input);
  if (first.res.status !== 402) return { free: true, status: first.res.status };
  const req = (first.json?.rails || []).find((r) => r.rail === RAIL)?.paymentRequirements;
  if (!req) throw new Error('Sippar offers no Celo payment for this product right now');
  return { scheme: 'celo-x402 (one tagged USDC transfer from the buyer, presented as eip155:42220:<tx>)', network: req.network, asset: req.asset, symbol: 'USDC', payTo: req.payTo, amount: String(req.amount) };
}

/** Keep at least `need` USDC in the wallet, refilling the float from USD₮ in one Textile fill when short. */
async function ensureUsdc(signerLike, need) {
  const account = toSigner(signerLike);
  const have = await balanceOf(TOKENS.USDC.address, account.address);
  if (have >= need) return null;
  const target = parseUnits(FLOAT_USDC.toFixed(6), 6);
  const buyAmount = (need - have) > target ? (need - have) : target;
  return convertExactOut(account, { from: 'USDT', to: 'USDC', buyAmount });
}

/**
 * The signed Celo entry to pay, in SIGNED_ORDER, that this wallet can cover: `{ symbol, req }`, or null. Only an
 * entry whose EIP-712 domain matches this agent's own record of the token is taken: a 402 naming another domain for
 * the same address is not signed.
 */
async function pickSigned(account, accepts) {
  for (const symbol of SIGNED_ORDER) {
    const t = TOKENS[symbol];
    const req = (accepts || []).find((a) => a?.scheme === 'exact' && a.network === NETWORK && String(a.asset).toLowerCase() === t.address.toLowerCase());
    if (!req || req.extra?.name !== t.eip3009?.name || req.extra?.version !== t.eip3009?.version) continue;
    if (await balanceOf(t.address, account.address) >= BigInt(req.amount)) return { symbol, req };
  }
  return null;
}

/** An x402 v2 PaymentPayload for one "exact" requirement on Celo: an EIP-3009 transferWithAuthorization, base64. */
async function signExact(account, req, resource) {
  const now = Math.floor(Date.now() / 1000);
  const value = BigInt(req.amount);
  const authorization = {
    from: account.address, to: req.payTo, value: value.toString(),
    validAfter: String(now - 60), validBefore: String(now + (req.maxTimeoutSeconds || 300)),
    nonce: toHex(crypto.randomBytes(32)),
  };
  const signature = await account.signTypedData({
    domain: { name: req.extra.name, version: req.extra.version, chainId: CHAIN_ID, verifyingContract: req.asset },
    types: { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] },
    primaryType: 'TransferWithAuthorization',
    message: { ...authorization, value, validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
  });
  return Buffer.from(JSON.stringify({ x402Version: 2, resource, accepted: req, payload: { signature, authorization } })).toString('base64');
}

/** Present a payment, and once more when Sippar says the payment is still good (a failure that spent nothing). */
async function present(url, input, headers) {
  let r = await post(url, input, headers);
  if (!r.res.ok && r.json?.paymentReusable) {
    await new Promise((ok) => setTimeout(ok, Math.min(Number(r.res.headers.get('retry-after') || 5), 10) * 1000));
    r = await post(url, input, headers);
  }
  return r;
}

/**
 * Buy one Sippar product call on Celo. Reads the price from Sippar's 402 (it can depend on the request) and refuses
 * above `maxAtomic`. Pays with a signed "exact" authorization when Sippar offers one in a token this wallet holds;
 * otherwise, or when Sippar refuses the signed payment before settling it (a 402 or 503: nothing moved), pays one
 * tagged USDC transfer on the raw rail. A failed call is presented again with the SAME payment, never a new one:
 * Sippar keeps an unused payment re-presentable, so a failed call is not paid twice and not lost.
 */
export async function paySippar(signerLike, product, input, { maxAtomic } = {}) {
  const account = toSigner(signerLike);
  const url = product.url;
  const first = await post(url, input);
  if (first.res.status !== 402) return { paid: false, status: first.res.status, body: first.text };
  const capped = (amount) => { if (maxAtomic !== undefined && amount > BigInt(maxAtomic)) throw new Error(`Sippar price ${amount} above cap ${maxAtomic}`); };

  const signed = await pickSigned(account, first.json?.accepts);
  let signedRefusal = null;
  if (signed) {
    capped(BigInt(signed.req.amount));
    const resource = first.json?.resource || { url };
    const payment = await signExact(account, signed.req, resource);
    const r = await present(url, input, { 'PAYMENT-SIGNATURE': payment });
    // 402/503 from a signed attempt means Sippar refused it before settling: the authorization was never used.
    if (r.res.ok || ![402, 503].includes(r.res.status)) {
      const tx = r.json?.data?.paymentTx || r.json?.paymentTx || null;
      return { paid: r.res.ok, status: r.res.status, rail: SIGNED_RAIL, token: signed.symbol, priceAtomic: signed.req.amount, payTo: signed.req.payTo, tx, body: r.text };
    }
    signedRefusal = `${r.res.status} ${(r.json?.error || r.text || '').slice(0, 200)}`;
  }

  const rail = (first.json?.rails || []).find((x) => x.rail === RAIL);
  const req = rail?.paymentRequirements;
  if (!req) throw new Error(`Sippar offers no Celo payment for this product right now${signedRefusal ? ` (signed payment refused: ${signedRefusal})` : ''}`);
  if (req.network !== NETWORK || req.asset.toLowerCase() !== TOKENS.USDC.address.toLowerCase()) {
    throw new Error(`unexpected Celo requirements: ${req.network} ${req.asset}`);
  }
  const amount = BigInt(req.amount);
  capped(amount);
  const fx = await ensureUsdc(account, amount);
  const sent = await transferTagged(account, TOKENS.USDC.address, req.payTo, amount);
  const tx = sent.transactionHash;
  const proof = `eip155:${CHAIN_ID}:${tx}`;
  const r = await present(url, input, { 'X-PAYMENT': proof });
  return { paid: r.res.ok, status: r.res.status, rail: RAIL, token: 'USDC', priceAtomic: amount.toString(), payTo: req.payTo, tx, proof, textileRefill: fx, ...(signedRefusal ? { signedRefusal } : {}), body: r.text };
}

// For scripts/sippar-signed-check.mjs: build and check a signed payment without paying.
export const _internal = { pickSigned, signExact };
