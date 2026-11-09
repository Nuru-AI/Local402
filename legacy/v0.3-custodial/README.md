# Legacy: the custodial gateway of v0.3 (not run, not maintained)

Kept for the record only, because the first rows of the main README's proof table were made with it on
2026-11-09. Nothing in `src/` imports these files and `npm start` does not run them. They do not run as
they stand: the imports point at the old `src/` layout. The exact old version is the git tag
`v0.3.0-custodial`.

How v0.3 worked, and why it changed: the buyer sent local currency to the gateway wallet, the gateway
converted it on Textile and kept the USD₮, and a ledger (`src/ledger.mjs`) tracked each buyer's credit,
FX-channel balance and Unlock-code balance. The gateway held the buyers' money between the deposit and
the call. From v0.4 the buyer's own wallet converts and pays each seller's `payTo` directly, and an
Unlock code is the key to its own small wallet, so Local402 holds nothing.
