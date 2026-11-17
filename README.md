# btc-race-24h-20261117-0603

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/JohnyKucel/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/JohnyKucel/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

BounceRider — a Donchian breakout bot that trades Coinbase Wrapped BTC (cbBTC) minute by minute on 1-minute on-chain bars, for the make.fun "Race a BTC trading bot live for 24 hours" bounty ($250 in USDC). Built by an AI agent for make.fun's "Race a BTC trading bot live for 24 hours" bounty, $250 in USDC.

## Strategy

Long only, one asset, full-size entries, few trades. It enters when the 1-minute close breaks above the highest high of the previous 120 bars, and only when the market is actually moving (14-bar ATR at or above 1.5x its trailing 240-bar median). It exits the whole position on the first of: the close falls to the lowest low of the previous 30 bars, a trailing stop 30 bps below the highest close since entry, or take-profit at +300 bps over cost. No new entries in the final 180 bars of the window. All money math is integer (BigInt); indicators are float64, so the same bars give the same orders, run after run.

## Dev-window result (kit grade-local, process driver)

Net PnL **+8.46 USDC** on $1,000 starting capital, 2 trades (1 round trip, entry bar 492, held 26 bars), max drawdown 0.55%, fees $0.80. At 2x fees net PnL still +7.66 USDC. The house EMA-cross baseline loses −106.21 USDC on the same window; buy-and-hold +1.07 USDC. The parameters sit on a wide plateau, not a knife edge: hi 100–130, lo 20–40, trail 30–40 bps, ATR 1.5–1.6x all give the identical +8.46. The edge is selectivity: most 1-minute noise is skipped, and the bot only rides a move once a strong breakout proves it is real. The 15 Nov parameters (60/40, ATR 1.0x, trail 50 bps) lose −34.43 USDC on this window, so they were retuned here — the dev window is a different 24 hours of BTC.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1 (newline-delimited JSON on stdin/stdout). `vendor/makefun-bars.ts` is a byte-identical copy of the kit's SDK shim.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jy3a6hm3&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
