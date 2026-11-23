# Round 13 — Visible charts, verified data, and session volume tooling

Date: November 22–23, 2026. This is a discrete chart-recovery increment, not the entire TradingView feature set.

## Root cause investigated
- The live website is hosted at https://plutrade.com, but the separate Kraken Futures Vercel history handler allowed only GitHub Pages and a localhost development origin. Browser cross-origin requests from plutrade.com therefore had no CORS authorization.
- The React chart intentionally removed all plotted series when the selected exact venue returned no history, but displayed no actionable explanation.
- The chart workspace shared vertical flex space with a fixed-height paper dock without a dedicated flex-allocated viewport, so smaller viewports could leave very little usable chart area.
- No synthetic candles or prices should be introduced to hide any of the above.

## Implemented in this source increment
- Strict explicit CORS allowlist for plutrade.com and www.plutrade.com, retaining GitHub Pages and local development origins, and verified OPTIONS behavior. The public history handler remains read-only with validated instruments.
- New installations default to Coinbase BTC-USD spot (a supported public historical feed), not Kraken ARB perpetual. Existing persisted exact market identity and timeframe are never forcibly replaced.
- Empty/unsupported exact-market history shows visible state, provider and symbol, direct retry, one-minute recovery and explicit separately identified alternative spot markets. Missing history is not interpolated or substituted.
- Primary and secondary panes retain their own load/empty/error state and safe retry.
- Chart workspace allocated a dedicated flex-1 min-height-zero region, and the dock is capped to a percentage of viewport height.
- Optional UTC Session VWAP overlay derived from real OHLCV typical price and volume, resetting at each midnight UTC. No claim of tick-accurate trade VWAP or true per-price volume profile.
- CI gates: TypeScript, unit regression tests, read-only market proxy CORS tests, production bundle, and cross-browser/multi-device UI tests. Browser tests include a real app chart becoming visible after a deterministic mocked provider response without allowing fake data in production.

## Release boundaries
- A green GitHub Pages or DreamHost frontend build does not deploy the separately hosted Vercel market-history endpoint. Separately deploy that Vercel function before saying live Kraken Futures history works from plutrade.com.
- Local/browser market CORS/network policy remains outside our control. The recovery UI provides honest status and alternate market selection; it cannot guarantee every venue will be accessible in every region.
- No broker execution, order permissions, strategy automation, or private account credentials are affected.
- No market-data integrity claims are made solely from mocked browser UI tests; provider-backed CORS, OHLC accuracy and time alignment still require independent verification.
- Chart session VWAP uses UTC day rather than the instrument exchange session and is derived from bar aggregates rather than individual trades.

## Next work after verification
- Authorized Vercel proxy production deployment and live origin/GET validation.
- Real source-error codes and feed-age tracking with robust reconnection diagnostics.
- True volume profile and footprint only with licensed, granular trade/volume-at-price data, with provenance and missing-data indicators.
- Drawing object manager and per-pane indicator presets; chart perf benchmark with 16 panes and 100k+ bars.
