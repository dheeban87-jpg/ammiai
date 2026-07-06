# AmmiAI × ONDC — Integration Roadmap

**Status: planned, post-launch.** The grocery screen already shows the entry
point ("Order via ONDC — coming after launch").

## Why ONDC

Quick-commerce apps (Blinkit / Zepto / Instamart) expose no public APIs for
catalog, stock, or cart. ONDC (Open Network for Digital Commerce, ondc.org) is
India's government-backed open network where any registered **Buyer App** can:

- Search seller catalogs near the user's location (kiranas, grocery chains)
- See **live availability and real prices** per item
- Build a cart and **place the order** end-to-end, with payment + fulfilment
- All sanctioned — no scraping, no ToS risk, Play-Store safe

This is the legitimate version of "suggest what's in store": AmmiAI's meal
plan → grocery gap list → matched against live ONDC catalogs → one-tap order.

## What it unlocks in AmmiAI

1. **Availability-aware planning** — "beans unavailable nearby; swap tonight's
   poriyal to cluster beans?" (meal engine already supports swaps)
2. **Real prices in the grocery list** — replace static estimates with live
   quotes; budget report becomes exact
3. **True one-tap ordering** — the cart handoff that deep links can't do
4. **Kirana-first commerce** — aligns with the family/local-shop audience

## Requirements (why this is post-launch)

- Register AmmiAI as an ONDC **Buyer Network Participant** (legal entity,
  subscriber ID, signing keys)
- Implement the Beckn protocol flows: `search → select → init → confirm`,
  plus callbacks (`on_search`, `on_select`, …) — needs a stable public
  backend URL (ties into the Railway/Render migration)
- Staging-gateway certification before production access
- Payment/settlement decisions (buyer-app-collected vs seller-collected)

## Incremental plan

| Phase | Scope |
|-------|-------|
| 0 (done) | Grocery gap engine (plan → pantry check → deficit list), price capture, habit reports |
| 1 | Backend on stable public host; register on ONDC staging |
| 2 | `search` integration: show live nearby availability + prices next to grocery items |
| 3 | Cart + `confirm`: full ordering inside AmmiAI |
| 4 | Availability-aware dish suggestions in the planner |

## References

- https://ondc.org / network participant onboarding
- Beckn protocol spec: https://becknprotocol.io
- ONDC retail (grocery) domain: ONDC:RET10
