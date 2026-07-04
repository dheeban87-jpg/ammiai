# AmmiAI — Product Requirements (PRD)

## Overview
AmmiAI is an Android/iOS Tamil home-kitchen manager built with Expo + FastAPI + MongoDB. It combines a smart pantry, meal planning with Tamil combo rules, a weekly calendar, and a grocery list generator. Dishes are shown with English names and Tamil subnames.

## Design system
- Background: rice-white `#FBF8EF`
- Primary: banana-leaf green `#1E5631` (dark header `#143D22`)
- Accent: turmeric `#E3A008`
- Alert: chili `#B5451B`
- Rounded cards, 8pt spacing grid.
- Typography: English headings in Baloo 2, Tamil in Noto Sans Tamil, body in system font.

## Data foundation (loaded from JSON on backend startup)
- `shelf_life.json` → `ingredients` collection (69 items). Fields: `ingredient_id`, `name`, `category`, `pantry_days`, `fridge_days`, `alert_before_days`.
- `recipes_ammiaai_v2.json` → `recipes` collection (67 items). Fields: `id`, `name_en`, `name_ta`, `category` (kuzhambu / poriyal / kootu / rasam / tiffin / variety_rice / nonveg / accompaniment), `diet`, `spice_level`, `prep_time_min`, `ingredients[]`, plus nutrition & combo partners.
- `meal_combination_rules.json` → `meal_rules` collection. Fields: `meal_templates`, `nonveg_rule`, `pairing_rules`, `avoid_rules`, `protein_guard`, `daily_nutrition_targets_icmr`, `balance_advice_display`.

## Slice roadmap (5 slices)
- **Slice 1 (done)**: Load data + skeleton shell with bottom nav (Home / Pantry / Plan / Calendar / Grocery) + design system.
- Slice 2: Pantry CRUD with shelf-life alerts.
- Slice 3: Meal planning with combo/pairing rules.
- Slice 4: Weekly calendar view + drag/rearrange.
- Slice 5: Grocery list generation from plan minus pantry.

## Backend API (Slice 1)
- `GET /api/` — health.
- `GET /api/stats` — counts + recipe category breakdown.
- `GET /api/ingredients` — list all ingredients.
- `GET /api/ingredients/{id}` — one ingredient by `ingredient_id`.
- `GET /api/recipes?category=&diet=` — list recipes (filterable).
- `GET /api/recipes/{id}` — one recipe by `id`.
- `GET /api/meal-rules` — full meal rules document.

Seeding runs on FastAPI startup and is idempotent (drop + reinsert so source-of-truth files are always reflected).
