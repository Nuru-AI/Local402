// Celo mainnet constants. Addresses: Textile address book, Celo docs, buy gateway 402 offers.
export const CHAIN_ID = 42220;
export const RPC_URL = process.env.CELO_RPC_URL || 'https://forno.celo.org';
export const TEXTILE_API = process.env.TEXTILE_API || 'https://api.textilecredit.com/v2';
export const BUY_GATEWAY = process.env.BUY_GATEWAY || 'https://gateway.usebuy.ai';

// Gas is paid in USD₮ through Celo fee abstraction (CIP-64), so the wallet never needs CELO.
export const USDT_FEE_ADAPTER = '0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72';

export const TOKENS = {
  USDT: { address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e', decimals: 6, eip3009: { name: 'Tether USD', version: '1' } },
  USDC: { address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', decimals: 6, eip3009: { name: 'USDC', version: '2' } },
  USAT: { address: '0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771', decimals: 6, eip3009: { name: 'Tether America USD', version: '1' } },
  wARS: { address: '0x0dc4f92879b7670e5f4e4e6e3c801d229129d90d', decimals: 18, currency: 'Argentine peso' },
  wBRL: { address: '0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0', decimals: 18, currency: 'Brazilian real' },
  wCOP: { address: '0x8a1d45e102e886510e891d2ec656a708991e2d76', decimals: 18, currency: 'Colombian peso' },
  cNGN: { address: '0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f', decimals: 6, currency: 'Nigerian naira' },
};

// Currencies a buyer can pay in. Each converts to USD₮ on Textile FX.
export const LOCAL = ['wARS', 'wBRL', 'wCOP', 'cNGN'];

// The ERC-8021 code issued at hackathon enrolment. No transaction is sent without it.
export const ATTRIBUTION_CODE = process.env.ATTRIBUTION_CODE || '';

export function tokenBySymbol(sym) {
  const t = TOKENS[sym];
  if (!t) throw new Error(`unknown token ${sym}`);
  return { symbol: sym, ...t };
}
export function tokenByAddress(addr) {
  const a = addr.toLowerCase();
  for (const [symbol, t] of Object.entries(TOKENS)) if (t.address.toLowerCase() === a) return { symbol, ...t };
  return null;
}
