// Transactions from the buyer's own wallet, in Node or in a browser. A "signer" is either a viem
// local account (a key the buyer holds, or an Unlock code's key) or a viem wallet client over an
// injected wallet such as MiniPay or Valora. Local402 itself holds no key for anyone's money.
import { createPublicClient, createWalletClient, http, custom, concat, encodeFunctionData, erc20Abi, maxUint256, toHex } from 'viem';
import { celo } from 'viem/chains';
import { toDataSuffix } from '@celo/attribution-tags';
import { RPC_URL, USDT_FEE_ADAPTER, FEE_ADAPTER_SCALE, ATTRIBUTION_CODE } from './config.mjs';

export const publicClient = createPublicClient({ chain: celo, transport: http(RPC_URL) });

/** 32 random bytes as hex, from the platform's CSPRNG (Node 20+ and browsers both have it). */
export function randomHex32() {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

/** base64 of a UTF-8 string, without Buffer, so it runs in a browser too. */
export function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function unb64(s) {
  const bin = atob(s);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/**
 * One shape for every kind of wallet: { address, signTypedData(args), wallet }.
 * Accepts a viem local account, a viem wallet client with an account, or an already-normalised signer.
 */
export function toSigner(x) {
  if (!x) throw new Error('no wallet: pass a viem account or wallet client');
  if (x.__local402Signer) return x;
  if (x.type === 'local') {
    const wallet = createWalletClient({ account: x, chain: celo, transport: http(RPC_URL) });
    return { __local402Signer: true, address: x.address, signTypedData: (a) => x.signTypedData(a), wallet };
  }
  if (x.account && typeof x.sendTransaction === 'function') {
    return { __local402Signer: true, address: x.account.address, signTypedData: (a) => x.signTypedData({ account: x.account, ...a }), wallet: x };
  }
  throw new Error('unsupported wallet: pass a viem account or wallet client');
}

/** A signer over an injected EIP-1193 wallet (MiniPay, Valora, any browser wallet on Celo). */
export async function fromInjected(provider = globalThis.ethereum) {
  if (!provider) throw new Error('no injected wallet found');
  const [address] = await provider.request({ method: 'eth_requestAccounts' });
  return toSigner(createWalletClient({ account: address, chain: celo, transport: custom(provider) }));
}

/** The ERC-8021 suffix every transaction carries. Refuses to build one without a code. */
export function attributionSuffix() {
  if (!ATTRIBUTION_CODE) throw new Error('ATTRIBUTION_CODE is empty: no untagged transaction is ever sent');
  return toDataSuffix(ATTRIBUTION_CODE);
}

/** Send a tagged transaction from the signer's own wallet, paying gas in USD₮. Returns the receipt. */
export async function sendTagged(signerLike, { to, data = '0x', value = 0n, gas, maxFeePerGas, maxPriorityFeePerGas }) {
  const s = toSigner(signerLike);
  const hash = await s.wallet.sendTransaction({
    account: s.wallet.account, chain: celo,
    to, data: concat([data, attributionSuffix()]), value, feeCurrency: USDT_FEE_ADAPTER,
    ...(gas ? { gas } : {}), ...(maxFeePerGas ? { maxFeePerGas, maxPriorityFeePerGas: maxPriorityFeePerGas ?? maxFeePerGas } : {}),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`transaction reverted: ${hash}`);
  return receipt;
}

export async function balanceOf(token, owner) {
  return publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
}

/** Public RPC reads can lag a just-mined block: wait until a balance reaches at least `min`. */
export async function balanceAtLeast(token, owner, min, tries = 20) {
  let b = 0n;
  for (let i = 0; i < tries; i++) {
    b = await balanceOf(token, owner);
    if (b >= min) return b;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return b;
}

export async function ensureAllowance(signerLike, token, spender, needed) {
  const s = toSigner(signerLike);
  const current = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [s.address, spender] });
  if (current >= needed) return null;
  if (current > 0n) {
    // USD₮-style tokens refuse a non-zero to non-zero change; reset first.
    await sendTagged(s, { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, 0n] }) });
  }
  return sendTagged(s, { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, maxUint256] }) });
}

export async function transferTagged(signerLike, token, to, amount, fees = {}) {
  return sendTagged(signerLike, { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] }), ...fees });
}

/**
 * The most USD₮ a token transfer's gas can cost, with the gas limit and fee cap that bound it.
 * Celo debits gas × maxFeePerGas up front, so `transfer(balance - maxFee)` is what a full sweep can send.
 */
export async function transferGasInUsdt(signerLike, token, to, amount) {
  const s = toSigner(signerLike);
  const data = concat([encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] }), attributionSuffix()]);
  const est = await publicClient.estimateGas({ account: s.address, to: token, data, feeCurrency: USDT_FEE_ADAPTER });
  const price = BigInt(await publicClient.request({ method: 'eth_gasPrice', params: [USDT_FEE_ADAPTER] }));
  const gas = (est * 13n) / 10n;
  const maxFeePerGas = (price * 3n) / 2n;
  const maxFeeUsdt = (gas * maxFeePerGas + FEE_ADAPTER_SCALE - 1n) / FEE_ADAPTER_SCALE;
  return { gas, maxFeePerGas, maxFeeUsdt };
}
