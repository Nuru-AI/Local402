// Direct payTo on Celo mainnet: a buyer holding Argentine pesos (wARS) pays sellers straight from its own
// wallet. Its wallet makes its own Textile fill (wARS → USD₮), then pays each seller's payTo. Local402
// holds nothing at any point; every transaction the buyer sends carries the attribution tag.
//
//   with-secrets local402 -- env STAGE=1 node scripts/direct-demo.mjs
//
// Keys: LOCAL402_BUYER_KEY (the buyer), and with STAGE=1 LOCAL402_AGENT_KEY. STAGE=1 is setup between our
// own wallets, labelled as such: it gives the buyer pesos and leaves it only a cent of USD₮ for gas, as a
// MiniPay user holding pesos would be. Both wallets are ours; the buyer is not an independent user.
import fs from 'node:fs';
import { parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TOKENS } from '../src/config.mjs';
import { balanceOf, balanceAtLeast, balanceBelow, transferTagged, toSigner } from '../src/tx.mjs';
import { convert } from '../src/textile.mjs';
import { ratesPerUsd } from '../src/catalog.mjs';
import { quote, buy } from '../src/buyer.mjs';
import { tagsOf } from './verify-tags.mjs';

const key = (v) => { const k = (process.env[v] || '').trim(); if (!k) throw new Error(`${v} missing: run through with-secrets local402`); return k.startsWith('0x') ? k : `0x${k}`; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const buyer = toSigner(privateKeyToAccount(key('LOCAL402_BUYER_KEY')));
const WARS = TOKENS.wARS;
const fmt = (a, d) => (Number(a) / 10 ** d).toFixed(d === 18 ? 2 : 6);
const sent = []; // every transaction a wallet of ours sent, for the tag check
log('buyer', buyer.address);

if (process.env.STAGE === '1') {
  const agent = toSigner(privateKeyToAccount(key('LOCAL402_AGENT_KEY')));
  const { rates } = await ratesPerUsd();
  const target = parseUnits((rates.wARS.perUsd * 1.25).toFixed(6), 18); // enough for one fill near $1.1
  let have = await balanceOf(WARS.address, buyer.address);
  if (have < target) {
    let agentWars = await balanceOf(WARS.address, agent.address);
    if (agentWars < target - have) {
      const fx = await convert(agent, { from: 'USDT', to: 'wARS', sellAmount: 1_000_000n });
      sent.push(['setup: agent buys wARS on Textile', fx.txHash]);
      log('setup: agent buys wARS', fx.txHash);
      agentWars = await balanceAtLeast(WARS.address, agent.address, agentWars + BigInt(fx.bought));
    }
    const t = await transferTagged(agent, WARS.address, buyer.address, agentWars);
    sent.push(['setup: agent gives the buyer wARS', t.transactionHash]);
    log(`setup: buyer gets ${fmt(agentWars, 18)} wARS`, t.transactionHash);
    have = await balanceAtLeast(WARS.address, buyer.address, have + agentWars);
  }
  // Leave the buyer only gas money in USD₮, so its purchase has to start from pesos.
  const usdt = await balanceOf(TOKENS.USDT.address, buyer.address);
  if (usdt > 15_000n) {
    const t = await transferTagged(buyer, TOKENS.USDT.address, agent.address, usdt - 12_000n);
    sent.push(['setup: buyer returns spare USD₮ to the agent', t.transactionHash]);
    log('setup: buyer keeps 0.012 USD₮ for gas', t.transactionHash);
    await balanceBelow(TOKENS.USDT.address, buyer.address, usdt);
  }
}

log(`buyer holds ${fmt(await balanceOf(WARS.address, buyer.address), 18)} wARS, ${fmt(await balanceOf(TOKENS.USDT.address, buyer.address), 6)} USD₮`);

const proof = { at: new Date().toISOString(), buyer: buyer.address, purchases: [] };
for (const [serviceId, input] of [
  // Sippar first: its USDC needs about $1.06 of USD₮, so this one call drives the peso fill.
  ['sippar.news-search', { query: 'pagos con stablecoins en Argentina' }],
  ['x.posts.search', { query: 'wARS Celo' }],
]) {
  const q = await quote(serviceId, { currency: 'wARS', input });
  log(`quote ${serviceId}: ${q.priceUSD} USD (≈ ${q.local?.price} wARS) to payTo ${q.seller.payTo}`);
  const r = await buy(buyer, serviceId, input, { payWith: 'wARS', maxUsd: 0.05 });
  if (r.textileFill) { sent.push([`buyer's own Textile fill wARS → USD₮ (${serviceId})`, r.textileFill.txHash]); log('  Textile fill in the buyer\'s wallet', r.textileFill.txHash); }
  if (r.usdcRefill) { sent.push(['buyer\'s own Textile fill USD₮ → USDC', r.usdcRefill.txHash]); log('  USDC float', r.usdcRefill.txHash); }
  const settle = typeof r.settlement === 'string' ? r.settlement : r.settlement?.transaction;
  if (r.asset === 'USDC') sent.push([`buyer pays ${serviceId} at its payTo`, settle]);
  log(`  ${r.paid ? 'paid' : `FAILED ${r.status}`} ${Number(r.paidAtomic) / 1e6} ${r.asset} to ${r.payTo} · settlement ${settle}`);
  log('  answer:', JSON.stringify(r.result).slice(0, 200));
  proof.purchases.push({ serviceId, quotedPayTo: q.seller.payTo, payTo: r.payTo, paid: r.paid, paidAtomic: r.paidAtomic, asset: r.asset, settlement: settle, textileFill: r.textileFill?.txHash, usdcRefill: r.usdcRefill?.txHash, submittedBy: r.asset === 'USDC' ? 'the buyer' : 'the seller\'s x402 facilitator' });
}

proof.tags = [];
for (const [what, h] of sent) { const t = await tagsOf(h); proof.tags.push({ what, ...t }); log(`tag ${t.codes.join(',') || 'NONE'} · ${what} · ${h}`); }
fs.mkdirSync('data/proofs', { recursive: true });
const file = `data/proofs/direct-${proof.at.replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(file, JSON.stringify(proof, null, 2));
log('proof written to', file);
