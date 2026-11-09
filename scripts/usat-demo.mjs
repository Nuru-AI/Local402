// Paid, on Celo mainnet: the agent buys USA₮ on Textile with USD₮, then pays one buy (usebuy.ai)
// x402 service in USA₮. Stage `convert` or `pay`; each stage runs once and never retries a payment.
// Usage: ATTRIBUTION_CODE=... AGENT_KEY_FILE=agent.key node scripts/usat-demo.mjs convert|pay
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, erc20Abi } from 'viem';
import { celo } from 'viem/chains';
import { loadAccount } from '../src/chain.mjs';
import { RPC_URL, TOKENS } from '../src/config.mjs';
import { convert } from '../src/textile.mjs';
import { pay } from '../src/x402.mjs';

const envKey = process.env.LOCAL402_AGENT_KEY?.trim();
const account = envKey ? privateKeyToAccount(envKey.startsWith('0x') ? envKey : `0x${envKey}`) : loadAccount();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const pub = createPublicClient({ chain: celo, transport: http(RPC_URL) });
const bal = async (s) => Number(await pub.readContract({ address: TOKENS[s].address, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] })) / 1e6;

log('agent', account.address, 'USDT', await bal('USDT'), 'USAT', await bal('USAT'));
const stage = process.argv[2];
if (stage === 'convert') {
  const r = await convert(account, { from: 'USDT', to: 'USAT', sellAmount: 1050000n });
  log('textile fill', JSON.stringify(r));
} else if (stage === 'pay') {
  const URL = 'https://gateway.usebuy.ai/v1/social/x/posts/search';
  const r = await pay(account, URL, { body: { query: 'USAT stablecoin Celo' }, symbol: 'USAT', maxAtomic: 5000n });
  log('x402', JSON.stringify({ paid: r.paid, status: r.status, priceAtomic: r.priceAtomic, payTo: r.payTo, receipt: r.receipt }));
  log('body', (r.body || '').slice(0, 400));
} else {
  log('stage must be convert or pay');
}
