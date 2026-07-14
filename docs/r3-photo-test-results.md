# R3 / S3c — real-photo scan test results

Live tests against `https://ammiai-backend.onrender.com/api/scan` (not synthetic).

## S3c — Instamart order screenshot (mandatory fixture)
Fixture: `test-fixtures/instamart-order-2026-07-13.jpg` (7 items + a Kiwi ad banner).
Classified `document_list`, `source_guess: "Instamart order screenshot"`, ad ignored, all 7 lines extracted.

### After the S3c fixes (commit 1b5e069) — token-subset catalog match + real-weight-only qty
| Line | Mapped to | Category | Addable | Qty | Verdict |
|---|---|---|---|---|---|
| Wow! Coco Frozen Grated Coconut | (KB) | packaged | no | 300g | ⚠ packaged → KB (not catalog `coconut`) |
| TenderCuts Prawns (Medium) Peeled | prawns | meat_fish_egg | **yes** | 300g | ✅ |
| Peeled Sambar Onion (Uritha…) | onion | vegetable | **yes** | 300g | ✅ token match |
| iD Fresh Peanut Chutney | (KB) | packaged | no | — | ✅ correctly not inventory |
| Banana Leaves | — | serving_item | no | — | ✅✅ per brief |
| Onion (Vengayam) | onion | vegetable | **yes** | 300g | ✅ |
| NOICE High Protein Eggs | eggs | meat_fish_egg | **yes** | 4pc | ✅ match + count qty |

**Addable 7/7 after S3b** (4 catalog-direct + 3 via the KB path; was 1/7 before any S3 fixes). **Corrections ≈ 0 identity/category per photo** (target ≤1). Non-food lines: none present; soap-line drop path verified by code (`include_default=false`), not by this fixture.

### Bugs the fixture exposed (now fixed)
1. Branded/qualified names ("Peeled Sambar Onion (Uritha…)", "NOICE High Protein Eggs") failed exact-only catalog match → not addable. Fixed with a token-subset fallback in `_catalog_id_for` (catalog name fully contained in scanned name → match; staples/spices skipped).
2. Receipt "1 x" parsed as **1 gram**. Fixed: `_doc_qty` trusts only real weight/volume units; a bare count → sensible editable default (never "1g").

### Known gap — RESOLVED by S3b (commit 36589e7, verified live 2026-07-14)
- Packaged/novel items now become **KB-backed pantry items** (`source:"kb"`), so all 7 lines are addable in one batch confirm. A KB item carries a `maps_to` catalog id computed at add-time, so frozen grated coconut → `coconut` still counts toward "What can I cook?"; genuinely novel items (peanut chutney) add as inventory with category-average nutrition and `maps_to:null`. Verified: `POST /api/pantry {kb:true,…}` → 200, `from_kb:true`, category shelf-life applied.

### Cache note
`scan_cache` is keyed by image hash — re-tests must resize differently to force a cache-miss, else the prior (pre-fix) result is returned.
</content>
