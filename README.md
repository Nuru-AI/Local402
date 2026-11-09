<p align="center"><img src="app/logo.png" alt="local402" width="180"></p>

# Local402

**Pay for any agent service like a local: in your own currency.**

**Local402 connects Celo to the world's data and AI, in both directions.**

| Side | Who | What they do |
|---|---|---|
| Celo → world | Celo agents and the people behind them, holding pesos, reais or naira | sip any paid service, from X and Reddit data to AI answers and Sippar's products, paying in their own currency with no account, card or ID |
| World → Celo | AI assistants such as Claude, through Local402's MCP server | hire services on Celo and pay people and agents there exactly what they ask, in their own currency |

Next: a Celo Unlock card, bought with a bank card, USDC or any stablecoin, spending through Sippar's
connector on dollar services and in local currencies (not built yet).

## Who holds the money

You do. From v0.4, Local402 never holds anyone's money:

- **Your own wallet pays the seller.** It converts your pesos, reais or naira on Textile itself and pays
  the `payTo` address each seller names in its own 402. The Local402 gateway has no wallet and loads no
  key: it lists services, prices them in your currency and reads each seller's live terms.
- **An Unlock code is a wallet of its own.** The money behind a code sits in a small wallet on Celo whose
  key is the code. It is not held by Local402.
- **Nothing can be undone by us.** Local402 cannot freeze, reverse, refund or recover a payment or a code.
  No one stands between you and your money, and no one can fix a mistake for you.

Up to v0.3 (the first rows of the proof table) the gateway held deposits as prepaid credit. That version
is kept, not run, under [`legacy/`](legacy/v0.3-custodial/) and the git tag `v0.3.0-custodial`.

Agents and the people behind them hold different money. Paid services for AI agents are priced in US
dollars; the people and agents who want them often hold Argentine pesos, Brazilian reais, Colombian
pesos or Nigerian naira — and a freelancer or agent in Buenos Aires or Lagos wants to be paid in theirs.
Local402 connects the two sides on Celo, with [Textile FX](https://docs.textilecredit.com) doing the
exchange at a firm quote every time. **It works both ways:**

- **Local currency in, dollar services out.** Anyone holding wARS, wBRL, wCOP or cNGN sees services priced
  in their currency, pays in it, and the gateway converts on Textile and pays the service over x402.
- **Dollars in, local currency out.** An AI assistant (Claude, or any MCP host) connects Local402's MCP
  server and can hire services on Celo, or pay a person or an agent exactly what they ask in their own
  currency: Textile buys the exact amount, and Local402 sends it.

The services come from two outside shops, both paid per call on Celo:

- [buy](https://usebuy.ai)'s Celo catalogue: x402 services payable in USD₮, including Chainstack RPC,
  Cencori inference, Google Flights, and X, Reddit, TikTok and Instagram data.
- [Sippar](https://sippar.network)'s data and AI products (ids `sippar.*`): social listening, search,
  research, company and chain data, AI answers. Sippar's shop takes Celo's native USDC on its `celo-x402`
  rail (one transfer to the pay-to its 402 names, then `X-PAYMENT: eip155:42220:<tx>`). The buyer's
  wallet keeps a small USDC float, refilled from USD₮ in one Textile fill when short, so each call is one
  tagged transfer from the buyer and no exchange.

Any x402 seller on Celo can be added.

## For judges: try it in 30 seconds

1. Open **https://sippar.network/local402/** and use **Try it**: pick X, Reddit, an AI answer (Cencori),
   Celo RPC (Chainstack) or flights, and ask. The answer comes back paid live on Celo mainnet over x402,
   with its Celoscan link, and the payment then appears in the page's live activity. It pays from a small
   demo wallet that is ours (3 tries per visitor per day).
2. Everything else on that page is read from Celo by your browser: Textile fills, paid calls, the
   attribution tag decoded from each transaction, and the Self Agent ID check.
3. Every transaction is linked below in [Proof on Celo mainnet](#proof-on-celo-mainnet-2026-11-09).

| Track | Where it is met |
|---|---|
| Open Corridors · Textile FX | Seventeen Textile fills in both directions (about 24 USD₮), three of them made by a buyer's own wallet with no gateway in between. Textile's ~$1 minimum becomes one fill that serves many cent-sized calls; failed maker quotes are re-quoted and reservations waited out. |
| Stable Agents: LatAm | Ripio's wARS in and out: a peso holder's own wallet converts on Textile and pays the seller directly, Unlock codes that are wallets of their own, an assistant paying a freelancer exactly 1,700 and 1,200 wARS, and (in v0.3) a peso FX channel with a refund in pesos. |
| Open Corridors · USA₮ with x402 | The agent buys USA₮ on Textile with USD₮, then pays a buy seller in USA₮ over x402 (`exact`, EIP-3009), settled by buy's own x402 processor. |
| Build with buy | Eighteen paid x402 calls (in USD₮, and one in USA₮) into buy's sellers we do not control: X, Reddit, TikTok via Apify, Chainstack, Cencori; two of them signed by a buyer's own wallet and by an Unlock code's wallet, straight to buy's pay-to. |
| On every track | ERC-8004 agent #10063, Self Agent ID #198 on the agent wallet, the attribution tag on every transaction we send. |

Honest gap: every payer so far is ours (the demo buyer and the Try it wallet); the counterparties are
Textile's market makers, buy's sellers and Sippar.

### For people and agents holding local currency (your own wallet)

1. `local402 quote x.posts.search --currency wARS` (or `GET /quote/:service?currency=wARS` on the gateway)
   reads the seller's own 402 for free: its `payTo`, its price, and the price in **wARS, wBRL, wCOP or
   cNGN** from Textile's live levels.
2. `local402 buy x.posts.search --input '{"query":"celo"}' --pay-with wARS`: when the wallet holds too
   little USD₮, it makes one **firm Textile fill** itself (an on-chain fill against Textile's independent
   market makers, at least about $1), then pays the seller directly: buy over **x402** in USD₮, Sippar in
   USDC on Celo. What the fill bought and the call did not spend stays in the buyer's wallet for the next
   calls.

The same two calls are a library (`import { quote, buy } from 'local402'`) and run in a browser with a
Celo wallet such as MiniPay or Valora:

```js
import { buy } from 'local402';
import { fromInjected } from 'local402/tx';
const wallet = await fromInjected(window.ethereum);   // the buyer's own wallet
const r = await buy(wallet, 'x.posts.search', { query: 'celo' }, { payWith: 'wARS', maxUsd: 0.05 });
```

The browser path uses the wallet's injected provider and pays gas in USD₮ through Celo fee abstraction;
it has not been tested on a phone yet.

### For Claude and other AI assistants (MCP server)

```json
{ "mcpServers": { "local402": { "command": "node", "args": ["/path/to/Local402/src/mcp.mjs"],
  "env": { "AGENT_KEY_FILE": "/path/to/agent.key" } } } }
```

| Tool | What it does |
|---|---|
| `celo_services` | find services on Celo, priced in dollars and in a local currency |
| `hire_celo_service` | hire one and return its answer; pay in USD₮, or in pesos/naira converted on Textile first; `sippar.*` products are paid in USDC on Celo |
| `pay_in_local_currency` | pay a person or agent exactly N wARS / wBRL / wCOP / cNGN, funded from dollars via Textile, with a spend cap the user agreed to |
| `celo_rates`, `wallet` | live Textile rates; the agent wallet's balances |
| `use_unlock_code`, `unlock_code_balance` | spend or check an Unlock code; works with no wallet configured |
| `make_unlock_codes`, `sweep_unlock_code` | fund codes from the agent wallet (capped by an amount the user agreed); move what a code holds to an address |

Every payment goes from the configured wallet (or a code's wallet) straight to the seller.

Built for the Celo **Agents on Open Rails** hackathon (Stable Agents: Open Corridors · Textile FX, and
Stable Agents: LatAm).

## Unlock codes: access with no wallet, no account, no ID

Across Latin America many people cannot open the accounts online services ask for: no card that works
abroad, no dollar income, no identity document a sign-up flow accepts. Every x402 service already
skips the account. Local402 skips the rest. Someone who holds pesos (a shop, a friend, a community
group, an NGO) makes **Unlock codes** and hands them out over WhatsApp or on paper. Whoever holds a code
buys data and AI with it, from any HTTP client or straight from Claude through the MCP tool
`use_unlock_code`. Nothing else is asked.

**A code is the money, like cash.** Each code is the private key of a small, fresh wallet on Celo that
holds the code's credit in USD₮. Local402 does not keep a list of codes and never sees one.

- **Lose the code and the money is gone.** No one, Local402 included, can recover it.
- **Anyone who sees the code can take the money.** Share it only with the person it is for, the way you
  would hand over a banknote.
- **Whoever made a code had it too.** If you receive a code and want the money to be yours alone, sweep
  it to a wallet of your own.
- **A mistyped code fails its checksum** instead of opening some other wallet.

| Command / tool | |
|---|---|
| `local402 code mint --count 5 --each 0.25 [--pay-with wARS] --out codes.json` | make codes funded from your wallet (one tagged USD₮ transfer each; pesos are converted on Textile first) |
| `local402 code buy <service> --input '{…}' --code-file codes.json` | spend: the code's wallet signs an x402 authorization to the seller's `payTo`; the seller's facilitator submits it, so the code needs no gas |
| `local402 code sweep --to 0x… --code-file codes.json` | move everything left to any address, in one transfer from the code's wallet (gas paid in USD₮ from the same balance; under $0.001 stays behind) |
| `local402 code balance --code-file codes.json` | what the code's wallet holds |
| MCP `use_unlock_code` · `unlock_code_balance` · `make_unlock_codes` · `sweep_unlock_code` | the same, from Claude |

Code format: `unlock1_` followed by 58 characters of lowercase Crockford base32 that encode the 32-byte
key and a 4-byte checksum (the start of its keccak256). Case, spaces and hyphens are ignored, and `i`,
`l` and `o` read as `1`, `1` and `0`, so a code copied by hand or read aloud still works. A code spends
on x402 sellers paid in USD₮; Sippar's products take a USDC transfer and need a wallet.

## Payee channels: Textile's minimum as a channel open

A Textile conversion has a floor (about $1) and a fixed cost (spread, fee, gas). For an AI assistant
paying people many small amounts in their own currency, `open_payee_channel` buys the whole budget (say
1,800 wARS) in one fill in the assistant's own wallet, `channel_pay` signs a cumulative EIP-712 voucher
per payment that the payee can verify (no transaction, no FX), and `close_payee_channel` settles
everything in one transfer. Unspent budget stays in the assistant's wallet.

v0.3 also ran FX channels for buyers, but the gateway held the channel's funds. v0.4 removes them; the
buyer's own wallet now keeps the float a fill buys, which serves the same purpose with nothing held.

### Channels with an escrow: checked on Celo, not built

Coinbase's x402 batch-settlement escrow (`x402BatchSettlement`, the contract Sippar used on Base) is
**already deployed on Celo** at the same address, `0x4020074e9dF2ce1deE5A9C1b5c3f541D02a10003`, verified
on Celo's Blockscout. Its bytecode matches Base's except for the chain id and its signing domain
("x402 Batch Settlement", version 1, chain 42220), and its gasless deposit helper
(`0x4020806089470a89826cB9fB1f4059150b550004`) is byte-identical. No transaction has used either on Celo
yet (checked 2026-11-09).

How it would work: the buyer's wallet deposits USD₮ or USDC (both support the `receiveWithAuthorization`
the deposit uses; wARS and cNGN do not, so the buyer's own Textile fill comes first), signs a cumulative
voucher per call, and the seller claims what the vouchers allow. The escrow sends money only to the
seller (what was claimed) or back to the buyer, and the buyer can take back the unspent balance after the
channel's withdraw delay without anyone's help. The open question is the receiver: neither buy nor Sippar
accepts this scheme on Celo today, so a channel needs a seller that does.

## How it works

```
buyer's wallet (wARS) ──Textile RFQ: wARS→USD₮ (the buyer's own fill)──▶ buyer's wallet (USD₮)
        │
        ├── x402 (EIP-3009, USD₮, signed by the buyer) ──▶ seller's payTo (buy: Chainstack, Cencori, X, …) ──▶ answer
        └── one tagged USDC transfer from the buyer ──────▶ Sippar's payTo (celo-x402: eip155:42220:<tx>) ──▶ answer

Local402 gateway: catalogue, local prices, each seller's live terms. No wallet, no key.
```

- **FX:** Textile's v2 RFQ API, keyless. The buyer's wallet proves control of itself with one EIP-712
  `TakerControl` signature, asks for a firm quote, approves, re-checks the expiry and broadcasts the
  returned `transactions.swap` itself.
- **Pricing:** the catalogue converts each USD price with Textile's public `/v2/rfq/levels` ladder; the
  fill itself is at the firm quote the buyer's wallet takes.
- **Payments:** a minimal x402 `exact` client signs an EIP-3009 `transferWithAuthorization` in USD₮ from
  the buyer's wallet to the seller's `payTo`; the seller's facilitator settles it. For buy's catalogue the
  `payTo` is buy's own (buy is the merchant for its sellers). For Sippar (`src/sippar.mjs`) the buyer's
  wallet reads the Celo requirement from Sippar's 402, sends one USDC transfer carrying the attribution
  tag, and presents the tx; if the answer fails, the same tx is presented again rather than paying twice.
- **Gas:** paid in USD₮ through Celo fee abstraction (CIP-64). wARS, wBRL, wCOP and cNGN are not Celo fee
  currencies, so a wallet holding only pesos needs about a cent of USD₮ (or some CELO) for its first fill.
- **Attribution:** every transaction a Local402 client sends carries the ERC-8021 tag issued at hackathon
  enrolment (`@celo/attribution-tags`, override with `ATTRIBUTION_CODE`); the code refuses to send an
  untagged transaction. x402 settlements are submitted by the seller's facilitator and cannot carry a tag.
- **Identity:** the agent wallet is registered in the ERC-8004 Identity Registry on Celo
  (`agent.json`, `scripts/register-8004.mjs`) and holds a **Self Agent ID** (#198): a soulbound
  proof-of-human bound to a passport zero-knowledge proof, so anyone can check that a real, unique person
  stands behind the agent. No name, nationality or age was disclosed. Self sits on the agent side only:
  the people Local402 serves never have to show an ID.

## Run it

```bash
npm install
export AGENT_KEY=0x<your key>          # or AGENT_KEY_FILE=agent.key; your wallet, with a little USD₮ on Celo
npx local402 services flights --currency wARS
npx local402 quote x.posts.search --currency wARS
npx local402 buy x.posts.search --input '{"query":"celo"}' --pay-with wARS --max-usd 0.05
npm start                               # the keyless gateway on :4020 (catalogue and quotes only)
npm test
```

| Gateway endpoint | What it does |
|---|---|
| `GET /` | what the gateway is, and that it holds nothing |
| `GET /rates` | local units per USD₮ from Textile levels, with the smallest and largest fill |
| `GET /catalog?currency=wARS&q=flights` | services with their price in the chosen currency |
| `GET /quote/:serviceId?currency=wARS` (or `POST` with the request body) | the seller's live `payTo` and price, read from its 402, and the Textile fill the buyer's wallet would make |
| `/deposit`, `/call`, `/balance`, `/unlock-codes`, `/channel/…` | removed in v0.4; answer 410 |

`node scripts/sippar-quote.mjs reddit-social` reads Sippar's catalogue and one product's Celo price for
free. The two v0.4 mainnet runs below are `scripts/direct-demo.mjs` and `scripts/code-wallet-demo.mjs`;
`node scripts/verify-tags.mjs <tx…>` checks the attribution tag on any transaction.

## Proof on Celo mainnet (2026-11-09)

Agent wallet `0xA781caE75185E6aBF8Efbf5E1f5bC7Eb4400D08B` (the v0.3 gateway) · ERC-8004 agent
[#10063](https://8004scan.io/agents/celo/10063) · demo buyer `0xa9a8fdf5b540489B22B65740310D5f9B66a04328`.
Every transaction our wallets sent carries the ERC-8021 code `celo_b049a252d542` (checked with
`verifyTx` from `@celo/attribution-tags`). Both wallets are ours and funded by us.

**v0.4: nothing held by Local402**

| Step | Transaction |
|---|---|
| **Direct payTo, paid in pesos (`scripts/direct-demo.mjs`)** | |
| Setup between our own wallets: the agent buys 1,659.03 wARS on Textile and gives the buyer 2,259.03 wARS; the buyer keeps only 0.012 USD₮ for gas | [`0xbe032e30…`](https://celoscan.io/tx/0xbe032e3070203bc985c35729c595c2dd9dfaa905c4fb797c198f5e26c9c7281b) · [`0xf47cbee7…`](https://celoscan.io/tx/0xf47cbee78a935a6bc68ac1b0a56d4341d8cdeb4c0607edfc5335d57b4daef6a9) · [`0x72fbde74…`](https://celoscan.io/tx/0x72fbde743d3452de553d464245c427c4b50fd71de4870ce96c43cae18e2755fd) |
| The buyer's own wallet sells 1,863.01 wARS for 1.123007 USD₮ (Textile fill, maker `0x25A5c1Ae…`) | [`0x1451b4ef…`](https://celoscan.io/tx/0x1451b4ef8bfeaa80615d899a2554d8c63e007c896e4c848647c5ca5319c6727c) |
| … buys 1.05 USDC for 1.051039 USD₮ (Textile fill, maker `0xF0d95682…`) | [`0x6943af89…`](https://celoscan.io/tx/0x6943af89a6a1f2a8521a527c0e3f73bef3635c119b3bc494172d81019d13a4b1) |
| … pays `sippar.news-search` 0.01 USDC at Sippar's pay-to `0x65C955A6…`, one tagged transfer sent by the buyer, answered | [`0x37e3e549…`](https://celoscan.io/tx/0x37e3e54986f3c8df6eb86020a4f57c112c9d5f9fa5c1324e089bc806c8fd46ef) |
| … pays X post search 0.005 USD₮ over x402 to buy's pay-to `0x20faAca5…`, signed by the buyer, settled by buy's facilitator | [`0xdf52d7b5…`](https://celoscan.io/tx/0xdf52d7b522eab738422be54741886db3228b09c3df7128cc442279da026d7912) |
| **Unlock code as a wallet (`scripts/code-wallet-demo.mjs`)** | |
| The funder (agent wallet) makes a code and funds its fresh wallet `0x4E57B2f6…` with 0.05 USD₮ | [`0x02c8d1f2…`](https://celoscan.io/tx/0x02c8d1f210fe0d24f869c76b30e71646c6e23e02e8f81bfe9a03f209f9dadd9b) |
| The code's wallet pays Reddit search 0.005 USD₮ over x402 to buy's pay-to, with no gas of its own | [`0xd3eb0488…`](https://celoscan.io/tx/0xd3eb04889c901c1746d17b9dfd5bf087226acbca11389f447922d8c7ffa07cbe) |
| The holder sweeps 0.042743 USD₮ to an address of their choice, gas paid from the same USD₮; 0.000797 USD₮ stays behind | [`0x2bb03aa9…`](https://celoscan.io/tx/0x2bb03aa90c408dc53e9e016e03a840e8d27ae4c6acb37dddb382d93715da7c36) |

Every transaction above that our wallets or the code's wallet sent carries `celo_b049a252d542`; the two
x402 settlements were sent by buy's facilitator and carry none. In the direct run, what the fills bought
and the calls did not spend (1.04 USDC, 0.067 USD₮ and 395.64 wARS) stayed in the buyer's own wallet.

**v0.3: through the custodial gateway (now in `legacy/`)**

| Step | Transaction |
|---|---|
| Self Agent ID #198, owned by the agent wallet (registry `0xaC3DF9AB…`, `agentKeyToAgentId` → 198, `ownerOf(198)` → agent wallet) | [registry](https://celoscan.io/address/0xaC3DF9ABf80d0F5c020C06B04Cced27763355944) |
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

| **MCP door — an AI assistant hires and pays** | |
| `hire_celo_service`: Reddit search, 0.005 USD₮ over x402 | [`0x4c8ff2ec…`](https://celoscan.io/tx/0x4c8ff2ec03bc418b931284b9ca509f10d1aa2080fedeab9256ae51a14282654e) |
| `pay_in_local_currency`: Textile buys exactly 1,700 wARS for 1.024627 USD₮ | [`0x536796db…`](https://celoscan.io/tx/0x536796db3cb03a83bd7983bdd2cd32c6df68fb08235a762719a6c46a4b71c077) |
| … and sends the 1,700 wARS to the recipient (our demo wallet, standing in for a freelancer) | [`0x8120dcf8…`](https://celoscan.io/tx/0x8120dcf883bc0b7ea018b1198bf5a7540a4015c7a1c997195072ac33349ea806) |

| **FX channel — buyer side (open, 4 voucher draws, close)** | |
| Buyer gets 2,157 wARS for 1.30 USD₮ (now holds 3,855.75 wARS) | [`0xdb8abd9f…`](https://celoscan.io/tx/0xdb8abd9f96481673d6a1b73f032d6e2818d0d72378afd51dfb00ec4d41f067c2) |
| Open: buyer pays the gateway 3,855.75 wARS | [`0xa9cfe350…`](https://celoscan.io/tx/0xa9cfe350cfeb9c755087356d92f448f11bb1576703c794acbc326cf253e0e805) |
| Open: one Textile fill → 2.323768 USD₮ channel balance | [`0x8d228767…`](https://celoscan.io/tx/0x8d228767ead1a5472b4f42ced1c9d9be93742224bfff5079cccd8458ee9e9131) |
| Draws (signed vouchers, cumulative 5000 → 10000 → 20000 → 25000): X, Reddit, Chainstack, X — x402 settlements | [`0xeebde8c0…`](https://celoscan.io/tx/0xeebde8c089ebd82baeb260dbdb9d7dbef7e799fd575fe706f93c07bc9a85fa3f) · [`0x420c4512…`](https://celoscan.io/tx/0x420c4512a414b55d49a6c6478e8416cffe3ca48fc46f9e4317a385e303d0c067) · [`0xa027a4c0…`](https://celoscan.io/tx/0xa027a4c0bb6767cc66b9d7de2ca3b01d6b5c64ff7f3c34a5878b809df93577d0) · [`0xcf9b6aec…`](https://celoscan.io/tx/0xcf9b6aecc45d241d6ab3bdd3db2b83d0867d5fe817a9a7106ac4248a836d9d1e) |
| Close: one Textile fill, 2.298768 USD₮ → 3,811.98 wARS | [`0x9ed9ce87…`](https://celoscan.io/tx/0x9ed9ce87fdbb57bfae55ce327f84d1dc44e31ea60433b3099618f9635b0f9ebb) |
| Close: refund 3,811.98 wARS to the buyer | [`0x7585cbd1…`](https://celoscan.io/tx/0x7585cbd1dc0fdb015c4d5c24aefc50a3146c20d31f0559f746b5532532300ec6) |
| **Payee channel — an AI assistant pays a freelancer (MCP)** | |
| `open_payee_channel`: one Textile fill buys exactly 1,800 wARS for 1.085487 USD₮ | [`0x6178ad6c…`](https://celoscan.io/tx/0x6178ad6c80070c514c4f4b6e8f7f3f60050de5241994aecd59dbde95541d75e5) |
| `channel_pay` ×3 (500, 400, 300 wARS): signed vouchers, no transaction | — |
| `close_payee_channel`: one transfer settles 1,200 wARS (600 unspent kept) | [`0xf030201c…`](https://celoscan.io/tx/0xf030201c593662ec150a87a50300f397d37e11fab584c2ccccdd6b7588d18277) |

| **Unlock codes — pay once in pesos, spend with no wallet** | |
| Buyer pays the gateway 5,011.98 wARS | [`0x3646163c…`](https://celoscan.io/tx/0x3646163c22f33b43a88d62e72ecb5b935a8727a769e6136c2de0431cbaeb8604) |
| One Textile fill → 3.020844 USD₮ credit, split into 5 codes of 0.25 USD₮ | [`0xb55ed554…`](https://celoscan.io/tx/0xb55ed55450e8cb4ba79fcfb75094b5c48e1e9e7dc048414cf590c8f25be6eab7) |
| A code holder with no wallet, through the MCP door: Reddit search (0.005 USD₮) | [`0xdf1f1f44…`](https://celoscan.io/tx/0xdf1f1f44bea65d9fc2858b9889c44b3b7b27d15fef2cad58886b666f6ad1c042) |
| … and a Cencori answer in Spanish (0.01 USD₮) | [`0x60de95eb…`](https://celoscan.io/tx/0x60de95eb9a5a1abc2b17b945321f72b53214e9c9ca79c7a1894809fdbfe39001) |
| **Apify through buy (MCP door)** | |
| `hire_celo_service`: TikTok data from an Apify Actor (ScrapTik), 0.007 USD₮ over x402, provider `apify` | [`0x7cf24168…`](https://celoscan.io/tx/0x7cf24168b6c1a32d0a28802e5485b396d11754b7d3771806f1a30c1839bc696e) |
| **Sippar — products paid in USDC on Celo (`scripts/sippar-demo.mjs`)** | |
| USDC float refilled: one Textile fill, 1.051092 USD₮ → 1.05 USDC | [`0x8b1b9c34…`](https://celoscan.io/tx/0x8b1b9c34179b0475ff4d1790f781929bcd6a74822d49a1abf601034d47e9310c) |
| `sippar.reddit-social`: one tagged 0.02 USDC transfer to Sippar's pay-to, presented as `X-PAYMENT: eip155:42220:<tx>` | [`0x90caffd1…`](https://celoscan.io/tx/0x90caffd1da938f6f457c1a3f40b9335435d69d585a0b7a0b8a61b86eedc686ee) |
| `sippar.news-search`: one tagged 0.01 USDC transfer, answered | [`0x88397bc4…`](https://celoscan.io/tx/0x88397bc4202383e34e37fa9e42b8d186f8df469acb1c980b66135a362409c704) |
| **USA₮ over x402 (`scripts/usat-demo.mjs`)** | |
| Agent buys 1.049318 USA₮ for 1.05 USD₮ (Textile fill, rfq `rfq_JS4-5ZMlT3ywSnxb`) | [`0x42e1e31b…`](https://celoscan.io/tx/0x42e1e31b60f19183e14b37f3e5cb8ae0f0720d6b4405ca4f935773cfed7ab96d) |
| x402: X post search, 0.005 USA₮ (`exact`, EIP-3009 on USA₮ `0xD2ab3C9A…`) to buy's pay-to `0x20faAca5…`; settled by buy's own x402 processor (buy's gateway), not Celo's hosted processor at x402.celo.org | [`0x5397effb…`](https://celoscan.io/tx/0x5397effbe0a185a205bd2fdda2cf84ef5f2a2f815bda6f513c5c6890dfe43ef0) |

Sippar answered the Reddit call 8 seconds after payment, but the client's connection timed out before the
answer arrived. Presenting the same transaction once more returned that answer at no charge, marked
`redelivered`, so a timeout costs neither a second payment nor the answer.

Totals: seventeen Textile fills (about 24 USD₮ quoted and filled, both directions), eighteen paid x402
calls (one of them in USA₮) into services we do not control (X, Reddit, TikTok via Apify, Chainstack, Cencori), and three paid
calls into Sippar's shop over its `celo-x402` rail. Earlier subtotal for the HTTP gateway alone: six Textile fills (about 8.1 USD₮ quoted and filled, both directions, two market makers), seven
paid x402 calls into services we do not control. Textile's 2 bps fee went to its fee recipient on each fill.

## Limits, plainly

- A hackathon prototype. The demo buyer wallet and the Unlock-code funder are ours and funded by us; they
  are not independent users.
- Textile's minimum is about $1 per conversion, so a buyer's first fill is at least that; the rest stays
  in the buyer's wallet and pays the next calls a few cents at a time.
- A wallet holding only pesos or naira needs about a cent of USD₮ (or some CELO) for gas, because those
  tokens are not Celo fee currencies.
- The browser path (MiniPay, Valora) is built on the wallet's standard provider but not yet tested on a
  phone.
- wARS and cNGN converted cleanly. USD₮ → wBRL and USD₮ → wCOP firm quotes came back but failed the
  pre-send simulation with `TRANSFER_FROM_FAILED` (nothing was broadcast); at the same time Textile's
  wBRL buy-side depth fell from about 3,700 to about 25 USD₮. The gateway cancels such a quote and frees
  the reservation. wMXN, wPEN and wCLP have no Textile depth on Celo.

## Next

- FX channels with an escrow, on the x402 batch-settlement contract already deployed on Celo (see
  [Channels with an escrow](#channels-with-an-escrow-checked-on-celo-not-built)), once a seller accepts it.
- Accept the local-currency payment directly over x402 through Celo's hosted facilitator (it already
  lists wARS, wBRL and wCOP), instead of transfer-then-deposit.
- More upstreams: any x402 seller, and agents listed in the ERC-8004 registry.
- Hiring people as well as services, paid in their own currency.

## Credits

Built with [Celopedia](https://github.com/celo-org/celopedia-skills) and
[celo-org/agent-skills](https://github.com/celo-org/agent-skills) as the agent's reference, on
[Textile FX](https://textilecredit.com), [buy](https://usebuy.ai), [Sippar](https://sippar.network) and Celo. MIT licence.
