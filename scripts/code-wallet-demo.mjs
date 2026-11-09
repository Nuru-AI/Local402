// An Unlock code on Celo mainnet: a funder makes one code (a fresh key whose wallet holds USD₮), the code's
// own wallet buys a service (an x402 authorization to the seller's payTo: no gas, no account), and the
// holder sweeps what is left to an address of their choice. Local402 holds nothing at any point.
//
//   with-secrets local402 -- node scripts/code-wallet-demo.mjs
//
// The funder is our agent wallet (LOCAL402_AGENT_KEY); the sweep goes back to it. The code is a key, so it
// is written only to data/ (mode 600) and never printed.
import fs from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { TOKENS } from '../src/config.mjs';
import { toSigner, balanceOf, balanceBelow } from '../src/tx.mjs';
import { mintCodes, codeBalance, spendCode, sweepCode } from '../src/codewallet.mjs';
import { tagsOf } from './verify-tags.mjs';

const k = (process.env.LOCAL402_AGENT_KEY || '').trim();
if (!k) throw new Error('LOCAL402_AGENT_KEY missing: run through with-secrets local402');
const funder = toSigner(privateKeyToAccount(k.startsWith('0x') ? k : `0x${k}`));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const EACH = Number(process.env.EACH || 0.05);
fs.mkdirSync('data/proofs', { recursive: true });

// 1. Mint: a fresh key, funded by one tagged USD₮ transfer from the funder.
const minted = await mintCodes(funder, { count: 1, eachUSDT: EACH });
const { code, address, fundTx } = minted.codes[0];
const codeFile = `data/code-demo-${Date.now()}.json`;
fs.writeFileSync(codeFile, JSON.stringify({ code, address }, null, 2), { mode: 0o600 });
log(`minted a code worth ${EACH} USD₮ · code wallet ${address} · funded ${fundTx} · code saved to ${codeFile}`);
for (let i = 0; i < 20 && (await codeBalance(code)).USDT < EACH; i++) await new Promise((r) => setTimeout(r, 1500));
log('code balance', JSON.stringify(await codeBalance(code)));

// 2. Spend: the code's wallet pays the seller's payTo directly (EIP-3009; the seller's facilitator pays gas).
const spends = [];
for (const [serviceId, input] of [
  ['reddit.posts.search', { query: 'trabajo remoto Argentina' }],
]) {
  const before = await balanceOf(TOKENS.USDT.address, address);
  const r = await spendCode(code, serviceId, input, { maxUsd: 0.02 });
  if (r.paid) await balanceBelow(TOKENS.USDT.address, address, before);
  const settle = typeof r.settlement === 'string' ? r.settlement : r.settlement?.transaction;
  log(`${serviceId}: ${r.paid ? 'paid' : `FAILED ${r.status}`} ${Number(r.paidAtomic) / 1e6} USD₮ from ${r.payer} to ${r.payTo} · settlement ${settle}`);
  log('  answer:', JSON.stringify(r.result).slice(0, 200));
  spends.push({ serviceId, payer: r.payer, payTo: r.payTo, paid: r.paid, paidAtomic: r.paidAtomic, settlement: settle });
}
log('code balance', JSON.stringify(await codeBalance(code)));

// 3. Sweep: the holder moves what is left to their own wallet; gas comes out of the same USD₮.
const sweep = await sweepCode(code, funder.address);
log(`swept ${sweep.sweptUSDT} USD₮ to ${sweep.to} (gas cap ${sweep.gasCapUSDT}) · left ${sweep.leftUSDT} · ${sweep.tx}`);

const tags = [];
for (const [what, h] of [['funder funds the code wallet', fundTx], ['code wallet sweeps to the holder', sweep.tx]]) {
  const t = await tagsOf(h);
  tags.push({ what, ...t });
  log(`tag ${t.codes.join(',') || 'NONE'} · ${what} · ${h}`);
}
const proof = { at: new Date().toISOString(), funder: funder.address, codeWallet: address, eachUSDT: EACH, fundTx, spends, sweep, tags };
const file = `data/proofs/code-${proof.at.replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(file, JSON.stringify(proof, null, 2));
log('proof written to', file);
