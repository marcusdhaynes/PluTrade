# PluTrade Round 12 — Strategy Lab acceptance and limitations

Implementation date: November 22, 2026. This increment must pass CI before it is described as deployed.

## Scope delivered in source
- Declarative versioned rule schema with bounded SMA, EMA, RSI and close operands, numeric thresholds, crossings, comparisons, AND/OR logic, and per-strategy long/short mode.
- Browser visual rule editor, validated JSON editor, locally saved strategy, and trade CSV export.
- Deterministic research backtest using native, continuous, complete candles from the venue selected in the workspace. Signals from fully closed candle n are eligible only at candle n+1 open. Historical gaps, malformed prices, and forming candles are refused.
- Conservative stop-first behavior when one OHLC bar intersects stop and target; open-gap behavior priced at bar open; execution assumptions include adverse modeled spreads, slippage, and entry/exit fees.
- Single-symbol comparison, grid search over 20 bounded SMA pairs, and chronologically separated 70% train / 30% untouched holdout selection and evaluation. Selection uses training return minus max close-based drawdown and excludes candidate results with fewer than two completed trades.
- Per-bar, unannualized Sharpe and Sortino, expectancy, win rate, profit factor, exposure, close-based drawdown and elapsed bars, equity curve, and trade-level report.
- The previously disabled Replay button in the top chart toolbar opens the existing independent Replay & Backtest dock tab; existing chart state and paper accounts are not mutated.
- The new engine test is included in the full test:paper suite that gates the Pages build.

## Model boundaries
- Execution and price assumptions are simulations, not observed fills. OHLC does not establish event order inside a bar; conservative stop-first rules may differ from actual market execution.
- Short positions use a simple unlevered notional model; margin calls, financing, borrow fees, liquidation, market impact, exchange-specific limitations, queue position, and partial fills are not simulated.
- The active asset/timeframe determine the research dataset. Only supported intervals and qualifying provider histories are enabled. This increment does not add new live feeds or fabricate missing bars.
- The visual/JSON strategy format is not Pine Script or arbitrary JavaScript/Python execution. No AI-assisted generation, broker automation, webhook delivery, cloud sync, multi-asset backtest, or executable alert integration is enabled in this increment.
- In-sample grid searches can overfit. Walk-forward holdout is a single chronological split with fresh indicator warmup; multi-fold validation remains future work.
- No strategy result or visual rule can place a paper or real broker order. Existing security boundaries remain intact.

## Verification gates
1. TypeScript: pnpm run lint.
2. Unit/fault checks: pnpm run test:paper, including strategyLab.test.ts.
3. Production bundle: pnpm run build and existing cross-browser Playwright workflow.
4. Confirm final published main SHA at Pages version manifest and verify DreamHost independently.
5. Manual smoke: open Strategy Lab, load qualifying history, edit rule, run, compare, optimize, holdout, save/load, export, switch market, click toolbar Replay.
6. 10x workload stress and broad venue coverage are not proven by these tests and must not be claimed.

## Subsequent increments — NOT implemented
- Sandboxed typed scripting language with static compiler and version control.
- Multi-venue, multi-timeframe portfolio evaluation and custom strategy screener.
- Multi-fold walk-forward, Monte Carlo, regimes and deeper parameter sensitivity.
- Durable authenticated strategy alerts with notification delivery.
- AI rule assistant with evidence, provenance and policy review.
- Authorized broker adapter with risk-validated, auditable execution.
