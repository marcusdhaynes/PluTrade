# PluTrade

Trading workspace imported from the current TVClone project in Google AI Studio.

**Live app:** https://marcusdhaynes.github.io/PluTrade/

GitHub is the source of truth. The `Deploy PluTrade` workflow type-checks and builds every push to `main`, then deploys the verified artifact to GitHub Pages. No Google AI Studio publishing is used.

## Current scope

Charts, drawing tools, indicators, alerts, journal examples, paper positions, and browser-based conditional order simulation. Public WebSockets stream directly to the browser. The Coinbase Exchange Level 2 channel supplies genuine depth for supported Coinbase instruments; unsupported venues show unavailable depth rather than fabricated ladders. Kraken futures history uses a read-only Vercel function at https://plutrade-market-api.vercel.app/api/history because Kraken blocks direct cross-origin browser history requests. Its source lives in services/market-proxy; it has no broker keys or order endpoints. The function is deployed separately from the Pages workflow. Market coverage, interval aggregation, and candle accuracy remain under validation. Some account, journal, alert, news, and watchlist values are demonstration or snapshot data. No broker account or real-money execution is connected. Bots and alerts cannot run reliably while this browser page is closed.

Fabricated history, fallback heartbeat ticks, generated depth, and seeded tape entries have been removed from the active market-data path. Missing feeds do not generate fake candles. Derivatives history never silently falls back to spot history. The preview does not provide equities/forex data through the old AI Studio-only proxy.

The automated browser UI suite uses explicit empty external-feed fixtures so a third-party CORS outage cannot masquerade as a browser rendering regression. Real exchange connectivity and candle accuracy require separate provider-backed tests; no mock feed is used in the published application.

## Development

Use Node.js 22 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm run lint
GITHUB_PAGES=true pnpm run build
```

Public market feeds require no API key. Never put broker or AI credentials in this frontend, repository, build variables, or browser storage. Future broker connections need an authenticated backend, risk validation, durable order reconciliation, and a secret store.

## Architecture

See [the architecture assessment](docs/architecture.md). Recommended direction: TypeScript/Vite web client with Canvas charts; Rust/Tokio streaming, execution and risk services; Postgres ledger; broker capability adapters; sandboxed automation; PWA followed by benchmarked native packaging. These are design recommendations, not implemented features or measured performance guarantees.

Charts use [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts). Preserve its license, NOTICE, and creator attribution.

## Round 12 — Strategy Lab (research only)

The Strategy Lab dock tab offers a safe, declarative visual rule builder (SMA/EMA/RSI/close comparisons and AND/OR), long/short historical simulation, modeled fees/spreads/slippage, protective stops and targets, editable validated rule JSON, local browser-only strategy saves, comparisons, trade CSV export, in-sample SMA parameter ranking, and a 70/30 train/holdout walk-forward SMA evaluation. The top-bar Replay button opens the existing independent replay workspace. Tests enforce valid history and next-open fills. These are not Pine Script compatibility, automatic broker execution, verified live fills, multi-market testing, or AI-powered optimization. Statistics are based on close-marked equity; bar Sharpe/Sortino are not annualized and do not establish forward profitability. Holdout outcomes need enough history and trades before interpretation.

The Strategy Lab also includes a manual, research-only multi-market scan of up to six independently fetched exact venue instruments. It shows each instrument's latest completed-bar entry/exit indication and individually backtested outcomes or an explicit unavailable-history error. It does not monitor markets continuously or create live alerts.

## Round 13 — Chart recovery and UTC session VWAP

New installations begin with the public Coinbase BTC-USD spot chart. A saved exact venue/instrument selection is never overwritten by this default change. Historical series are never manufactured, and the chart now explains when exact-provider candles are unavailable, lets the user retry or try a supported interval, and offers explicit alternate venue markets. The chart workspace has a real flex-allocated viewport; the paper dock height is viewport-capped to preserve chart visibility. The top toolbar provides an optional UTC Session VWAP based on venue OHLCV typical price × bar volume, NOT tick-level volume profile and NOT exchange-session-aware VWAP.

**Kraken Futures production dependency:** The separately hosted Vercel function at `services/market-proxy/api/history.js` now explicitly allows the PluTrade production origins, retaining exact-origin CORS. Updating repository source alone does not redeploy the separately hosted Vercel function. A production Vercel deployment and endpoint verification are required before claiming the Kraken Futures chart works from plutrade.com. Existing Coinbase spot history is browser-requested directly. When unavailable, the UI describes the missing data instead of inventing candles.

**DreamHost Kraken Futures:** plutrade.com also ships a same-origin, fixed-Kraken-host, whitelisted-read-only PHP history endpoint at `/api/kraken-history.php`, deployed from `public/api/` through GitHub Actions. It avoids browser CORS dependency on the separately deployed Vercel function for this domain; GitHub Pages continues to use Vercel. The PHP endpoint must be verified after deployment before declaring Futures history available, and it returns an explicit error rather than made-up candles if Kraken is unreachable.
