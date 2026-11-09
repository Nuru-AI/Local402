#!/usr/bin/env node
// Local402 MCP server: lets Claude (or any MCP host) hire services on Celo and pay people and agents
// in their own currency. Both directions run through Textile FX:
//   - dollars in, local currency out: pay a freelancer or an agent exactly N wARS / wBRL / wCOP / cNGN
//   - local currency in, dollars out: hire a USD-priced x402 service while holding pesos or naira
// The wallet is the agent's own key (AGENT_KEY_FILE). Every transaction carries the ERC-8021 code.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { parseUnits, formatUnits, keccak256, toHex } from 'viem';
import { signVoucher, domain as channelDomain } from './channel.mjs';
import { TOKENS, LOCAL } from './config.mjs';
import { loadAccount, balanceOf, transferTagged } from './chain.mjs';
import { convert, convertExactOut, preview } from './textile.mjs';
import { services, ratesPerUsd, payService } from './catalog.mjs';

const account = loadAccount();
const server = new McpServer({ name: 'local402', version: '0.2.0' });
const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const MAX_USD = Number(process.env.LOCAL402_MAX_USD_PER_CALL || '5');

server.tool(
  'celo_services',
  'List paid services on Celo with each price in dollars and in a local currency: buy\'s x402 catalogue (Chainstack RPC, Cencori AI, Google Flights, X, Reddit, TikTok and Instagram data, and more) and Sippar\'s data and AI products (ids starting sippar.).',
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

const GATEWAY_URL = process.env.LOCAL402_GATEWAY || 'http://localhost:4020';

server.tool(
  'use_unlock_code',
  'Hire a data or AI service with a Local402 Unlock code (a prepaid code someone paid for in pesos, reais or naira). Needs no wallet, account, card or ID: the code is the credit.',
  {
    code: z.string().describe('the Unlock code, starting with unlock_'),
    serviceId: z.string().describe('an id from celo_services'),
    input: z.any().describe('the request body the service expects (JSON)'),
  },
  async ({ code, serviceId, input }) => {
    const r = await fetch(`${GATEWAY_URL}/call/${serviceId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${code}` }, body: JSON.stringify(input),
    });
    const body = await r.json();
    const bal = await (await fetch(`${GATEWAY_URL}/balance`, { headers: { Authorization: `Bearer ${code}` } })).json();
    return text({ ...body, codeBalanceUSDT: bal.balanceUSDT });
  },
);

server.tool(
  'hire_celo_service',
  'Hire a service on Celo and return its answer. Pays buy\'s services over x402 in USD₮, and Sippar\'s products (ids starting sippar.) in USDC on Celo, refilling a small USDC float from USD₮ in one Textile fill when short. With payWith set to a local currency, first converts that currency to USD₮ on Textile FX (at least about $1 per conversion; any change stays in the wallet).',
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
    const res = await payService(account, svc, input);
    let body; try { body = JSON.parse(res.body); } catch { body = res.body; }
    return text({ service: serviceId, paidUSD: Number(res.priceAtomic) / 1e6, settlement: res.settlement, textileConversion: fx, usdcRefill: res.textileRefill || undefined, result: body });
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

// ---- Payee channels: pay a person or agent many small amounts in their currency, settle once ----
// Open buys the whole budget on Textile in one fill. Each payment is a signed cumulative voucher the
// payee can verify (no transaction, no FX). Close sends the total in one transfer; any unspent budget
// stays in the wallet for the next channel.
const CH_FILE = process.env.PAYEE_CHANNELS_FILE || 'data/payee-channels.json';
const loadCh = () => { try { return JSON.parse(fs.readFileSync(CH_FILE, 'utf8')); } catch { return {}; } };
const saveCh = (db) => { fs.mkdirSync(path.dirname(CH_FILE), { recursive: true }); fs.writeFileSync(CH_FILE, JSON.stringify(db, null, 2)); };

server.tool(
  'open_payee_channel',
  'Open a channel to pay a person or agent in their own currency many times: buys the whole budget (e.g. 3000 wARS) on Textile FX in one fill, then each payment is an off-chain signed voucher. Minimum about $1.',
  {
    to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('payee wallet on Celo'),
    currency: z.enum(LOCAL),
    budget: z.string().describe('budget in the local currency, e.g. "3000"'),
    confirmUsdMax: z.number().describe('the most USD₮ the user agreed to spend on the budget'),
  },
  async ({ to, currency, budget, confirmUsdMax }) => {
    const t = TOKENS[currency];
    const buyAmount = parseUnits(budget, t.decimals);
    const p = await preview({ sellToken: TOKENS.USDT.address, buyToken: t.address, buyAmount: buyAmount.toString() });
    const usd = Number(p.takerPays || p.sellAmount || 0) / 1e6;
    if (p.status !== 'preview' || usd > confirmUsdMax) return text(`Refused: ${p.status !== 'preview' ? 'no Textile price' : `about ${usd.toFixed(4)} USD₮ needed, above ${confirmUsdMax}`}.`);
    const fx = await convertExactOut(account, { from: 'USDT', to: currency, buyAmount });
    const id = keccak256(toHex(`${to}:${currency}:${Date.now()}:${fx.txHash}`));
    const db = loadCh();
    db[id] = { to, currency, budget: buyAmount.toString(), cumulative: '0', vouchers: [], state: 'open', openTextileTx: fx.txHash, costUSDT: fx.sold };
    saveCh(db);
    return text({ channel: id, payee: to, budget: `${budget} ${currency}`, costUSDT: Number(fx.sold) / 1e6, textileTx: fx.txHash });
  },
);

server.tool(
  'channel_pay',
  'Pay the payee of an open channel an amount in its currency. Off-chain: signs a cumulative voucher the payee can verify against this wallet; no transaction until close.',
  { channel: z.string(), amount: z.string().describe('amount in the channel currency, e.g. "250"'), memo: z.string().optional() },
  async ({ channel, amount, memo }) => {
    const db = loadCh();
    const ch = db[channel];
    if (!ch || ch.state !== 'open') return text('No open channel with that id.');
    const add = parseUnits(amount, TOKENS[ch.currency].decimals);
    const cumulative = BigInt(ch.cumulative) + add;
    if (cumulative > BigInt(ch.budget)) return text(`Refused: that would exceed the channel budget (${formatUnits(BigInt(ch.budget), TOKENS[ch.currency].decimals)} ${ch.currency}).`);
    const signature = await signVoucher(account, ch.to, channel, cumulative);
    ch.cumulative = cumulative.toString();
    ch.vouchers.push({ amount: add.toString(), cumulative: ch.cumulative, memo: memo || '', signature, at: new Date().toISOString() });
    saveCh(db);
    return text({ channel, paid: `${amount} ${ch.currency}`, owedSoFar: `${formatUnits(cumulative, TOKENS[ch.currency].decimals)} ${ch.currency}`, voucher: { domain: channelDomain(ch.to), cumulative: ch.cumulative, signature } });
  },
);

server.tool(
  'close_payee_channel',
  'Settle a payee channel: one on-chain transfer of everything the vouchers promised. Unspent budget stays in the wallet.',
  { channel: z.string() },
  async ({ channel }) => {
    const db = loadCh();
    const ch = db[channel];
    if (!ch || ch.state !== 'open') return text('No open channel with that id.');
    const owed = BigInt(ch.cumulative);
    let settleTx = null;
    if (owed > 0n) settleTx = (await transferTagged(account, TOKENS[ch.currency].address, ch.to, owed)).transactionHash;
    Object.assign(ch, { state: 'closed', settleTx, closedAt: new Date().toISOString() });
    saveCh(db);
    const d = TOKENS[ch.currency].decimals;
    return text({ channel, payments: ch.vouchers.length, settled: `${formatUnits(owed, d)} ${ch.currency}`, settleTx, unspentKept: `${formatUnits(BigInt(ch.budget) - owed, d)} ${ch.currency}` });
  },
);

await server.connect(new StdioServerTransport());
