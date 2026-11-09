import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, concat, encodeFunctionData, erc20Abi, maxUint256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import { toDataSuffix } from '@celo/attribution-tags';
import { RPC_URL, USDT_FEE_ADAPTER, ATTRIBUTION_CODE } from './config.mjs';

export const publicClient = createPublicClient({ chain: celo, transport: http(RPC_URL) });

export function loadAccount(keyFile = process.env.AGENT_KEY_FILE || 'agent.key') {
  return privateKeyToAccount(fs.readFileSync(keyFile, 'utf8').trim());
}

export function walletFor(account) {
  return createWalletClient({ account, chain: celo, transport: http(RPC_URL) });
}

/** The ERC-8021 suffix every transaction carries. Refuses to build one without the issued code. */
export function attributionSuffix() {
  if (!ATTRIBUTION_CODE) throw new Error('ATTRIBUTION_CODE is not set: no untagged transaction is ever sent');
  return toDataSuffix(ATTRIBUTION_CODE);
}

/** Send a tagged transaction, paying gas in USD₮. Returns the receipt. */
export async function sendTagged(account, { to, data = '0x', value = 0n }) {
  const wallet = walletFor(account);
  const hash = await wallet.sendTransaction({
    to, data: concat([data, attributionSuffix()]), value, feeCurrency: USDT_FEE_ADAPTER,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`transaction reverted: ${hash}`);
  return receipt;
}

export async function balanceOf(token, owner) {
  return publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
}

export async function ensureAllowance(account, token, spender, needed) {
  const current = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account.address, spender] });
  if (current >= needed) return null;
  if (current > 0n) {
    // USD₮-style tokens refuse a non-zero to non-zero change; reset first.
    await sendTagged(account, { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, 0n] }) });
  }
  return sendTagged(account, { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, maxUint256] }) });
}

export async function transferTagged(account, token, to, amount) {
  return sendTagged(account, { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] }) });
}
