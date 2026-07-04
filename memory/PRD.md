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
- Slice 2 (next): Meal planning with combo/pairing rules.
- Slice 3: Weekly calendar.
- Slice 4: Grocery list generation.
- Slice 5: Analytics & insights.

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

## Frontend routes
- `/sign-in` — Google + phone options
- `/onboarding` — 6-step wizard
- `/(tabs)/index` — Home (personalized, top expiring, profile card)
- `/(tabs)/pantry` — pantry list
- `/(tabs)/plan | calendar | grocery` — empty states (later slices)
- `/pantry/add` — modal add flow
- `/dev-menu` — reset onboarding + logout
