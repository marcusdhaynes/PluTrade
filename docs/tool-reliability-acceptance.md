# Chart and drawing tool reliability acceptance

Scope: hardening of previously inert chart toolbar actions, persisted drawing settings, market recovery selection, and production Kraken Futures history.

## Data path and CORS
- Production plutrade.com requests Kraken Futures candles through its own read-only /api/kraken-history.php route. A GitHub Actions production probe returned 2,000 candles on Nov 23, 2026.
- The independent Vercel source has an exact CORS origin allowlist including plutrade.com, www.plutrade.com, and GitHub Pages; source tests check exact origin matching and preflight rejection. A GitHub commit alone does not deploy this separately hosted Vercel project.
- No synthetic market candles are substituted for missing source history. An alternative instrument requires explicit user choice.
- Chart recovery buttons cannot bubble into the pane's old-market click handler and revert user selection.

## Actions wired
- Chart legend price-series visibility, indicator settings, symbol picker, fit-to-content, and history reload.
- Remove the fixed, inert Indicator 14 controls and show the actual enabled indicator count with an edit action.
- Replace the misleading Remove Symbol control with a working Change Symbol picker.
- Navbar settings opens indicator controls. Quick drawing toolbar visibility can be toggled.
- Zoom In changes the active pane's visible logical range.
- Stay in Drawing Mode persists and keeps selected tools active after placement; changing tools discards incomplete points.
- Lock Drawings persists, prevents selected drawing modifications, disables Clear All, and suppresses selection/context menus. Unlock permits edits. Creating a new drawing remains possible when prior drawings are locked.
- Hide/Show drawings and color selection remain available.
- Go To Date targets only UTC dates with genuine loaded bars; the time-scale settings control spacing and right padding.
- Corrupted stored toolbar JSON falls back safely rather than crashing React.
- Nonfunctional TP/SL labels are explicitly presentational; the paper trade ticket handles protective orders.

## Test gates
- Existing proxy CORS unit tests and production history HTTP probe.
- Browser coverage for chart legend controls, dialogs, drawing lock and repeat mode, zoom, saved toolbar preferences, date navigation and time scale.
- Existing cross-browser recovery selection check.
- GitHub Pages requires TypeScript, unit tests and Chrome/Firefox/WebKit/mobile smoke before release. DreamHost and Pages jobs are reported independently.

## Boundaries
This is not a certification of every TradingView feature, every one of the 20+ drawing geometries, every feed, or real money trading. Browser UI tests use deterministic simulated provider responses only in isolated test runners; production requests real venue data. Additional defects must be diagnosed from the passing/failing checks rather than masked with artificial data.
