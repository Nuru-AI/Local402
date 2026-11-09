#!/usr/bin/env node
// local402: buy x402 services on Celo from your own wallet, priced in your own currency.
// Your key stays with you (AGENT_KEY, or a key file); Local402 holds nothing.
import fs from 'node:fs';
import { formatUnits } from 'viem';
import { TOKENS, LOCAL } from '../src/config.mjs';
import { loadAccount, balanceOf } from '../src/chain.mjs';
import { services, ratesPerUsd } from '../src/catalog.mjs';
import { quote, buy } from '../src/buyer.mjs';
import { mintCodes, codeBalance, spendCode, sweepCode } from '../src/codewallet.mjs';

const HELP = `local402: pay for agent services on Celo in your own currency, from your own wallet.

  local402 services [words] [--currency wARS]     list services, priced in dollars and a local currency
  local402 quote <service> [--currency wARS] [--input JSON]
                                                  the seller's payTo and price, and the Textile fill needed
  local402 buy <service> --input JSON [--pay-with wARS] [--max-usd 0.05]
                                                  convert on Textile in your wallet if needed, then pay the seller
  local402 wallet                                 your wallet's balances

  local402 code mint --count N --each 0.25 [--pay-with wARS] [--out codes.json]
                                                  make Unlock codes funded from your wallet
  local402 code balance <code|--code-file F>      what a code's wallet holds
  local402 code buy <service> --input JSON (<code>|--code-file F) [--max-usd 0.05]
                                                  spend a code: its own wallet pays the seller
  local402 code sweep --to 0x… (<code>|--code-file F)
                                                  move everything a code holds to an address

Your key: AGENT_KEY (hex) or --key-file / AGENT_KEY_FILE (default agent.key). Codes are keys too:
--code-file reads one from a file (first "code" field of a JSON list, or the file's text) so it never
lands in your shell history.`;

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) flags[k] = true; else { flags[k] = v; i++; } } else pos.push(a);
}
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o, null, 2));
const json = (s) => (s === undefined || s === true ? undefined : JSON.parse(s));
const wallet = () => loadAccount(flags['key-file']);

function readCode(arg) {
  if (flags['code-file']) {
    const raw = fs.readFileSync(flags['code-file'], 'utf8').trim();
    try { const j = JSON.parse(raw); const list = j.codes || j; return (Array.isArray(list) ? list[Number(flags.index || 0)] : list).code; } catch { return raw; }
  }
  if (!arg) throw new Error('pass a code or --code-file');
  return arg;
}

const [cmd, ...rest] = pos;
try {
  if (!cmd || cmd === 'help' || flags.help) out(HELP);
  else if (cmd === 'services') {
    const q = rest.join(' ').toLowerCase();
    const [list, { rates }] = await Promise.all([services(), ratesPerUsd()]);
    const r = flags.currency ? rates[flags.currency] : null;
    for (const s of list.filter((x) => !q || `${x.id} ${x.description}`.toLowerCase().includes(q))) {
      console.log(`${s.id.padEnd(36)} $${s.usd}${r ? `  ≈ ${(Number(s.usd) * r.perUsd).toFixed(2)} ${flags.currency}` : ''}  ${s.description.slice(0, 70)}`);
    }
  } else if (cmd === 'quote') out(await quote(rest[0], { currency: flags.currency, input: json(flags.input) }));
  else if (cmd === 'buy') out(await buy(wallet(), rest[0], json(flags.input), { payWith: flags['pay-with'] || 'USDT', maxUsd: Number(flags['max-usd'] || 1) }));
  else if (cmd === 'wallet') {
    const a = wallet();
    const o = { address: a.address };
    for (const s of ['USDT', 'USDC', ...LOCAL]) o[s] = formatUnits(await balanceOf(TOKENS[s].address, a.address), TOKENS[s].decimals);
    out(o);
  } else if (cmd === 'code') {
    const [sub, ...r2] = rest;
    if (sub === 'mint') {
      const res = await mintCodes(wallet(), { count: Number(flags.count || 1), eachUSDT: Number(flags.each || 0.1), payWith: flags['pay-with'] || 'USDT' });
      if (flags.out) {
        fs.writeFileSync(flags.out, JSON.stringify({ at: new Date().toISOString(), ...res }, null, 2), { mode: 0o600 });
        out({ ...res, codes: res.codes.map(({ code, ...c }) => c), savedTo: flags.out, note: 'the codes are in that file only (mode 600); they are keys' });
      } else out(res);
    } else if (sub === 'balance') out(await codeBalance(readCode(r2[0])));
    else if (sub === 'buy') out(await spendCode(readCode(r2[1]), r2[0], json(flags.input), { maxUsd: Number(flags['max-usd'] || 1) }));
    else if (sub === 'sweep') out(await sweepCode(readCode(r2[0]), flags.to));
    else out(HELP);
  } else out(HELP);
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
