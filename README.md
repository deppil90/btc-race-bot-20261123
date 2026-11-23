# BTC Race Bot — make.fun btc-race-24h-20261123-0511

Paper-trading bot for Coinbase Wrapped BTC (cbBTC) on Solana, speaking
agent-fun/bars-replay/v1. Long only, one position, $1,000 starting capital.

## Strategy: breakout trend rider

- **Entry** (when flat): uptrend — close above EMA(48) with EMA(12) above
  EMA(48) — plus either an EMA(12) crossing above EMA(48) or a break to a
  new 60-bar high. Buys the full cash balance.
- **Exit** (when holding): EMA(12) crossing back below EMA(48), close under
  EMA(48), a 0.9% trailing stop under the peak close since entry, or +3%
  take profit over cost.
- **Cooldown**: 12 bars after every exit before a new entry, to stay out of
  whipsaws.
- Orders cap slippage at 100 bps. No clock, no randomness, no environment:
  the same bars always give the same orders.

## Files

- `main.ts` — the bot (Node 22, standard library only).
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's bars-replay
  shim (left out of authorship counts per the rules).

## License

MIT
