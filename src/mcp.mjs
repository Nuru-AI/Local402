#!/usr/bin/env node
// Local402 MCP server: lets Claude (or any MCP host) hire services on Celo and pay people and agents
// in their own currency. Both directions run through Textile FX:
//   - dollars in, local currency out: pay a freelancer or an agent exactly N wARS / wBRL / wCOP / cNGN
//   - local currency in, dollars out: hire a USD-priced x402 service while holding pesos or naira
// The wallet is the agent's own key (AGENT_KEY_FILE). Every transaction carries the ERC-8021 code.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { parseUnits, formatUnits } from 'viem';
import { TOKENS, LOCAL } from './config.mjs';
import { loadAccount, balanceOf, transferTagged } from './chain.mjs';
import { convert, convertExactOut, preview } from './textile.mjs';
import { pay } from './x402.mjs';
import { services, ratesPerUsd } from './catalog.mjs';

const account = loadAccount();
const server = new McpServer({ name: 'local402', version: '0.2.0' });
const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const MAX_USD = Number(process.env.LOCAL402_MAX_USD_PER_CALL || '5');

server.tool(
  'celo_services',
  'List paid services on Celo (buy\'s x402 catalogue: Chainstack RPC, Cencori AI, Google Flights, X, Reddit, TikTok and Instagram data, and more) with each price in dollars and in a local currency.',
  { query: z.string().optional().describe('words to filter by, e.g. "flights" or "reddit"'), currency: z.enum(LOCAL).optional().describe('show prices in this currency too') },
  async ({ query, currency }) => {
    const [list, { rates }] = await Promise.all([services(), ratesPerUsd()]);
    const q = (query || '').toLowerCase();
    const r = currency ? rates[currency] : null;
    const rows = list.filter((s) => !q || `${s.id} ${s.description}`.toLowerCase().includes(q)).slice(0, 30)
      .map((s) => ({ id: s.id, usd: s.usd, ...(r ? { [currency]: +(Number(s.usd) * r.perUsd).toFixed(2) } : {}), description: s.description }));
    return text({ count: rows.length, services: rows, priceSource: 'buy catalogue; local prices from Textile FX levels' });
  },
);

server.tool(
  'celo_rates',
  'Live local-currency rates on Celo from Textile FX (units per USD₮), with the smallest and largest amount one conversion can do.',
  {},
  async () => text(await ratesPerUsd()),
);

server.tool(
  'hire_celo_service',
  'Hire a service on Celo and return its answer. Pays the service over x402 in USD₮. With payWith set to a local currency, first converts that currency to USD₮ on Textile FX (at least about $1 per conversion; any change stays in the wallet).',
  {
    serviceId: z.string().describe('an id from celo_services, e.g. "x.posts.search"'),
    input: z.any().describe('the request body the service expects (JSON)'),
    payWith: z.enum(['USDT', ...LOCAL]).default('USDT'),
  },
  async ({ serviceId, input, payWith }) => {
    const svc = (await services()).find((s) => s.id === serviceId);
    if (!svc) return text(`Unknown service ${serviceId}. Call celo_services to list them.`);
    if (Number(svc.usd) > MAX_USD) return text(`Refused: ${svc.usd} USD is above the ${MAX_USD} USD per-call cap.`);
    let fx = null;
    if (payWith !== 'USDT') {
      const usdt = await balanceOf(TOKENS.USDT.address, account.address);
      if (usdt < BigInt(svc.atomic)) {
        const { rates } = await ratesPerUsd();
        const r = rates[payWith];
        if (!r) return text(`No Textile depth for ${payWith} right now.`);
        const localNeeded = Math.max(r.minDepositLocal * 1.02, Number(svc.usd) * r.perUsd * 1.05);
        fx = await convert(account, { from: payWith, to: 'USDT', sellAmount: parseUnits(localNeeded.toFixed(6), TOKENS[payWith].decimals) });
      }
    }
    const res = await pay(account, svc.url, { method: svc.method, body: input, symbol: 'USDT', maxAtomic: svc.atomic });
    let body; try { body = JSON.parse(res.body); } catch { body = res.body; }
    return text({ service: serviceId, paidUSDT: Number(res.priceAtomic) / 1e6, settlement: res.receipt?.transaction || res.receipt, textileConversion: fx, result: body });
  },
);

server.tool(
  'pay_in_local_currency',
  'Pay a person or an agent on Celo exactly the amount they ask for in their own currency (wARS, wBRL, wCOP or cNGN), funded from dollars: buys that exact amount on Textile FX, then sends it. Minimum about $1.',
  {
    to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('recipient wallet on Celo, e.g. a freelancer or an ERC-8004 agent wallet'),
    currency: z.enum(LOCAL),
    amount: z.string().describe('amount in the local currency, e.g. "2000" wARS'),
    confirmUsdMax: z.number().describe('the most USD₮ the user agreed to spend; refused if the quote is higher'),
  },
  async ({ to, currency, amount, confirmUsdMax }) => {
    const t = TOKENS[currency];
    const buyAmount = parseUnits(amount, t.decimals);
    const p = await preview({ sellToken: TOKENS.USDT.address, buyToken: t.address, buyAmount: buyAmount.toString() });
    if (p.status !== 'preview') return text(`Textile has no price for ${amount} ${currency} right now (${p.reason || p.status}).`);
    const usd = Number(p.takerPays || p.sellAmount) / 1e6;
    if (usd > confirmUsdMax) return text(`Refused: about ${usd.toFixed(4)} USD₮ needed, above the agreed ${confirmUsdMax}.`);
    const fx = await convertExactOut(account, { from: 'USDT', to: currency, buyAmount });
    const sent = await transferTagged(account, t.address, to, buyAmount);
    return text({ paid: `${amount} ${currency}`, to, costUSDT: Number(fx.sold) / 1e6, textileTx: fx.txHash, transferTx: sent.transactionHash });
  },
);

server.tool(
  'wallet',
  'The agent wallet on Celo and its balances.',
  {},
  async () => {
    const out = { address: account.address };
    for (const sym of ['USDT', 'USDC', ...LOCAL]) out[sym] = formatUnits(await balanceOf(TOKENS[sym].address, account.address), TOKENS[sym].decimals);
    return text(out);
  },
);

await server.connect(new StdioServerTransport());
