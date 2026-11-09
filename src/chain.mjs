// Node entry for transactions: everything in tx.mjs, plus loading a key from a file or the environment.
// Browser code imports tx.mjs directly (no file system there).
import fs from 'node:fs';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import { RPC_URL } from './config.mjs';

export * from './tx.mjs';

const asKey = (k) => { const t = k.trim(); return t.startsWith('0x') ? t : `0x${t}`; };

/**
 * The caller's own key: AGENT_KEY (hex, e.g. injected by a secrets manager) or the file AGENT_KEY_FILE
 * (default agent.key). Never printed.
 */
export function loadAccount(keyFile) {
  if (!keyFile && process.env.AGENT_KEY) return privateKeyToAccount(asKey(process.env.AGENT_KEY));
  return privateKeyToAccount(asKey(fs.readFileSync(keyFile || process.env.AGENT_KEY_FILE || 'agent.key', 'utf8')));
}

export function walletFor(account) {
  return createWalletClient({ account, chain: celo, transport: http(RPC_URL) });
}
