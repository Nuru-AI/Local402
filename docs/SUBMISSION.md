# Local402 — Agents on Open Rails submission

**Project:** Local402
**Tagline:** Agents that pay like a local: hire services and people on Celo in pesos, reais, naira or dollars, through FX channels on Textile.
**Tracks:** Stable Agents: Open Corridors · Textile FX (primary) · Stable Agents: LatAm (secondary)
**Repo:** https://github.com/Nuru-AI/Local402 (MIT)
**Network:** Celo mainnet (42220)
**Agent wallet / payTo:** `0xA781caE75185E6aBF8Efbf5E1f5bC7Eb4400D08B`
**ERC-8004 identity:** agent #10063 — https://8004scan.io/agents/celo/10063
**Attribution tag:** `celo_b049a252d542` (on every transaction the gateway and the demo buyer send)

## What it does

Agent services are priced in dollars; many of the people and agents who want them hold pesos, reais or
naira, and a freelancer or agent in Buenos Aires or Lagos wants to be paid in theirs. Local402 connects
the two sides on Celo, with a firm Textile FX quote in every crossing. It works both ways:

- **Dollars in, local currency out — an MCP server for Claude and other assistants.** `celo_services`
  finds services on Celo; `hire_celo_service` hires one and returns its answer (paying in USD₮, or in
  pesos/naira converted on Textile first); `pay_in_local_currency` pays a person or agent exactly N wARS,
  wBRL, wCOP or cNGN, buying that exact amount on Textile from dollars, within a spend cap the user agreed.
- **Local currency in, dollar services out — an HTTP gateway:**

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

## The strategy: FX channels

Textile's minimum (about $1) and fixed cost per conversion make per-call FX absurd for $0.005 calls. Local402
turns that minimum into a channel open, the design we know from MPP sessions and x402 batch settlement:
**one Textile fill opens a channel, each call draws on it with an EIP-712 cumulative voucher signed by the
payer (no transaction, no FX), and one fill closes it, returning the rest in the payer's own currency.**
The same shape runs for an assistant paying a freelancer: one fill buys the budget, payments are vouchers
the payee can verify, one transfer settles. Fewer, larger Textile trades; one spread instead of many.
The client also re-quotes when a maker fails at simulation and waits out its own reservation using
Textile's `retryAfterMs`.

## Proof on mainnet

See the README's "Proof on Celo mainnet" section for every transaction hash: Textile fills in both directions (USD₮→local
for the buyer, local→USD₮ for the gateway), tagged transfers, the ERC-8004 registration, and x402
settlements for each service call.

## Honest notes

- The demo buyer wallet is ours and was funded by us; it is not an independent user. The counterparties
  in every Textile fill are Textile's market makers, and the x402 sellers are buy's providers.
- x402 settlements are submitted by the seller's facilitator and cannot carry an attribution tag; the
  gateway's payTo/payer wallet is the address above.
- wARS and cNGN converted cleanly. Firm quotes for USD₮→wBRL and USD₮→wCOP failed the pre-send
  simulation with `TRANSFER_FROM_FAILED` (nothing was broadcast) while Textile's wBRL buy-side depth fell
  from about 3,700 to about 25 USD₮; the gateway cancels such a quote and frees the reservation.
- Totals: twelve Textile fills (about 19 USD₮ quoted and filled, both directions) and fifteen paid x402
  calls (X and Reddit search, TikTok data from an Apify Actor, Chainstack RPC, Cencori inference); one buyer FX channel (open, four voucher
  draws, close with a wARS refund) and one payee channel (three voucher payments, one settlement).
- Funding arrived on Base and was bridged to Celo through Relay with a gasless permit.

## How the agent helped

Our coding agent (Claude Code) worked alongside the team throughout: it researched the tracks, Textile's
RFQ API and contracts, and buy's catalogue through the Sippar connector (page reads, GitHub and
skill-registry lookups), used Celopedia and celo-org/agent-skills as references, implemented the gateway
and the MCP server, registered the ERC-8004 identity, and ran and verified the mainnet transactions.
