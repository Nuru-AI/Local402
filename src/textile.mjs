// Textile FX taker client: preview, firm quote (keyless, proof of control), execute, report.
// Docs: https://docs.textilecredit.com/api/v2/rfq
// Runs in the buyer's own wallet: the taker is whoever signs. Node or browser.
import { decodeFunctionData, erc20Abi } from 'viem';
import { TEXTILE_API, CHAIN_ID, TOKENS } from './config.mjs';
import { ensureAllowance, sendTagged, toSigner, randomHex32 } from './tx.mjs';

async function post(path, body, headers = {}) {
  const res = await fetch(`${TEXTILE_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(75_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export async function levels() {
  const res = await fetch(`${TEXTILE_API}/rfq/levels?chainId=${CHAIN_ID}`, { signal: AbortSignal.timeout(20_000) });
  return (await res.json()).data;
}

/** Free indicative price. Exactly one of sellAmount / buyAmount (atomic strings). */
export async function preview({ sellToken, buyToken, sellAmount, buyAmount }) {
  const { status, json } = await post('/rfq/preview', { chainId: CHAIN_ID, sellToken, buyToken, ...(sellAmount ? { sellAmount } : { buyAmount }) });
  if (status !== 200) throw new Error(`textile preview ${status}: ${JSON.stringify(json.error || json)}`);
  return json.data;
}

async function takerProof(account) {
  const nonce = randomHex32();
  const issuedAt = Date.now();
  const signature = await account.signTypedData({
    domain: { name: 'Textile Taker Control', version: '1', chainId: CHAIN_ID },
    types: { TakerControl: [
      { name: 'taker', type: 'address' }, { name: 'chainId', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }, { name: 'issuedAt', type: 'uint256' },
    ] },
    primaryType: 'TakerControl',
    message: { taker: account.address, chainId: BigInt(CHAIN_ID), nonce, issuedAt: BigInt(issuedAt) },
  });
  return { nonce, issuedAt, signature };
}

/** Firm quote bound to the account. Sends unsigned first; signs proof of control only when asked. */
export async function firmQuote(signerLike, { sellToken, buyToken, sellAmount, buyAmount }) {
  const account = toSigner(signerLike);
  const body = { chainId: CHAIN_ID, sellToken, buyToken, taker: account.address, ...(sellAmount ? { sellAmount } : { buyAmount }) };
  let status;
  let json;
  let proof;
  for (let attempt = 0; attempt < 4; attempt++) {
    ({ status, json } = await post('/rfq/request', proof ? { ...body, takerProof: proof } : body));
    const d = json?.error?.details;
    if (status === 401 && d?.reason === 'proof_of_control_required') { proof = await takerProof(account); continue; }
    // A live earlier quote can still hold these funds; Textile says when they free up. Wait it out once.
    if (status === 400 && d?.reason === 'insufficient_funds' && d?.committed && d?.retryAfterMs <= 240_000) {
      await new Promise((r) => setTimeout(r, d.retryAfterMs + 2_000));
      proof = undefined;
      continue;
    }
    break;
  }
  if (status !== 200) throw new Error(`textile request ${status}: ${JSON.stringify(json.error || json)}`);
  return json.data; // status quoted | no_quote
}

/** Approve, re-check expiry, broadcast transactions.swap with our attribution tag, report the hash. */
export async function execute(account, q) {
  const { rfqId, claimToken, quote, transactions } = q;
  const sellToken = transactions.approval?.to || q.sellToken;
  // Approve exactly the address Textile's own approval names (reactor, or a vault's order executor).
  let spender = quote.spender || quote.reactor;
  if (transactions.approval?.data) {
    try { spender = decodeFunctionData({ abi: erc20Abi, data: transactions.approval.data }).args[0]; } catch { /* keep default */ }
  }
  await ensureAllowance(account, sellToken, spender, BigInt(quote.takerPays));
  if (Date.now() >= Date.parse(quote.expiresAt)) throw new Error('quote expired during approval; request a new one');
  // Keyless calls get no Textile tag, so the bytes are ours to suffix (one ERC-8021 tag, ours).
  let receipt;
  try {
    receipt = await sendTagged(account, { to: transactions.swap.to, data: transactions.swap.data, value: BigInt(transactions.swap.value || 0) });
  } catch (e) {
    await post(`/rfq/${rfqId}/cancel`, {}, { 'X-Rfq-Claim': claimToken }).catch(() => {});
    throw new Error(`Textile swap failed (${(e.shortMessage || e.message).slice(0, 160)}); rfq ${rfqId}`);
  }
  await post(`/rfq/${rfqId}/submit`, { txHash: receipt.transactionHash }, { 'X-Rfq-Claim': claimToken }).catch(() => {});
  return { txHash: receipt.transactionHash, sold: quote.takerPays, bought: quote.buyAmount, fee: quote.feeAmount, rfqId };
}

// A firm quote can fail at simulation when a maker's own funds moved after quoting
// (TRANSFER_FROM_FAILED). Nothing is broadcast; ask again (firmQuote waits out our reservation).
async function withRequote(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!/TRANSFER_FROM_FAILED|no quote \(no_valid_quote\)/.test(e.message)) throw e;
    }
  }
  throw last;
}

async function quoteAndExecute(account, from, to, amounts) {
  const q = await firmQuote(account, { sellToken: TOKENS[from].address, buyToken: TOKENS[to].address, ...amounts });
  if (q.status !== 'quoted') throw new Error(`Textile: no quote (${q.reason}); available ${q.availableBuyAmount ?? q.availableSellAmount ?? 'unknown'}`);
  q.sellToken = TOKENS[from].address;
  return execute(account, q);
}

/** Convert an exact amount of one token into another on Textile (exact input). */
export async function convert(account, { from, to, sellAmount }) {
  return withRequote(() => quoteAndExecute(account, from, to, { sellAmount: sellAmount.toString() }));
}

/** Receive exactly `buyAmount` of `to`, paying whatever `from` the makers ask (exact output). */
export async function convertExactOut(account, { from, to, buyAmount }) {
  return withRequote(() => quoteAndExecute(account, from, to, { buyAmount: buyAmount.toString() }));
}
