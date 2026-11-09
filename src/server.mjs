// Local402 gateway: quotes and routes, and holds nothing. It has no wallet and loads no key.
// 1. GET /catalog?currency=wARS         services priced in pesos, reais or naira (Textile levels)
// 2. GET /quote/:serviceId?currency=wARS the seller's own payTo and price, read live from its 402,
//                                       and the one Textile fill the buyer's wallet would make
// 3. the buyer's wallet does the rest itself (src/buyer.mjs, the CLI, the MCP server, or a browser
//    wallet such as MiniPay): converts on Textile, then pays the seller's payTo directly.
import express from 'express';
import { LOCAL, ATTRIBUTION_CODE } from './config.mjs';
import { pricedCatalog, ratesPerUsd } from './catalog.mjs';
import { quote } from './buyer.mjs';

const app = express();
app.use(express.json({ limit: '64kb' }));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(e.status || 500).json({ error: e.message }));

app.get('/', (req, res) => res.json({
  service: 'Local402',
  custody: 'none: this gateway has no wallet. Buyers pay sellers directly from their own wallets.',
  chainId: 42220,
  payIn: LOCAL,
  fx: 'Textile FX, filled by the buyer\'s own wallet (keyless RFQ with an EIP-712 TakerControl proof)',
  upstream: ['buy (gateway.usebuy.ai) x402 catalogue, paid in USD₮ to each seller\'s payTo', 'Sippar (sippar.network) products, ids sippar.*, paid in USDC on Celo to Sippar\'s payTo'],
  attribution: ATTRIBUTION_CODE,
  flow: [
    'GET /catalog?currency=wARS',
    'GET /quote/:serviceId?currency=wARS',
    'in the buyer\'s wallet: one Textile fill when it holds too little USD₮, then pay the seller\'s payTo (npx local402 buy …)',
  ],
}));

app.get('/rates', wrap(async (req, res) => res.json(await ratesPerUsd())));

app.get('/catalog', wrap(async (req, res) => {
  const currency = req.query.currency || 'wARS';
  if (!LOCAL.includes(currency)) return res.status(400).json({ error: `currency must be one of ${LOCAL.join(', ')}` });
  const cat = await pricedCatalog(currency);
  const q = (req.query.q || '').toString().toLowerCase();
  if (q) cat.services = cat.services.filter((s) => `${s.id} ${s.description}`.toLowerCase().includes(q));
  res.json(cat);
}));

// GET with no body probes the seller with the service's example input; POST quotes a specific input
// (Sippar's price can depend on the request).
app.get('/quote/:id', wrap(async (req, res) => res.json(await quote(req.params.id, { currency: req.query.currency }))));
app.post('/quote/:id', wrap(async (req, res) => res.json(await quote(req.params.id, { currency: req.query.currency, input: req.body }))));

// The custodial endpoints of v0.3 (deposit, credit, FX channels held by the gateway, ledger unlock codes)
// are gone. Say so plainly rather than 404.
const gone = (req, res) => res.status(410).json({
  error: 'removed in v0.4: Local402 no longer holds buyer funds',
  instead: 'pay from your own wallet (src/buyer.mjs, `local402 buy`), or with an Unlock code wallet (`local402 code …`)',
  oldVersion: 'git tag v0.3.0-custodial',
});
for (const p of ['/deposit', '/call/:id', '/balance', '/unlock-codes', '/history', '/channel/:id', '/channel/:id/call/:service', '/channel/:id/close']) app.all(p, gone);

const port = Number(process.env.PORT || 4020);
app.listen(port, () => console.log(`Local402 gateway (keyless) on :${port}`));
