// Unlock codes on mainnet: a buyer pays once in pesos, splits the credit into codes, and a person with
// no wallet spends one through Claude's MCP door.
// Usage: GATEWAY_URL=http://localhost:4020 ATTRIBUTION_CODE=... node scripts/unlock-demo.mjs
import fs from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TOKENS } from '../src/config.mjs';
import { balanceOf, transferTagged } from '../src/chain.mjs';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4020';
const CURRENCY = process.env.CURRENCY || 'wARS';
const buyer = privateKeyToAccount(fs.readFileSync(process.env.BUYER_KEY_FILE || 'buyer.key', 'utf8').trim());
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const info = await (await fetch(GATEWAY_URL)).json();
const tok = TOKENS[CURRENCY];

// 1. The buyer (a shop, a friend, an NGO) pays once in pesos.
const local = await balanceOf(tok.address, buyer.address);
const pay = await transferTagged(buyer, tok.address, info.gateway, local);
log(`buyer pays ${Number(local) / 10 ** tok.decimals} ${CURRENCY}`, pay.transactionHash);
const dep = await (await fetch(`${GATEWAY_URL}/deposit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: pay.transactionHash }) })).json();
log('credited', dep.creditedUSDT, 'USD₮ · Textile', dep.textileTx);

// 2. Split it into Unlock codes to hand out.
const minted = await (await fetch(`${GATEWAY_URL}/unlock-codes`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dep.credit}` }, body: JSON.stringify({ count: Number(process.env.CODES || 5), eachUSDT: Number(process.env.EACH || 0.25) }),
})).json();
log(`minted ${minted.codes.length} Unlock codes of ${minted.eachUSDT} USD₮ each`);

// 3. Someone with no wallet uses one code through the MCP server (as Claude would).
const client = new Client({ name: 'unlock-demo', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['src/mcp.mjs'], env: { ...process.env, LOCAL402_GATEWAY: GATEWAY_URL } }));
for (const [serviceId, input] of [
  ['reddit.posts.search', { query: 'trabajo remoto Argentina' }],
  ['cencori.v1.chat.completions', { model: 'maximo-atlas-1.3', max_tokens: 256, messages: [{ role: 'user', content: 'En dos frases: cómo puede un pequeño comercio en Córdoba usar datos de redes sociales para vender más?' }] }],
]) {
  const r = await client.callTool({ name: 'use_unlock_code', arguments: { code: minted.codes[0], serviceId, input } });
  const j = JSON.parse(r.content[0].text);
  log(`code ${minted.codes[0].slice(0, 12)}… → ${serviceId}:`, j.error ? `ERROR ${j.error}` : `paid ${j.paidUSDT} · settlement ${j.settlement} · code balance ${j.codeBalanceUSDT}`);
  if (serviceId.startsWith('cencori') && !j.error) log('  answer:', j.result?.choices?.[0]?.message?.content?.slice(0, 300));
}
await client.close();
fs.writeFileSync('data/unlock-codes-demo.json', JSON.stringify({ at: new Date().toISOString(), codes: minted.codes }, null, 2), { mode: 0o600 });
