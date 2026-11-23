# Alerts and Paper Trading — verified functional parity increment

Status: implementation and tests subject to GitHub Actions outcome. Source is not a representation of an exact TradingView clone.

## TradingView references and deliberate differences

TradingView currently documents crossing, crossing up/down, greater/less than, entering/exiting channels; "only once", every-time, once-per-minute, once-per-bar, once-per-bar-close frequencies; and hosted/mobile/webhook delivery. Paper Trading documents an order ticket, market/limit/stop, attached exits, account manager, and full order-history states.

PluTrade adds the following in this increment:
- Exact-venue typed price alerts: crossing up, crossing down, crossing either direction, greater, less; once/every/once-per-minute/once-per-bar/once-per-bar-close; optional expiration.
- Bar-close alert processing only from completed feed candles on exactly matching timeframe. Intrabar ticks do not fire once-per-bar-close alerts. Crosses need a genuine previous observation.
- Current browser notifications are explicitly permission-gated. Alerts and history persist locally, but are not 24/7 hosted; a sleeping/closed tab cannot guarantee delivery.
- Repeated alerts remain armed and record last trigger and per-bar/minute deduplication. "Only Once" is terminal until rearmed.
- Existing unmatched/ambiguous legacy alerts remain paused; never remap a market by ticker alone.
- Paper resting order amendments: quantity/entry price/stop-limit execution price, original order ID retained, strict exact-venue live quote requirement, account margin/reservation rechecked, expired and triggered stop-limit modification refused.
- A marketable limit amendment refuses implicit execution; users must use the explicit reviewed order ticket for an immediately executable entry.
- Paper order history now shows every recorded event (submitted, activated, amended, filled, canceled, expired) rather than only the earliest event for each order.
- No live broker API or deposits/withdrawals are triggered by Paper Trading. Quote integrity and account currency restrictions remain enforced.
- Regression suites: 11 alert cases repeated ten times, ten order amendment cases repeated ten times, and UI/browser coverage of alert setup and the pending-order workflow.

## Limitations: not represented as implemented

- Always-on hosted alert evaluation, scheduled worker redundancy, server push, SMS/email, signed webhook dispatch, account identity across devices, and historical alert backfill are NOT provided by the browser-only flow.
- Indicators/strategy/drawing alerts with all TradingView operators and payload templates, drawing-channel alerts, exchange session rules, proprietary Pine Script execution and every TradingView order feature are NOT implemented by this increment.
- "Every Matching Update" can be noisy if the selected condition remains true. Bar-based alerts require a supported active venue/timeframe; unsupported bars are not synthesized.
- Simulated fills are driven by verified observed market events, but cannot reproduce actual exchange depth, spread/partial execution/queue priority, or TradingView's proprietary simulator exactly.
- Order "Day" currently means 24 elapsed hours in the existing engine rather than exchange-defined close; the UI should be interpreted accordingly.
- Preventing lost trades from browser suspension requires a server-authorized durable execution worker, not a hidden browser timer.

## Verification

The unit tests enumerate safety invariants and run ten cycles on fresh scenarios. GitHub Actions TypeScript, production build, paper tests, E2E and deploy logs must be read before making a completion claim. The unit loop is not ten independent full browser-to-production audits.
