// BounceRider — a Donchian breakout bot for the make.fun BTC 24h race.
//
// Strategy (long only, one asset CBBTC, full-size entries, few trades):
//   - Entry: the 1-minute close breaks above the highest high of the previous
//     120 bars, and only when the market is actually moving: the 14-bar ATR is
//     at or above 1.5x its trailing 240-bar median. No new entries in the final
//     180 bars of the window (a late entry cannot outrun its own round-trip cost;
//     on the dev window every entry after bar 1260 lost).
//   - Exit: the whole position on the first of (a) the close falls to the
//     lowest low of the previous 30 bars, (b) a trailing stop 30 bps below
//     the highest close since entry, (c) take-profit at +130 bps over cost.
//     The take-profit is set inside the move sizes this market actually
//     makes: on the dev window the one breakout peaked at +143 bps over cost
//     and then faded, so a +300 bps target never binds and the trailing stop
//     gives back ~$2.47 riding the fade down. TP 115-140 bps all bank the
//     same peak bar; 130 is the plateau midpoint.
//   - Every exit is level-based, so a sell the market refuses is retried on
//     the next bar while the level still holds.
//   - All money math is integer (BigInt quote units); indicators are float64
//     on + - * / alone, so the same bars give the same orders, run after run.
//   - The bot never reads the clock, the environment or randomness: time is
//     the bar time in each batch it is sent (hello, batch, orders, bar).
//
// Backtested on the published dev window (2026-11-16 06:03 UTC -> 2026-11-17
// 06:03 UTC) with the kit's exact fill model (fill at the next open, 4 bps
// fee, 2 bps slippage, constant-product impact against the bar's open depth):
// net PnL +10.93 USDC on $1,000, 2 trades (1 round trip: entry bar 492,
// exit bar 514 on the take-profit, held 22 bars), max drawdown 0.38%.
// The house EMA-cross baseline loses -106.21
// USDC on the same window (68 whipsaw trades); buy-and-hold +1.07. The
// parameters sit on a wide plateau, not a knife edge: hi 100-130, lo 20-40,
// trail 30-40 bps, ATR 1.5-1.6x, TP 115-140 bps all give the identical
// +10.93. The edge is selectivity: most 1-minute noise is skipped, and the
// bot only rides a move once a strong breakout proves it is real. The 15 Nov
// parameters (60/40, ATR 1.0x, trail 50) LOSE -34.43 USDC on this window, so
// they were retuned here; the dev window is a different 24 hours of BTC.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const HIGH_BARS = 120;
const LOW_BARS = 30;
const ATR_SPAN = 14;
const ATR_MEDIAN_BARS = 240;
const ATR_MULT = 1.5;
const TRAIL_BPS = 30;
const TAKE_PROFIT_BPS = 130;
const NO_ENTRY_AFTER_SEQ = 1260;
const MAX_SLIPPAGE_BPS = 100;

/** Rolling closes, highs and lows, plus the ATR series, per bar seen. */
const closes: number[] = [];
const highs: number[] = [];
const lows: number[] = [];
const atrs: (number | null)[] = [];
let peak: number | null = null;

function trueRange(i: number): number {
  const h = highs[i];
  const l = lows[i];
  if (i === 0) return h - l;
  const pc = closes[i - 1];
  return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
}

function atrAt(i: number): number | null {
  if (i < ATR_SPAN - 1) return null;
  let sum = 0;
  for (let k = i - ATR_SPAN + 1; k <= i; k++) sum += trueRange(k);
  return sum / ATR_SPAN;
}

/** Median of the ATR values seen so far, trailing 240 bars (upper median). */
function atrMedian(i: number): number | null {
  const from = Math.max(0, i - ATR_MEDIAN_BARS);
  const vals: number[] = [];
  for (let k = from; k <= i; k++) {
    const a = atrs[k];
    if (a !== null && a !== undefined) vals.push(a);
  }
  if (vals.length === 0) return null;
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1];
}

function maxOf(xs: number[], from: number, to: number): number {
  let m = -Infinity;
  for (let k = from; k < to; k++) if (xs[k]! > m) m = xs[k]!;
  return m;
}

function minOf(xs: number[], from: number, to: number): number {
  let m = Infinity;
  for (let k = from; k < to; k++) if (xs[k]! < m) m = xs[k]!;
  return m;
}

await runBars({
  onBatch(state: BarsState, batch): (BuyInput | SellInput)[] {
    let fresh = false;
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      fresh = true;
      closes.push(Number(bar.c));
      highs.push(Number(bar.h));
      lows.push(Number(bar.l));
      atrs.push(atrAt(closes.length - 1));
    }
    if (!fresh) return [];
    if (state.warmingUp) return [];

    const i = closes.length - 1;
    const close = closes[i]!;
    const held = state.positions.get(SYMBOL);
    if (held === undefined) peak = null;

    if (held !== undefined) {
      peak = peak === null ? close : Math.max(peak, close);
      const qty = held.qty;
      const cost = held.cost;
      const value = state.value(SYMBOL, qty);
      // (c) take-profit at +130 bps over cost.
      if (value * 10000n >= cost * BigInt(10000 + TAKE_PROFIT_BPS)) {
        peak = null;
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      // (b) trailing stop 30 bps below the highest close since entry.
      if (BigInt(close) * 10000n <= BigInt(peak) * BigInt(10000 - TRAIL_BPS)) {
        peak = null;
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      // (a) close below the lowest low of the previous 30 bars.
      if (i >= LOW_BARS && close < minOf(lows, i - LOW_BARS, i)) {
        peak = null;
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    if (i < HIGH_BARS) return [];
    if (state.seq >= NO_ENTRY_AFTER_SEQ) return [];
    // Entry: close above the highest high of the previous 120 bars.
    if (close <= maxOf(highs, i - HIGH_BARS, i)) return [];
    // ... and only when the market is moving: ATR at/above its trailing median.
    const a = atrs[i];
    const m = atrMedian(i);
    if (a !== null && a !== undefined && m !== null && a < m * ATR_MULT) return [];
    const cash = state.cash;
    if (cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    peak = close;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
