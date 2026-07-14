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

**Addable 4/7** (was 1/7 before fixes). **Corrections ≈ 0–1 per photo** (target: ≤1). Non-food lines: none present; soap-line auto-untick path verified by code (`include_default=false`), not by this fixture.

### Bugs the fixture exposed (now fixed)
1. Branded/qualified names ("Peeled Sambar Onion (Uritha…)", "NOICE High Protein Eggs") failed exact-only catalog match → not addable. Fixed with a token-subset fallback in `_catalog_id_for` (catalog name fully contained in scanned name → match; staples/spices skipped).
2. Receipt "1 x" parsed as **1 gram**. Fixed: `_doc_qty` trusts only real weight/volume units; a bare count → sensible editable default (never "1g").

### Known gap (deferred, not a regression)
- Packaged items whose contents are a catalog ingredient (frozen grated coconut → coconut) classify `packaged` and go to the KB, so they are **not addable to the pantry** until KB-backed pantry items land (S3b follow-up). Same limitation for any packaged/unmapped item.

### Cache note
`scan_cache` is keyed by image hash — re-tests must resize differently to force a cache-miss, else the prior (pre-fix) result is returned.
</content>
