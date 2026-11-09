// Free, nothing moves: sign the x402 "exact" payment this agent would pay Sippar with on Celo, and ask Celo's
// facilitator to VERIFY it (its /verify is open and has no on-chain effect). Proves the signer, the token's EIP-712
// domain and Sippar's requirement shape end to end, short of settlement.
// Requirements: Sippar's live 402 for the product when it offers a signed Celo entry; otherwise the same shape built
// here, and the output says so.
// Usage: LOCAL402_AGENT_KEY=... (or AGENT_KEY_FILE=agent.key) node scripts/sippar-signed-check.mjs [product]
import { privateKeyToAccount } from 'viem/accounts';
import { loadAccount } from '../src/chain.mjs';
import { TOKENS, CHAIN_ID } from '../src/config.mjs';
import { SIPPAR, _internal } from '../src/sippar.mjs';

const FACILITATOR = process.env.CELO_X402_FACILITATOR_URL || 'https://api.x402.celo.org';
const envKey = process.env.LOCAL402_AGENT_KEY?.trim();
const account = envKey ? privateKeyToAccount(envKey.startsWith('0x') ? envKey : `0x${envKey}`) : loadAccount();
const product = process.argv[2] || 'news-search';
const url = `${SIPPAR}/api/sippar/sell/${product}`;

const quote = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'Celo stablecoins' }) });
const body = await quote.json();
let accepts = (body.accepts || []).filter((a) => a.network === `eip155:${CHAIN_ID}`);
let source = 'Sippar live 402';
if (!accepts.length) {
  source = 'built here (Sippar offers no signed Celo entry yet)';
  const payTo = (body.rails || []).find((r) => r.rail === 'celo-x402')?.paymentRequirements?.payTo;
  if (!payTo) throw new Error('no Celo pay-to in Sippar\'s 402');
  const amount = String(Math.floor(Number(body.priceUSD) * 1e6));
  accepts = ['USDT', 'USAT', 'USDC'].map((s) => ({ scheme: 'exact', network: `eip155:${CHAIN_ID}`, amount, asset: TOKENS[s].address, payTo, maxTimeoutSeconds: 300, extra: TOKENS[s].eip3009 }));
}
console.log(`agent ${account.address} · product ${product} · $${body.priceUSD} · requirements: ${source}`);
const picked = await _internal.pickSigned(account, accepts);
if (!picked) throw new Error('the wallet holds none of USD₮, USA₮, USDC to cover this price');
const payment = await _internal.signExact(account, picked.req, body.resource || { url });
const paymentPayload = JSON.parse(Buffer.from(payment, 'base64').toString('utf8'));
const res = await fetch(`${FACILITATOR}/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements: picked.req }),
});
console.log(`${picked.symbol} → ${FACILITATOR}/verify: HTTP ${res.status} ${await res.text()}`);
