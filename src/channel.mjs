// FX channels: one Textile fill opens a channel, many calls draw on it with signed cumulative
// vouchers (no on-chain transaction, no FX per call), one settlement closes it.
// The same shape as an MPP session or x402 batch settlement: a voucher carries the running total,
// it only ever goes up, and the receiver keeps its own last state rather than trusting the sender's.
import { verifyTypedData } from 'viem';
import { CHAIN_ID } from './config.mjs';

export function domain(verifyingContract) {
  return { name: 'Local402', version: '1', chainId: CHAIN_ID, verifyingContract };
}

export const types = {
  // A draw: the payer authorises `cumulative` atomic units spent so far on channel `channel`.
  Voucher: [
    { name: 'channel', type: 'bytes32' },
    { name: 'cumulative', type: 'uint256' },
  ],
  // The payer's final word: close at `cumulative` and send back the rest.
  Close: [
    { name: 'channel', type: 'bytes32' },
    { name: 'cumulative', type: 'uint256' },
  ],
};

export async function signVoucher(account, gateway, channel, cumulative, kind = 'Voucher') {
  return account.signTypedData({
    domain: domain(gateway), types: { [kind]: types[kind] }, primaryType: kind,
    message: { channel, cumulative: BigInt(cumulative) },
  });
}

export async function verifyVoucher({ gateway, owner, channel, cumulative, signature, kind = 'Voucher' }) {
  return verifyTypedData({
    address: owner, domain: domain(gateway), types: { [kind]: types[kind] }, primaryType: kind,
    message: { channel, cumulative: BigInt(cumulative) }, signature,
  });
}

export const encodeVoucher = (v) => Buffer.from(JSON.stringify(v)).toString('base64');
export const decodeVoucher = (s) => JSON.parse(Buffer.from(s, 'base64').toString());
