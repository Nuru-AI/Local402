# Local402 — Agents on Open Rails submission

**Project:** Local402
**Tagline:** Pay for any agent service like a local: in pesos, reais or naira, on Celo.
**Tracks:** Stable Agents: Open Corridors · Textile FX (primary) · Stable Agents: LatAm (secondary)
**Repo:** https://github.com/Nuru-AI/Local402 (MIT)
**Network:** Celo mainnet (42220)
**Agent wallet / payTo:** `0xA781caE75185E6aBF8Efbf5E1f5bC7Eb4400D08B`
**ERC-8004 identity:** agent #10063 — https://8004scan.io/agents/celo/10063
**Attribution tag:** `celo_b049a252d542` (on every transaction the gateway and the demo buyer send)

## What it does

Agent services are priced in dollars and paid in USD stablecoins; many of the people and agents who
want them hold pesos, reais or naira. Local402 is an open-source gateway that lets them pay in their
own currency:

1. `GET /catalog?currency=wARS` lists about 145 x402 services from buy's Celo catalogue (Chainstack RPC,
   Cencori inference, Google Flights, X, Reddit, TikTok and Instagram data), each priced in wARS, wBRL,
   wCOP or cNGN from Textile's live `/v2/rfq/levels` ladder.
2. The buyer transfers the local stablecoin to the gateway on Celo.
3. `POST /deposit` converts it to USD₮ at a firm Textile FX quote (keyless RFQ with an EIP-712 proof of
   control) and credits exactly what Textile filled.
4. `POST /call/:service` pays the service over x402 (EIP-3009 USD₮) and returns its answer, refunding the
   credit if the service fails.

Every conversion is a Textile fill against independent market makers; every service call is a paid call
into a service we do not control. Gas is paid in USD₮ through Celo fee abstraction.

## Proof on mainnet

See the README's "Proof on Celo mainnet" section for every transaction hash: Textile fills in both directions (USD₮→local
for the buyer, local→USD₮ for the gateway), tagged transfers, the ERC-8004 registration, and x402
settlements for each service call.

## Honest notes

- The demo buyer wallet is ours and was funded by us; it is not an independent user. The counterparties
  in every Textile fill are Textile's market makers, and the x402 sellers are buy's providers.
- x402 settlements are submitted by the seller's facilitator and cannot carry an attribution tag; the
  gateway's payTo/payer wallet is the address above.
- One USD₮→wBRL quote reverted on-chain with `TRANSFER_FROM_FAILED` while the wBRL buy-side depth fell
  from about 3,700 to about 25 USD₮; the gateway now cancels a quote whose swap fails.
- Funding arrived on Base and was bridged to Celo through Relay with a gasless permit.

## How the agent helped

Built in one session by Claude Code: it researched the tracks and Textile's API through Sippar's
connector (page reads, GitHub and skill-registry lookups), used Celopedia and celo-org/agent-skills as
references, wrote the gateway, registered the ERC-8004 identity, and ran the mainnet purchases.
