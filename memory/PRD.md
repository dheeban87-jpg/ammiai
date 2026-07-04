# AmmiAI — Product Requirements (PRD)

## Overview
AmmiAI is a Tamil home-kitchen manager (Expo + FastAPI + MongoDB). Smart pantry, meal planning with Tamil combo rules, weekly calendar, grocery lists. Dishes display English + Tamil names.

## Design system
- Background: rice-white `#FBF8EF`
- Primary: banana-leaf green `#1E5631` (dark header `#143D22`)
- Accent: turmeric `#E3A008`
- Alert: chili `#B5451B`
- Typography: English headings in Baloo 2, Tamil in Noto Sans Tamil, body system.

## Slice roadmap
- **Setup (done)**: 3 JSON data files loaded, app shell with bottom nav.
- **Slice 1 (done)**: Onboarding (auth + profile) + Pantry.
- **Slice 2 (done)**: Deterministic meal plan engine + Plan tab + Home rings/rescue/cook-now.
- **Slice 3 (done)**: Calendar tab (month grid + day edit + bulk-generate + share as image).
- **Slice 4 (done)**: Grocery tab (auto shopping list, order deep-links, order-placed bulk-add, cooked → pantry deduction + streak).
- Slice 5 (next): Analytics & insights.

## Grocery + Cooked flow (Slice 4)
- `GET /api/grocery/list?days=N` — sums ingredients across planned meals in the window × household_size, minus current pantry stock (base-unit conversion), grouped into Leafy & Herbs / Vegetables / Protein / Dairy / Staples / Spices & Oils / Other, with ₹ estimates from `pricing.json`. Staples like salt / sugar / turmeric / spice powders / curry_leaves are excluded (`_GROCERY_STAPLES`).
- Frontend: `/(tabs)/grocery` — sticky Next 7 / Next 14 toggle, per-item checkbox (already-have), summary bar (items/days/people/₹), category cards, sticky bottom action bar with:
  - Copy list (Clipboard.setStringAsync) + WhatsApp (`wa.me/?text=…`)
  - Blinkit / Instamart / Zepto brand-colored order buttons → sheet with per-item deep-links (`blinkit.com/s/?q=`, `swiggy.com/instamart/search?query=`, `zepto.co.in/search?query=`) + "Open N items" bulk action.
- `POST /api/grocery/order-placed {items:[{ingredient_id, qty, unit}]}` — bulk-adds items to pantry with purchase_date=today. Merges existing pantry rows in base units (no duplicates). Default storage inferred from ingredient shelf_life (pantry_days vs fridge_days).
- MealCard "Cooked" button (chili-colored, next to Swap) on non-static dishes. `POST /api/plan/{date}/cooked {meal, recipe_id}` deducts recipe ingredients (× household_size, excluding staples) from pantry rows in base units. Empties → deleted. Marks the plan item `cooked=true + cooked_at`. Increments streak (same-day idempotent, +1 for consecutive days, resets after gap).
- `GET /api/streak` — `{current_streak, longest_streak, total_cooked, last_cooked_date}`.

## Auth
- **Google**: Emergent-managed OAuth via `https://auth.emergentagent.com`, backend exchanges `session_token` via `/api/auth/google/session` → returns 7-day bearer token, user upserted by email.
- **Phone OTP (MOCKED)**: `/api/auth/phone/send` accepts any Indian phone; `/api/auth/phone/verify` accepts any 6-digit code. Real Twilio integration deferred.
- Bearer token stored in `expo-secure-store` (native) or `localStorage` (web via SecureStore fallback).

## Onboarding (5 profile steps + 1 pantry step, one-time)
1. **Name** (from OTP flow this is prefilled)
2. **Diet** (veg / eggetarian / nonveg)
3. **Household size** (1–10 stepper) + **spice level** (mild / medium / hot)
4. **Favorite dishes** (15 curated chips + "See all 67" toggle) + **allergies/avoids** (chip toggles + comma-separated custom)
5. **Health (optional)**: height + weight → live BMI + category, goal chips (weight loss / diabetic-friendly / BP-friendly / high-protein / balanced) + medical disclaimer
6. **Pantry quick-add**: one-tap Basic Tamil Kitchen bundle (Rice 5kg, Toor 1kg, Urad 0.5kg, Tamarind 0.25kg, Onion 1kg, Tomato 0.5kg, Oil 1L, Curd 0.5L)

`onboarding_complete` flag on profile document → root layout redirects to `(tabs)` on true, `/onboarding` on false, `/sign-in` on unauth.

## Pantry
- List grouped by category display buckets: Leafy & Herbs / Vegetables / Dairy / Protein / Staples / Spices & Oils / Other.
- Each row: category icon (central `ingredient-icons.ts` — swappable later for custom images), name, `{qty} {unit} · {storage}`, freshness dot + label, days-left.
- **Freshness logic**: `expires = purchase_date + (storage === 'fridge' ? fridge_days : pantry_days)` from `shelf_life.json`. Days-left = expires - today. Colours:
  - green = fresh (> alert_before_days)
  - yellow = ≤ alert_before_days (Use soon)
  - red = ≤ 1 day (Expires ≤1d)
  - unknown = no purchase date / no shelf data
- **Sticky filter chip row** (horizontal scroller, height 56, chip 36): All, Expiring (yellow+red combined), Pantry, Fridge.
- **Add flow** (`/pantry/add` route, full-screen modal): search all 69 ingredients → select → qty + unit picker (g / kg / ml / L / piece) + storage segment + purchase date input (default today).
- **Row actions** (bottom sheet on tap):
  - Used one — decrements qty by 1, deletes at 0
  - Discard — moves to `waste_log` with `estimated_inr` calculated from `pricing.json` (54 entries) with unit conversion (g↔kg, ml↔L)
  - Remove (no log) — silent delete
- Home shows top-5 expiring items + waste ₹ total.

## Data
- `ingredients` (69) from `shelf_life.json`
- `recipes` (67) from `recipes_ammiaai_v2.json`
- `meal_rules` (1) from `meal_combination_rules.json`
- `pricing.json` (54 items, hardcoded ₹/unit, will be replaced with live prices later)

## Backend API
Public: `/api/`, `/api/stats`, `/api/ingredients[/{id}]`, `/api/recipes[/{id}]`, `/api/meal-rules`.
Auth: `/api/auth/google/session`, `/api/auth/phone/send`, `/api/auth/phone/verify`, `/api/auth/me`, `/api/auth/logout`.
Profile: `GET/PUT /api/profile`, `POST /api/profile/reset` (dev).
Pantry: `GET/POST /api/pantry`, `POST /api/pantry/bundle`, `PATCH /api/pantry/{id}`, `DELETE /api/pantry/{id}`, `POST /api/pantry/{id}/discard`.
Waste: `GET /api/waste-log`.

## Meal Plan Engine (Slice 2)
- Deterministic engine in `/app/backend/meal_engine.py`. Loads `meal_combination_rules.json` templates + avoid_rules.
- Scoring per recipe: `pantry_ratio + 0.25×expiring_hits + 0.20 favorite + 0.10×goal_tag_matches + 0.30 zero_shop - 0.15 week_variety_penalty` (non-staple ingredients only; `STAPLE_ALWAYS` set skips common spices).
- Meal templates: `breakfast = tiffin + accompaniment/kuzhambu`; `lunch_full = plain_rice_130 + kuzhambu(or nonveg gravy for nonveg users, max 3×/week) + poriyal + optional kootu + optional rasam + curd_serving`; `dinner = dinner_tiffin(tiffin+accompaniment) OR dinner_light_rice(plain_rice_100 + rasam/kuzhambu + poriyal)`.
- Avoid rules enforced: `max_sour_dishes_per_meal` (sambar excluded via `sour_ids`), `max_coconut_heavy_per_meal`, `same_veggie_once_per_day` (heuristic vegetable extractor), `same_dish_max_2x_per_week` (7-day rolling from `meal_plans`), `no_curd_with_fish` (fish ids: nv_meen_*, nv_era_*).
- Protein guard: if day total < 0.83g × weight (default 60kg = 49.8g), add `tg_paruppu` to lunch (subject to allergy/rule checks); for eggetarian/nonveg, also add `nv_omelette` to breakfast. Falls back to a note-only guard if user's diet+allergy combo blocks both.
- Static "slot fillers": `plain_rice_130`, `plain_rice_100`, `curd_serving` — flagged with `static=true` so UI marks them as Base.

### Plan endpoints
- `POST /api/plan/generate {date?, seed?, force?}` — idempotent by date (returns cached unless `force`).
- `GET /api/plan/today` — auto-generates if missing.
- `GET /api/plan/week` — 7 days from today, generating missing days.
- `GET /api/plan/swap-options?date=&meal=&recipe_id=` — up to 3 alternates same category, obeying rules.
- `POST /api/plan/swap {date, meal, current_recipe_id, new_recipe_id}` — updates in place + recomputes nutrition + rings.
- `GET /api/plan/nutrition-targets` — daily targets adjusted for user weight + goals (weight_loss 0.85× kcal, high_protein ≥70g etc.).
- `GET /api/rescue-dishes` — recipes using at least one expiring pantry item (sorted by hits count).
- `GET /api/cook-now` — recipes with `pantry_ratio == 1.0` (zero-shopping).

## Plan tab UI (Slice 2)
- Today/Week segmented toggle.
- **Today**: Daily rings card (Calories/Protein/Fiber vs targets), optional protein-guard banner, 3 meal cards each with:
  - Meal icon + English + Tamil title, status chip (✅ Balanced / ⚠️ Low protein / ⚠️ Heavy) at right.
  - Dish rows: English name (+ optional qty for static items) + Tamil subname + pantry meta (`60% in pantry` / `0 shopping` / `· uses expiring`).
  - `Swap` button per non-static dish (opens bottom sheet with 3 alternates each showing pantry% + kcal + expiring/favorite chips). Static items show `Base`.
  - Footer: kcal / P / Fiber chips per meal.
- Regenerate FAB (bottom-right) — POST /plan/generate with `force=true` + new seed.
- **Week**: FlatList of 7 day cards each with date, `X/3 balanced` badge, mini rows per meal (dish list + tiny chip), and day totals footer.

## Home tab additions (Slice 2)
- Today's balance card with 3 rings (svg-based, `NutritionRing` component in `src/components/nutrition-ring.tsx`).
- Existing pantry stat pills + expiring row.
- **Rescue dishes** horizontal scroll — shown inside the expiring block when at least one pantry item is yellow/red.
- **Cook now from your kitchen** — horizontal scroll of zero-shopping dishes (green outline card + `0 shopping` tag).

## Frontend routes (updated)
- `/(tabs)/index` — Home with rings + rescue + cook-now
- `/(tabs)/plan` — Today/Week plan with swap + regenerate
- `/(tabs)/pantry` — existing
- `/(tabs)/calendar` — month grid with day cells (3-meal preview), today turmeric-highlighted, tap empty → plan day, tap planned → day edit, "Plan rest of month" CTA, "Share as image" export
- `/(tabs)/grocery` — later slice
- `/pantry/add`, `/sign-in`, `/onboarding`, `/dev-menu` — unchanged
- `/plan/day/[date]` — full-day edit panel with 3 rings, 3 meal cards + swap sheet with per-rule violation warnings (allowed to keep). Reuses `MealCard` + `SwapSheet` shared components (`src/components/`).

## Calendar backend endpoints (Slice 3)
- `GET /api/plan/month?year=&month=` — returns `{year, month, days_in_month, plans:{iso_date: plan_doc}}`
- `POST /api/plan/bulk-generate {start_date, end_date, only_empty:true}` — plans missing days in the range (max 45 days), returns `{created:[...], skipped:[...]}`
- `POST /api/plan/swap` — now returns `{...updated_plan, violations:[{rule, message, suggested_fix}]}`. `_detect_swap_violations` checks max_sour, max_coconut_heavy, same_veggie_once_per_day, no_curd_with_fish. Manual swap is applied regardless — user retains override, warning surfaced in UI.
- `manual_edits` counter on `meal_plans` doc increments per manual swap.

## Image export (Slice 3)
- `react-native-view-shot` wraps the month grid; on web `captureRef` returns a data URI (triggered as a PNG download); on native uses `Sharing.shareAsync` with `image/png` mime.
