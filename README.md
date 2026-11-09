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

## Limits, plainly

- A hackathon prototype. Deposits become prepaid credit held by the gateway wallet until spent.
- Textile's minimum is about $1 per conversion, so deposits are at least that; calls then draw down the
  credit a few cents at a time.
- wARS, wBRL, wCOP and cNGN have live Textile depth on Celo today; wMXN, wPEN and wCLP do not.

## Next

- Accept the local-currency payment directly over x402 through Celo's hosted facilitator (it already
  lists wARS, wBRL and wCOP), instead of transfer-then-deposit.
- More upstreams: any x402 seller, and agents listed in the ERC-8004 registry.
- Hiring people as well as services, paid in their own currency.

## Credits

Built with [Celopedia](https://github.com/celo-org/celopedia-skills) and
[celo-org/agent-skills](https://github.com/celo-org/agent-skills) as the agent's reference, on
[Textile FX](https://textilecredit.com), [buy](https://usebuy.ai) and Celo. MIT licence.
