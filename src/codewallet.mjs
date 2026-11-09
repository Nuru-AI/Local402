// Unlock codes as keys. A code IS the private key of a small, fresh wallet on Celo that holds the
// code's credit in USD₮: a bearer wallet, like a gift-card link. Whoever holds the code owns the funds.
// Local402 never sees a code, never holds its money and cannot freeze, refund or recover it.
//
//   mintCodes(funder, {count, eachUSDT})   fresh keys, each funded by one tagged USD₮ transfer from the funder
//   codeBalance(code)                      what the code's wallet holds
//   spendCode(code, serviceId, input)      pay a seller's payTo from the code's wallet (x402: no gas needed)
//   sweepCode(code, to)                    move everything left to any wallet the holder chooses
//
// Code format: "unlock1_" + 58 characters of lowercase Crockford base32 encoding the 32-byte key and a
// 4-byte checksum (the first bytes of its keccak256). Case, spaces and hyphens are ignored; i/l read as 1
// and o as 0, so a code read aloud or copied by hand still decodes, and a typo fails the checksum.
import { bytesToHex, hexToBytes, keccak256, parseUnits } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { TOKENS, LOCAL } from './config.mjs';
import { toSigner, balanceOf, balanceBelow, transferTagged, transferGasInUsdt } from './tx.mjs';
import { buy, fundUsdt } from './buyer.mjs';
import { isSippar } from './sippar.mjs';

export const CODE_PREFIX = 'unlock1_';
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

function b32encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function b32decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of str) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error(`not a valid Unlock code (bad character "${ch}")`);
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(out);
}

const checksum = (key) => hexToBytes(keccak256(key)).slice(0, 4);

export function keyToCode(privateKey) {
  const key = hexToBytes(privateKey);
  if (key.length !== 32) throw new Error('a key is 32 bytes');
  return CODE_PREFIX + b32encode(Uint8Array.from([...key, ...checksum(key)]));
}

export function codeToKey(code) {
  const body = String(code).toLowerCase().replace(/[\s-]/g, '').replace(/^unlock1_?/, '')
    .replace(/[il]/g, '1').replace(/o/g, '0');
  if (body.length !== 58) throw new Error('not a valid Unlock code (wrong length)');
  const raw = b32decode(body);
  const key = raw.slice(0, 32);
  const sum = checksum(key);
  if (raw.length < 36 || sum.some((b, i) => b !== raw[32 + i])) throw new Error('not a valid Unlock code (checksum failed: check for a typo)');
  return bytesToHex(key);
}

/** A fresh code and the address of its wallet. The code is shown once to whoever made it. */
export function newCode() {
  const key = generatePrivateKey();
  return { code: keyToCode(key), address: privateKeyToAccount(key).address };
}

/** The code's wallet as a signer. */
export function codeSigner(code) {
  return toSigner(privateKeyToAccount(codeToKey(code)));
}

export const codeAddress = (code) => codeSigner(code).address;

/**
 * Make `count` codes of `eachUSDT` USD₮ each, funded from the funder's own wallet: one tagged transfer
 * per code. With payWith set to a local currency, the funder's wallet converts it on Textile first.
 * Returns the codes: they are keys, so store them as you would cash.
 */
export async function mintCodes(funderLike, { count = 1, eachUSDT = 0.1, payWith = 'USDT' } = {}) {
  const funder = toSigner(funderLike);
  if (!(count >= 1 && count <= 50)) throw new Error('count must be 1 to 50');
  if (!(eachUSDT >= 0.01 && eachUSDT <= 20)) throw new Error('eachUSDT must be between 0.01 and 20');
  const each = parseUnits(eachUSDT.toFixed(6), 6);
  const textileFill = payWith === 'USDT' ? null : await fundUsdt(funder, { payWith, needAtomic: each * BigInt(count) });
  const codes = [];
  for (let i = 0; i < count; i++) {
    const { code, address } = newCode();
    const sent = await transferTagged(funder, TOKENS.USDT.address, address, each);
    codes.push({ code, address, eachUSDT, fundTx: sent.transactionHash });
  }
  return { funder: funder.address, textileFill, codes };
}

/** What a code's wallet holds (read from Celo; needs no key, but the code yields its address). */
export async function codeBalance(code) {
  const address = codeAddress(code);
  const out = { address };
  for (const sym of ['USDT', 'USDC', ...LOCAL]) {
    const b = await balanceOf(TOKENS[sym].address, address);
    if (sym === 'USDT' || b > 0n) out[sym] = Number(b) / 10 ** TOKENS[sym].decimals;
  }
  return out;
}

/**
 * Spend from a code: the code's wallet signs an x402 authorization straight to the seller's payTo; the
 * seller's facilitator submits it and pays the gas, so the code needs nothing but its USD₮.
 */
export async function spendCode(code, serviceId, input, { maxUsd = 1 } = {}) {
  if (isSippar(serviceId)) {
    throw new Error('codes pay x402 sellers in USD₮; Sippar\'s Celo rail takes a USDC transfer (spend from a wallet instead)');
  }
  return buy(codeSigner(code), serviceId, input, { payWith: 'USDT', maxUsd });
}

/**
 * Move everything a code holds in USD₮ to `to`, in one tagged transfer from the code's own wallet.
 * The gas is paid in USD₮ from the same balance (Celo fee abstraction), so the wallet ends near zero.
 */
export async function sweepCode(code, to) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(to || '')) throw new Error('sweep needs a destination address (0x…)');
  const s = codeSigner(code);
  const bal = await balanceOf(TOKENS.USDT.address, s.address);
  if (bal === 0n) throw new Error('this code holds no USD₮');
  // Gas is estimated on a 1-unit transfer: emptying the balance can only cost less.
  const { gas, maxFeePerGas, maxPriorityFeePerGas, maxFeeUsdt } = await transferGasInUsdt(s, TOKENS.USDT.address, to, 1n);
  const amount = bal - maxFeeUsdt;
  if (amount <= 0n) throw new Error(`this code holds ${Number(bal) / 1e6} USD₮, less than the ${Number(maxFeeUsdt) / 1e6} USD₮ gas a transfer can cost`);
  const sent = await transferTagged(s, TOKENS.USDT.address, to, amount, { gas, maxFeePerGas, maxPriorityFeePerGas });
  const left = await balanceBelow(TOKENS.USDT.address, s.address, bal);
  return { from: s.address, to, sweptUSDT: Number(amount) / 1e6, gasCapUSDT: Number(maxFeeUsdt) / 1e6, leftUSDT: Number(left) / 1e6, tx: sent.transactionHash };
}
