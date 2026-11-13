# Changelog

What changed in Local402, and when. Times are GMT.

## 0.4.0 — 9 November 2026, 12:11 to 15:00

- The buyer's own wallet now makes its Textile trade and pays each seller directly, to the `payTo` the
  seller names in its own 402. The gateway lists services and prices them in local currency; it has no
  wallet and holds no one's money. `/deposit`, `/call`, `/balance`, `/unlock-codes` and `/channel/…` now
  answer 410.
- An Unlock code is now the key to its own small wallet on Celo.
- Sippar's products can be paid with a signed x402 payment on Celo, USD₮ first.
- Run on Celo mainnet: a buyer paying in pesos straight to the sellers (`scripts/direct-demo.mjs`), and a
  code's wallet paying with no gas (`scripts/code-wallet-demo.mjs`).
- README: who holds the money, the Ripio wFIAT transactions, the rules the agent follows.
- The 0.3 code is kept, not run, under `legacy/`.

## 0.3.x — 9 November 2026, 09:47 to 12:03

- First paid calls into Sippar's shop on Celo, in USDC.
- A USA₮ payment over x402: one Textile trade into USA₮, then a buy X search paid in USA₮
  (`scripts/usat-demo.mjs`).
- README: a section on trying it, and the two directions at the top.
- Tag `v0.3.0-custodial` marks the last 0.3 commit.

## 0.3.0 — 9 November 2026, 06:13 to 08:57

The first version, built for Celo's Agents on Open Rails hackathon and submitted at 08:57 (tag
`submitted-2026-11-09-0900`).

- A gateway that lists buy's Celo x402 services priced in wARS, wBRL, wCOP or cNGN from Textile FX levels.
  A buyer paid the gateway in local currency; the gateway converted it on Textile and paid the service.
- An MCP server, so an AI assistant can hire services on Celo and pay a person in their own currency.
- FX channels and payee channels: one Textile trade opens a channel, signed vouchers pay each call.
- Unlock codes, bought once in local currency, spent with no wallet.
- Sippar as a second shop, paid in USDC on Celo.
- ERC-8004 agent #10063, Self Agent ID #198, and the attribution tag on every transaction.
- By 08:57 on Celo mainnet: 12 Textile trades (about 19 USD₮, both directions) and 15 paid x402 calls
  into buy's sellers.
