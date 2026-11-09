# Local402

**Pay for any agent service like a local: in your own currency.**

Most paid APIs for AI agents are priced in US dollars and paid in USD stablecoins. Many of the people
and agents who want them hold Argentine pesos, Brazilian reais, Colombian pesos or Nigerian naira.
Local402 is a small open-source gateway on Celo that closes that gap:

1. It lists x402 services with their price shown in **wARS, wBRL, wCOP or cNGN**, using live rates from
   [Textile FX](https://docs.textilecredit.com).
2. The buyer pays the gateway in that local stablecoin on Celo.
3. The gateway converts the payment to USD₮ at a **firm Textile quote** (one on-chain fill against
   Textile's independent market makers).
4. It then pays the service over **x402** and returns the answer.

The first upstream is [buy](https://usebuy.ai)'s Celo catalogue: about 145 services payable in USD₮,
including Chainstack RPC, Cencori inference, Google Flights, and X, Reddit, TikTok and Instagram data.
Any x402 seller on Celo can be added.

Built for the Celo **Agents on Open Rails** hackathon (Stable Agents: Open Corridors · Textile FX, and
Stable Agents: LatAm).

## How it works

```
buyer (wARS) ──transfer──▶ gateway ──Textile RFQ: wARS→USD₮──▶ gateway (USD₮)
                                                     │
                     answer ◀── x402 (EIP-3009, USD₮) ┴──▶ service (buy gateway: Chainstack, Cencori, …)
```

- **FX:** Textile's v2 RFQ API, keyless. The gateway proves control of its wallet with one EIP-712
  `TakerControl` signature, asks for a firm quote for the exact deposit, approves, re-checks the expiry
  and broadcasts the returned `transactions.swap`.
- **Pricing:** the catalogue converts each USD price with Textile's public `/v2/rfq/levels` ladder. The
  deposit itself converts at the firm quote, so the credit is exactly what Textile filled.
- **Payments out:** a minimal x402 `exact` client signs an EIP-3009 `transferWithAuthorization` in USD₮;
  the seller's facilitator settles it.
- **Gas:** paid in USD₮ through Celo fee abstraction (CIP-64), so the gateway never needs CELO.
- **Attribution:** every transaction the gateway sends carries the ERC-8021 tag issued at hackathon
  enrolment (`@celo/attribution-tags`); the code refuses to send an untagged transaction. x402
  settlements are submitted by the seller's facilitator and cannot carry a tag yet.
- **Identity:** the gateway wallet is registered in the ERC-8004 Identity Registry on Celo
  (`agent.json`, `scripts/register-8004.mjs`).

## Run it

```bash
npm install
echo 0x<private key> > agent.key && chmod 600 agent.key   # the gateway wallet; fund it with a little USD₮ on Celo
export ATTRIBUTION_CODE=<your ERC-8021 code>
npm run prices      # read-only: live rates and services priced in local currency
npm start           # the gateway on :4020
```

| Endpoint | What it does |
|---|---|
| `GET /` | gateway address, currencies, flow |
| `GET /rates` | local units per USD₮ from Textile levels, with min and max deposit |
| `GET /catalog?currency=wARS&q=flights` | services with their price in the chosen currency |
| `POST /deposit {txHash}` | credits a local-currency transfer to the gateway after converting it on Textile; returns a credit token once |
| `POST /call/:serviceId` | `Authorization: Bearer <credit>`; pays the service over x402 and returns its answer; refunds the credit if the service fails |
| `GET /balance` | remaining credit |
| `GET /history` | deposits, Textile fills and calls |

`npm run demo` runs the whole flow on mainnet with a demo buyer wallet (funded by us, so it is not an
independent user).

## Proof on Celo mainnet (2026-11-09)

Gateway / payTo `0xA781caE75185E6aBF8Efbf5E1f5bC7Eb4400D08B` · ERC-8004 agent
[#10063](https://8004scan.io/agents/celo/10063) · demo buyer `0xa9a8fdf5b540489B22B65740310D5f9B66a04328`.
Every transaction both wallets sent carries the ERC-8021 code `celo_b049a252d542` (checked with
`verifyTx` from `@celo/attribution-tags`).

| Step | Transaction |
|---|---|
| ERC-8004 registration (agent #10063) | [`0x137b55e4…`](https://celoscan.io/tx/0x137b55e4d9d0c41d7485f1f935cf4498ebaca195b25e52a91290adf06e6036e1) |
| **Purchase 1 — Argentine pesos** | |
| Buyer gets 2,488.56 wARS for 1.50 USD₮ (Textile fill) | [`0x3c01212d…`](https://celoscan.io/tx/0x3c01212dc8f6bba0cb4bb977c63c7608f33d59134d16bcd22d9e4a39468481c7) |
| Buyer pays the gateway 2,488.56 wARS | [`0x5bdc89e5…`](https://celoscan.io/tx/0x5bdc89e5e0ea55066d6851e90950fa5dd6165ceec9903622eb0b00cbda520e00) |
| Gateway converts to 1.499092 USD₮ (Textile fill, maker `0x25A5c1Ae…`) | [`0x1e7f262d…`](https://celoscan.io/tx/0x1e7f262d9bf820ea9a32c3187231db97eb7e43f7fa1b8640c11d203aa32da870) |
| x402: X post search, 0.005 USD₮ (buy) | [`0xf0806337…`](https://celoscan.io/tx/0xf0806337a1af5580f24b8452461f166403613246cd5e2e1ff6dedb77b3e9248c) |
| x402: Chainstack Celo RPC, 0.01 USD₮ (buy) | [`0xffc712e8…`](https://celoscan.io/tx/0xffc712e833a27f9d2d1f712abb0508f37f9e529d59f692d4e4209cf415d6fc69) |
| **Purchase 2 — Nigerian naira** | |
| Buyer gets 1,792.39 cNGN for 1.30 USD₮ (Textile fill) | [`0xd5ca4a7f…`](https://celoscan.io/tx/0xd5ca4a7f1b4c7fb9f579745fd7088bd82b07c8553fd33599fcd2383f5a47eaad) |
| Buyer pays the gateway 1,792.39 cNGN | [`0x434fe969…`](https://celoscan.io/tx/0x434fe9691f0777f72b7e20affdbd155349c15203475628135bb80f58f491e45c) |
| Gateway converts to 1.299653 USD₮ (Textile fill, maker `0xF0d95682…`) | [`0x10a38cd6…`](https://celoscan.io/tx/0x10a38cd60077daddebce74ba250207db2af0157569f2921ebb56cd70851ef394) |
| x402: X post search, 0.005 USD₮ | [`0xb735219c…`](https://celoscan.io/tx/0xb735219c3739b47fabf4635f0f911709ea0d6f0572941ab19540f86661a84b2f) |
| x402: Chainstack Celo RPC, 0.01 USD₮ | [`0xe287157d…`](https://celoscan.io/tx/0xe287157d125cc4a8fe7921c42a050894a4bf44fe9371ef7fceabc66c36246990) |
| **Purchase 3 — Argentine pesos, with an AI answer** | |
| Buyer gets 2,074.00 wARS for 1.25 USD₮ (Textile fill) | [`0x19280db7…`](https://celoscan.io/tx/0x19280db7124316cc4b16a4abe4e253220b3f286fa374fc59f6a4927261166128) |
| Buyer pays the gateway 2,074.00 wARS | [`0x29772480…`](https://celoscan.io/tx/0x29772480aa56c3abe845765c5b2903ffded52d1c5b4999e9e6c6fb3ad3ca11ad) |
| Gateway converts to 1.24925 USD₮ (Textile fill) | [`0xab79122f…`](https://celoscan.io/tx/0xab79122f7439ee11459732e97ad3912dcc13efaa63552793d64d05e25149c661) |
| x402: X post search, 0.005 USD₮ | [`0x5d99cc88…`](https://celoscan.io/tx/0x5d99cc88a927aed7c4354180ace726575a75a3365114ec82fd071415f4147aeb) |
| x402: Chainstack Celo RPC, 0.01 USD₮ | [`0xaa32fc58…`](https://celoscan.io/tx/0xaa32fc58f481e745fe368f8138be54d4b1d1403b137aa4a0087a0aeac2fb8a4b) |
| x402: Cencori chat completion, 0.01 USD₮ | [`0x56837cb4…`](https://celoscan.io/tx/0x56837cb499c9987e3c444581ee67cfeba3488f92cba9024cff873e27d95b02f9) |

Totals: six Textile fills (about 8.1 USD₮ quoted and filled, both directions, two market makers), seven
paid x402 calls into services we do not control. Textile's 2 bps fee went to its fee recipient on each fill.

## Limits, plainly

- A hackathon prototype. Deposits become prepaid credit held by the gateway wallet until spent.
- The demo buyer wallet is ours and funded by us; it is not an independent user.
- Textile's minimum is about $1 per conversion, so deposits are at least that; calls then draw down the
  credit a few cents at a time.
- wARS and cNGN converted cleanly. USD₮ → wBRL and USD₮ → wCOP firm quotes came back but failed the
  pre-send simulation with `TRANSFER_FROM_FAILED` (nothing was broadcast); at the same time Textile's
  wBRL buy-side depth fell from about 3,700 to about 25 USD₮. The gateway cancels such a quote and frees
  the reservation. wMXN, wPEN and wCLP have no Textile depth on Celo.

## Next

- Accept the local-currency payment directly over x402 through Celo's hosted facilitator (it already
  lists wARS, wBRL and wCOP), instead of transfer-then-deposit.
- More upstreams: any x402 seller, and agents listed in the ERC-8004 registry.
- Hiring people as well as services, paid in their own currency.

## Credits

Built with [Celopedia](https://github.com/celo-org/celopedia-skills) and
[celo-org/agent-skills](https://github.com/celo-org/agent-skills) as the agent's reference, on
[Textile FX](https://textilecredit.com), [buy](https://usebuy.ai) and Celo. MIT licence.
