// Minimal x402 "exact" client for Celo: signs an EIP-3009 transferWithAuthorization in USD₮
// and retries the request with X-PAYMENT. The seller's facilitator settles and pays gas.
// The payer is the buyer's own wallet (a key, an Unlock code's key, or MiniPay): it signs the
// authorization straight to the seller's payTo. Node or browser.
import { CHAIN_ID, TOKENS } from './config.mjs';
import { toSigner, randomHex32, b64, unb64 } from './tx.mjs';

export async function quote(url, { method = 'POST', body, headers = {} } = {}) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  if (res.status !== 402) return { free: true, status: res.status, body: await res.text() };
  const offer = await res.json();
  return { free: false, offer };
}

export function pickOffer(offer, symbol = 'USDT') {
  const t = TOKENS[symbol];
  return (offer.accepts || []).find((a) => a.scheme === 'exact' && (a.network === 'celo' || a.network === `eip155:${CHAIN_ID}`) && a.asset.toLowerCase() === t.address.toLowerCase());
}

/** Pay an x402 resource from `account` in `symbol` (USDT by default), capped at maxAtomic. */
export async function pay(signerLike, url, { method = 'POST', body, headers = {}, symbol = 'USDT', maxAtomic }) {
  const account = toSigner(signerLike);
  const first = await quote(url, { method, body, headers });
  if (first.free) return { paid: false, status: first.status, body: first.body };
  const req = pickOffer(first.offer, symbol);
  if (!req) throw new Error(`seller offers no ${symbol} on Celo`);
  const amount = BigInt(req.maxAmountRequired ?? req.amount);
  if (maxAtomic !== undefined && amount > BigInt(maxAtomic)) throw new Error(`price ${amount} above cap ${maxAtomic}`);
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address, to: req.payTo, value: amount.toString(),
    validAfter: String(now - 60), validBefore: String(now + (req.maxTimeoutSeconds || 60)),
    nonce: randomHex32(),
  };
  const t = TOKENS[symbol];
  const signature = await account.signTypedData({
    domain: { name: req.extra?.name || t.eip3009.name, version: req.extra?.version || t.eip3009.version, chainId: CHAIN_ID, verifyingContract: req.asset },
    types: { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] },
    primaryType: 'TransferWithAuthorization',
    message: { ...authorization, value: amount, validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
  });
  const xPayment = b64(JSON.stringify({ x402Version: 1, scheme: 'exact', network: req.network, payload: { signature, authorization } }));
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-PAYMENT': xPayment, ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let receipt = null;
  const pr = res.headers.get('x-payment-response') || res.headers.get('payment-response');
  if (pr) { try { receipt = JSON.parse(unb64(pr)); } catch { receipt = pr; } }
  return { paid: res.ok, status: res.status, priceAtomic: amount.toString(), payTo: req.payTo, receipt, body: text };
}
