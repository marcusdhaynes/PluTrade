# Conditional Entries/Exits + Dynamic Chandelier ATR Protection

This release extends PluTrade's real-quote-gated PAPER engine. It does not connect to, authorize, or operate a live brokerage account, and browser rules are not unattended server-side orders.

## Rule builder

- IF, IF (AND), IF (OR), WHENEVER, WHILE. THEN includes long/short entry, exact-side exit, conditional close/TP, reduce, scale in, protective fixed or percentage trailing stops, and **Dynamic ATR Chandelier** stop.
- WHILE: all conditions must remain true, with at most one action per false→true activation (and a 20-second rearm cooldown). Repeated broker-like purchases on every market tick are *deliberately prevented*. For protective actions, the enabled stop remains in force when conditions later become false; removing protection automatically would be unsafe. WHENEVER is also edge-triggered.
- Conditions: price crossing up/down/either, touch, greater/less, exact drawing crossing with time interpolation, rectangle zone entering/exiting/inside/outside within its drawn date range, price-alert firing on a real event, finalized RSI(14) and price–SMA(20) indicators (existing pipeline), position exists, signed P&L thresholds, current paper equity/free funds thresholds, and UTC session times including overnight windows.
- Drawing references require the saved drawing ID and exactly matching exchange/market identity. Unknown drawings/time geometry cannot execute; alert flags cannot be recycled as fresh events.
- Entry sizing: **99% of equity** is 0.99 × account equity / observed price in units, *not* an implicit 99% of free margin or leveraged position. Execution still needs sufficient free collateral and passes the existing portfolio risk policy. Separate legacy '% Available Funds' mode remains.
- Account target: explicitly pick a named paper account or Every Paper Account. Each account has its own copy and must independently meet margin/currency/risk/quote checks. Moving an existing rule from all to one pauses the old copies and preserves their prior counts/fills.
- The existing single-tab Web Locks writer gate and ledger backups remain in place. Read-only tabs cannot place or modify paper entries.

## Dynamic trailing stop — ATR / Chandelier

Research references:
- TradingView https://www.tradingview.com/support/solutions/43000773013-chandelier-exit/
- TA-Lib https://ta-lib.org/functions/ce.html
- StockCharts https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/chandelier-exit

Chuck LeBeau's classic Chandelier Exit, popularized by Alexander Elder, is a volatility-adjusted trend-following exit. This is a conventional strategy, **not a guaranteed profitable or objectively best strategy**. The defaults are **22-bar Wilder ATR, 22-bar highest high/lowest low, multiplier 3.0**, on configurable 1m/5m/15m/1h/4h/1D candles (default 1h so no misleading daily-ATR assumption).

- True range = max(high−low, abs(high−prior close), abs(low−prior close)).
- Wilder ATR is seeded as the arithmetic mean of the first N true ranges, then smoothed by `(prior ATR × (N−1) + TR) / N`.
- Chandelier long = highest high(last L closed bars) − multiplier × ATR(N).
- Chandelier short = lowest low(last L closed bars) + multiplier × ATR(N).
- A long stop ratchets UP using max(old stop, new candidate); a short stop ratchets DOWN using min. Existing fixed stops remain as a protective floor/ceiling. No repainting from partially formed candles.
- Exact-venue historical OHLCV and subsequent finalized bar events only. No invented candles, no lookahead using open bars, no automatic stop loosening. Missing/incomplete history leaves dynamic ATR in 'waiting for verified closed bars'; any existing fixed stop remains, but there is **no ATR-derived protection until enough data exists**.
- **Fills are never created from historical bars**. A real fresh observed market tick must reach the stop. Simulated market fills occur at the observed tick with modeled costs, not magically at the requested stop.
- Can attach ATR protection on paper entry tickets (including resting orders after fills), per open position, or via a conditional THEN action.

## Known limitations

- PluTrade's paper engine is client-side. Closing/suspending a tab interrupts ongoing monitoring; offline price gaps and unobserved stops cannot be retrospectively executed. Real broker-side protective stops would require broker-native orders and per-account permission plus audited adapters.
- No evidence establishes one Chandelier parameter set as universally optimal. Test on your instrument/timeframe and account for volatility clusters, fees, spread and gaps. A 99% equity entry is a *very high allocation* and can be rejected by account risk checks.
- Chart drawings have geometry-specific support; unsupported shapes are not silently approximated. Rectangle zones are bounded by their configured start/end time.
- Live broker account automation is intentionally **not enabled** without a connected, explicitly authorized executor. No broker orders or transfers are submitted.
- History endpoint formats may differ across venues, so only providers delivering sufficient valid complete OHLCV bars can activate ATR.
- Dynamic order processing is NOT the same as native broker order placement or the full TradingView suite.

## Verification

CI runs TypeScript, existing paper and conditional regression checks, 110 Chandelier scenarios over ten repetitions, 110 advanced conditional/account-routing scenarios over ten repetitions, and Playwright interaction checks on the account-scoped builder and dynamic order ticket. The ten repetitions are focused, deterministic safety regression loops — not ten independent end-to-end production audits.
