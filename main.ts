// BTC race bot: breakout trend rider, long only.
// Entry: uptrend (close above EMA48, EMA12 above EMA48) plus either an EMA12/48
// cross up or a break to a new 60-bar high. Exit: EMA cross down, close under
// EMA48, a 0.9% trailing stop under the peak close since entry, or +3% take
// profit. A 12-bar cooldown after every exit keeps it out of whipsaws.
// Deterministic: no clock, no randomness, no environment; floats are IEEE 754
// on closes only, so the same bars give the same orders every run.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYM = 'CBBTC';
const FAST = 24;
const SLOW = 72;
const BREAKOUT_BARS = 120;
const COOLDOWN_BARS = 120; // 2h out after every exit: one clean trend ride per move, no chop re-entry
const TRAIL_BPS = 250; // 2.5% under the peak close since entry
const TAKE_BPS = 600; // +6% over cost
const MOM_BARS = 60; // momentum lookback for entries
const MOM_BPS = 80; // entry needs +0.8% over the lookback
const MAX_SLIPPAGE_BPS = 100;

interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

function emaStep(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
}

const fast: Ema = { span: FAST, warm: [], value: null };
const slow: Ema = { span: SLOW, warm: [], value: null };
const closes: number[] = []; // closes before the current bar, oldest first
let gapPrev: number | null = null; // fast - slow after the previous bar
let peakClose = 0; // highest close since the current entry
let barsSinceExit = COOLDOWN_BARS; // start unblocked

await runBars({
  onBatch(state: BarsState, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYM);
    if (bar === undefined) return [];
    const close = Number(bar.c);
    const noSignal = bar.v === '0';

    emaStep(fast, close);
    emaStep(slow, close);
    const gapNow = fast.value !== null && slow.value !== null ? fast.value - slow.value : null;

    const held = state.positions.get(SYM);
    const orders: (BuyInput | SellInput)[] = [];
    if (!state.warmingUp && !noSignal) {
      if (held !== undefined) {
        if (close > peakClose) peakClose = close;
        const value = state.value(SYM, held.qty);
        // Exits are the trailing stop and take profit only: on 1-minute bars
        // the slow EMA hugs price after a vertical rally, so a close under it
        // fires on an ordinary pullback and gives the rally back.
        const trailHit = peakClose > 0 && close < peakClose * (1 - TRAIL_BPS / 10000);
        const takeHit = value * 10000n >= held.cost * BigInt(10000 + TAKE_BPS);
        if (trailHit || takeHit) {
          orders.push({ side: 'sell', symbol: SYM, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
          barsSinceExit = 0;
          peakClose = 0;
        }
      } else {
        barsSinceExit += 1;
        const high60 = closes.length === 0 ? -Infinity : Math.max(...closes.slice(-BREAKOUT_BARS));
        const crossUp = gapPrev !== null && gapNow !== null && gapNow > 0 && gapPrev <= 0;
        const breakout = close >= high60 && closes.length >= BREAKOUT_BARS;
        const uptrend = slow.value !== null && gapNow !== null && gapNow > 0 && close > slow.value;
        const momentum = closes.length >= MOM_BARS && close * 10000 > closes[closes.length - MOM_BARS] * (10000 + MOM_BPS);
        if (uptrend && momentum && (crossUp || breakout) && barsSinceExit > COOLDOWN_BARS) {
          const { fees } = state.hello;
          let slice = state.cash;
          const byWeight = (BigInt(state.hello.caps.max_weight_bps) * state.equity) / 10000n;
          if (slice > byWeight) slice = byWeight;
          if (slice >= BigInt(fees.min_notional_quote_units) && slice > 0n) {
            orders.push({ side: 'buy', symbol: SYM, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
            peakClose = close;
          }
        }
      }
    }

    closes.push(close);
    gapPrev = gapNow;
    return orders;
  },
});
