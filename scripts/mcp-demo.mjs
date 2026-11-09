// Drives the MCP server the way Claude would: list tools, find a service, hire it, pay someone in pesos.
// Usage: ATTRIBUTION_CODE=... PAY_TO=0x... node scripts/mcp-demo.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'local402-demo', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['src/mcp.mjs'], env: { ...process.env } }));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const t = r.content?.[0]?.text || '';
  console.log(`\n### ${name} ${JSON.stringify(args).slice(0, 120)}\n${t.slice(0, 900)}`);
  return t;
};

console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
await call('wallet');
await call('celo_services', { query: 'reddit', currency: 'cNGN' });
await call('hire_celo_service', { serviceId: 'reddit.posts.search', input: { query: 'stablecoin remittances Nigeria' }, payWith: 'USDT' });
if (process.env.PAY_TO) {
  await call('pay_in_local_currency', { to: process.env.PAY_TO, currency: process.env.PAY_CURRENCY || 'wARS', amount: process.env.PAY_AMOUNT || '1700', confirmUsdMax: 1.2 });
}
await client.close();
