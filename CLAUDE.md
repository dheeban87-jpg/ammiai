# AmmiAI — Project Handoff & Working Rules

Claude Code: read this fully before touching anything. It encodes months of hard-won
lessons from the previous phone-only workflow. The owner (Dheeban, GitHub
`dheeban87-jpg`) is a solo non-traditional developer — explain decisions plainly,
flag risks proactively, and never assume he wants complexity.

## What this app is

**AmmiAI** — a health-first Tamil family kitchen assistant (Android, Play Store
target). Core loop: health profile → personalized nutrition targets → grocery
suggestions → pantry management → dish recommendations. Mascot: **Capt. Charmer**,
a drill-sergeant panda dietician (app copy addresses the user as "soldier" —
gruff but caring tone; keep it).

**Positioning:** pantry-first, dish-based (users think "Sambar", never "100g of
lentils"), Tamil + English bilingual, grounded in IFCT 2017 nutrition data and
ICMR-NIN 2024 dietary guidelines.

## Stack & layout

- `frontend/` — React Native + **Expo SDK 54**, expo-router (tabs), TypeScript.
  Key dirs: `app/(tabs)/` (Home/Pantry/Plan/Calendar/Grocery), `app/` (onboarding,
  settings, sign-in, plan/day, plan/review, cook), `src/components/`, `src/theme.ts`.
- `backend/` — FastAPI + MongoDB (`server.py` ~2700 lines, `meal_engine.py`,
  `data/` JSON: `recipes_ammiaai_v2.json` 73 dishes, `shelf_life.json` 98
  ingredients, `health_focus_rules.json` 8 health focuses).
- Fonts: Baloo2 (headingEn SemiBold, headingBold ExtraBold). Palette:
  bananaLeaf `#2F6B3F`, bananaLeafDark `#1E4A2C`, turmeric `#D99A26`,
  chili `#B8432F`, riceWhite `#FBF8EF`.

## ⛔ CRITICAL RULES — never violate

1. **Bundle ID stays `com.ammiai.app`**, scheme stays `ammiai`. Emergent's agent
   once tried to change these — never accept that.
2. **Never touch `backend-url.txt`** and **never commit/overwrite `backend/.env`**
   (holds MONGO_URL, DB_NAME, ANTHROPIC_API_KEY on the Emergent host).
3. **NEVER merge the `EMupdate` branch.** It is a stale Emergent workspace dump
   with 15,791 deletions that would wipe the CI pipeline and months of work.
   Leave it as a dead backup. If Emergent pushes new branches, audit diffs
   before taking ANYTHING (past useful extractions were 2 lines out of 15k).
4. **Backend changes only go live after the owner clicks "Deploy Now" in
   Emergent** (app.emergent.sh). Remind him EVERY time a batch touches
   `backend/`. Frontend ships via APK builds, independent of deploy.
5. **Health content framing:** always "supports your health focus / general
   wellness guidance… consult your doctor". NEVER "cures/treats/prevents" any
   condition. This is Play Store medical-claims compliance — non-negotiable.
6. **`.github/workflows/` files** (`apply-zip.yml`, `build-apk.yml`) are the
   build pipeline. With local git you can now edit them directly (the old
   zip-bot couldn't) — but treat them as production infrastructure.

## Deployment pipeline (current)

- `main` on GitHub is the single source of truth.
- Push to main → GitHub Actions `build-apk.yml` builds the APK (~20-30 min);
  owner installs it directly on his phone (no Play Store yet).
- Emergent (`tamil-kitchen-ai.emergent.host`) one-way syncs FROM GitHub, then
  needs manual **Deploy Now** for the backend to go live.
- The old phone workflow used delta zips + `apply-zip.yml`; with Claude Code,
  commit/push directly instead. Keep `apply-zip.yml` functional as fallback.

## Current state (as of handoff, 2026-07-10)

- Repo main: **v1.6.6 / versionCode 31** (commit "Apply update zip: 25").
- ⚠️ **PENDING FIX — do this first:** the home screen
  `frontend/app/(tabs)/index.tsx` still contains the broken `PandaRoom`
  (panda images had fake transparency — checkerboard baked in). A fix batch
  ("batch34", v1.7.1/33) exists as `ammiai-batch34.zip` on the owner's phone;
  he may apply it, or you replicate it:
  1. Revert home to the clean dashboard version (exists in git history — the
     pre-room version from commit "Apply update zip: 22"; it has NO
     PandaRoom/HomeHero imports, uses welcome text + rings + rescue/cook-now).
  2. Replace `frontend/assets/veeran/home/splash.png` with a clean branded
     splash (NO checkerboard panda). app.json splash config points there.
  3. Keep: keyboard fixes (settings + grocery), modern chat-bubble fab in
     `capt-charmer.tsx`, all grocery features.
  4. Bump to 1.7.1 / versionCode 33 (32 was burned by an abandoned batch).
- **Now possible with local git — cleanup:** delete orphaned files the zip
  system couldn't remove: `src/components/panda-room.tsx`,
  `src/components/home-hero.tsx`, checkerboard assets in
  `assets/veeran/home/` (room_*.png/mp4, charmer_seated/facing/avatar,
  office_bg) — VERIFY nothing imports them first. `expo-speech` in
  package.json is unused after the revert; keep (future voice feature) or
  remove — ask the owner.

## Feature state (working, verified on device)

- Onboarding (6 steps: diet, household+spice, favorites/avoids, health with 8
  focus chips + sex/activity, pantry bundle) — health focus drives everything.
- Plan: daily meal plan, swap, Captain's suggestion (health-boosted), add-dish
  search, cooked/skipped tracking, day-review (`plan/review/[date].tsx`).
- Pantry: qty steppers, expiry tracking, waste log, "What can I cook?" chain
  screen (`app/cook.tsx`: pantry-readiness % + health-supportive dishes).
- Grocery: starts EMPTY (no auto-select — deliberate UX decision), Captain's
  health list (adds + selects only its picks), Instamart/Zepto guided
  item-by-item deep-link wizard (Blinkit removed — broken deeplinks),
  "Captain's approved meals (Zomato)" (curated healthy dishes only → Zomato
  search → order logged via `/api/meals/order-log`), local-shop price entry,
  bill-scan matcher (Claude vision).
- Captain chat: Claude-powered via backend `/api/captain/chat`, knows pantry/
  plan/health focus. Floating fab (modern green shell + chat badge).
- Calendar: week = nutrition review cards → day review → coach handoff.
- Backend endpoints of note: `/api/grocery/suggest-health`,
  `/api/dishes/from-pantry`, `/api/dishes/for-health`, `/api/meals/approved`,
  `/api/meals/order-log`.

## Verification standards

- Now that a real machine exists: `cd frontend && yarn install` once, then use
  **full checks**: `npx tsc --noEmit` and `npx expo export --platform android`
  before pushing UI batches. (The old sandbox could only esbuild-syntax-check;
  a TDZ runtime bug once slipped through — "Cannot access 'prices' before
  initialization" — full bundle + preview catches these.)
- Backend: `python -m py_compile backend/server.py` minimum; server must
  start clean (seeds: ingredients=98 recipes=73).
- Owner previews on Emergent preview URL and on-device before trusting a batch.

## Asset rules (learned the hard way)

- "Transparent" PNGs from AI generators are often SCREENSHOTS with the
  checkerboard baked in. Test: `PIL Image.open(x).mode` must be RGBA with a
  real alpha channel; if a gallery app shows checkerboard, it's fake.
- Art direction: realistic 3D panda (owner's explicit choice, not cartoon).
- Owner generates assets (Kling/image tools); you process (ffmpeg strip audio
  / crop watermarks / compress ~CRF 28) and wire them.

## Launch backlog (v1 gate — in priority order)

1. Apply the pending home/splash fix (above) + fresh APK verified on device.
2. **App icon**: currently Emergent's default "e". Owner must generate
   1024×1024 (panda on solid banana-leaf green); wire icon + adaptive icon.
3. **Privacy policy** (hosted URL) + Play Store listing + Data Safety form.
4. Play Console: closed testing — 12 testers / 14 days (Google requirement),
   then production. Developer account fee applies.
5. Post-v1: pill-bar tab redesign (Zomato-style, designed as "batch33" —
   rebuild on current main if owner wants it), Add-dish health-ranking,
   Google Fit steps integration, ElevenLabs Captain voice, auth migration
   (own Google OAuth + real SMS OTP, off Emergent auth), backend migration
   Emergent → Railway/Render + MongoDB Atlas free tier, nutrition KB Phase 2
   (ingredient × cooking-template dish generation), self-updating knowledge
   feature (research doc exists; central harvest + per-user personalization,
   ₹39-49 IAP).

## Working style with the owner

- He makes sharp product calls fast; surface trade-offs honestly, flag risks
  BEFORE building, and never hide limitations (e.g., "no delivery app exposes
  prices — spend is logged manually" was the honest framing that stuck).
- Every visual change: show a mockup/screenshot BEFORE he builds an APK
  (standing order). With local Expo you can do better: run the dev server.
- Small, reviewable commits with clear messages. One concern per commit.
- Monetization pressure exists ("earn quickly") — the agreed line: finish v1,
  get real users, then a ₹49-99/mo premium tier for the AI Captain. Do not
  bolt ads onto a zero-user app.
