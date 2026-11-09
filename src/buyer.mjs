// The buyer side of Local402: everything runs in the buyer's own wallet. Node or browser.
//
//   quote(serviceId, {currency})          the seller's live terms (its own payTo), priced in local currency
//   buy(signer, serviceId, input, opts)   a Textile fill in the buyer's wallet when needed, then a payment
//                                         straight to the seller's payTo; returns the seller's answer
//
// Local402 never holds the buyer's money: there is no deposit, no credit and no gateway wallet in this path.
import { parseUnits } from 'viem';
import { TOKENS, LOCAL } from './config.mjs';
import { toSigner, balanceOf, publicClient } from './tx.mjs';
import { convert } from './textile.mjs';
import { findService, sellerTerms, ratesPerUsd, payService } from './catalog.mjs';
import { isSippar } from './sippar.mjs';

const usd = (atomic) => Number(atomic) / 1e6;
// USD₮ kept back for the buyer's own gas (approve and swap on Textile; Sippar's USDC transfer).
const GAS_RESERVE = 20_000n;
// A Sippar call is paid in USDC; when the wallet has none, one Textile fill (at least about $1) buys a float.
const USDC_REFILL = 1_060_000n;

/**
 * What one call costs and whom the buyer pays. Free: reads the seller's 402 and Textile's public levels.
 * `currency` adds the price in wARS / wBRL / wCOP / cNGN and the size of the one Textile fill needed.
 */
export async function quote(serviceId, { currency, input } = {}) {
  const svc = await findService(serviceId);
  const [terms, { asOf, rates }] = await Promise.all([sellerTerms(svc, input), ratesPerUsd()]);
  const priceAtomic = terms.free ? '0' : terms.amount;
  const out = {
    service: { id: svc.id, provider: svc.provider, description: svc.description },
    seller: terms,
    priceUSD: usd(priceAtomic),
    custody: 'Local402 holds nothing. The buyer\'s wallet converts on Textile itself and pays the seller\'s payTo directly.',
  };
  if (currency) {
    if (!LOCAL.includes(currency)) throw Object.assign(new Error(`currency must be one of ${LOCAL.join(', ')}`), { status: 400 });
    const r = rates[currency];
    out.local = r ? {
      currency, ratePerUsd: r.perUsd, asOf, price: +(usd(priceAtomic) * r.perUsd).toFixed(2),
      // Textile fills at least about $1, so the first call buys a float that pays many more.
      oneFill: { pair: `${currency} → USD₮`, minimum: r.minDepositLocal, covers: Math.floor(1 / Math.max(usd(priceAtomic), 1e-6)) },
      source: 'Textile FX levels (indicative; the fill itself is at a firm quote the buyer\'s wallet takes)',
    } : { currency, unavailable: 'Textile shows no depth for this currency right now' };
  }
  out.steps = [
    ...(currency ? [`if the wallet holds less than ${usd(priceAtomic)} USD₮ (plus about $0.02 for gas): one Textile fill ${currency} → USD₮, sent by the buyer's wallet`] : []),
    ...(terms.symbol === 'USDC' ? ['if the wallet holds no USDC: one Textile fill USD₮ → USDC (Sippar is paid in USDC)'] : []),
    terms.free ? 'the service answered without asking for payment' : `pay ${terms.amount} atomic ${terms.symbol} to ${terms.payTo ?? 'the seller\'s payTo (named in its 402)'}${terms.scheme ? ` (${terms.scheme})` : ''}`,
  ];
  return out;
}

/**
 * Make sure the wallet holds `needAtomic` USD₮ (plus a little for gas), converting the buyer's own
 * local currency on Textile when it does not. Returns the fill, or null when none was needed.
 */
export async function fundUsdt(signerLike, { payWith, needAtomic }) {
  const s = toSigner(signerLike);
  const have = await balanceOf(TOKENS.USDT.address, s.address);
  if (have >= needAtomic + GAS_RESERVE) return null;
  if (!payWith || payWith === 'USDT') throw new Error(`wallet holds ${usd(have)} USD₮, needs ${usd(needAtomic + GAS_RESERVE)}`);
  if (!LOCAL.includes(payWith)) throw new Error(`payWith must be USDT or one of ${LOCAL.join(', ')}`);
  // wARS and friends are not Celo fee currencies: the fill's own gas is paid in USD₮ (or CELO).
  if (have < 5_000n && (await publicClient.getBalance({ address: s.address })) === 0n) {
    throw new Error('the wallet needs a little USD₮ (about $0.01) or CELO for gas before it can convert on Textile');
  }
  const { rates } = await ratesPerUsd();
  const r = rates[payWith];
  if (!r) throw new Error(`Textile shows no depth for ${payWith} right now`);
  const short = usd(needAtomic + GAS_RESERVE - have);
  const t = TOKENS[payWith];
  const sellAmount = parseUnits(Math.max(r.minDepositLocal * 1.02, short * r.perUsd * 1.05).toFixed(6), t.decimals);
  const local = await balanceOf(t.address, s.address);
  if (local < sellAmount) {
    throw new Error(`a Textile fill needs at least ${Number(sellAmount) / 10 ** t.decimals} ${payWith}; the wallet holds ${Number(local) / 10 ** t.decimals}`);
  }
  return convert(s, { from: payWith, to: 'USDT', sellAmount });
}

/**
 * Buy one call from the buyer's own wallet and return the seller's answer.
 * payWith: 'USDT' (default) or a local currency to convert first. maxUsd: refuse anything priced above it.
 */
export async function buy(signerLike, serviceId, input, { payWith = 'USDT', maxUsd = 5 } = {}) {
  const s = toSigner(signerLike);
  const svc = await findService(serviceId);
  if (Number(svc.usd) > maxUsd) throw Object.assign(new Error(`${svc.usd} USD is above the ${maxUsd} USD cap`), { status: 402 });
  let need = BigInt(svc.atomic);
  if (isSippar(svc.id) && (await balanceOf(TOKENS.USDC.address, s.address)) < need) need = need > USDC_REFILL ? need : USDC_REFILL;
  const textileFill = payWith === 'USDT' ? null : await fundUsdt(s, { payWith, needAtomic: need });
  const r = await payService(s, svc, input);
  let result;
  try { result = JSON.parse(r.body); } catch { result = r.body; }
  return {
    service: svc.id, payer: s.address, paid: r.paid, status: r.status,
    payTo: r.payTo, paidAtomic: r.priceAtomic, asset: isSippar(svc.id) ? 'USDC' : 'USDT',
    settlement: r.settlement, textileFill, usdcRefill: r.textileRefill || null, result,
  };
}
