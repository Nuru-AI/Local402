// Claude-side payee channel, driven through the MCP server: one Textile fill buys the budget,
// several payments are signed vouchers, one transfer settles.
// Usage: ATTRIBUTION_CODE=... PAY_TO=0x... node scripts/payee-demo.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'local402-payee-demo', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['src/mcp.mjs'], env: { ...process.env } }));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const t = r.content?.[0]?.text || '';
  console.log(`\n### ${name} ${JSON.stringify(args).slice(0, 140)}\n${t.slice(0, 700)}`);
  try { return JSON.parse(t); } catch { return t; }
};

const to = process.env.PAY_TO;
const open = await call('open_payee_channel', { to, currency: 'wARS', budget: process.env.BUDGET || '1800', confirmUsdMax: 1.3 });
if (!open.channel) process.exit(1);
for (const [amount, memo] of [['500', 'translated product page'], ['400', 'checked 20 listings'], ['300', 'tagged 50 images']]) {
  await call('channel_pay', { channel: open.channel, amount, memo });
}
await call('close_payee_channel', { channel: open.channel });
await client.close();
