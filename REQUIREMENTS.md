# AmmiAI — Requirements Backlog (owner-approved, Jul 7 2026)

Theme: health-first family kitchen. Backbone: **plan → ingredients → pantry
check → buy gap → bought moves to pantry → cook consumes pantry → nutrition
outcome → coach reviews → habits improve.**

## Shipped
- R0 Grocery crash: FIXED (reduce elimination + data sanitisation + crash gate)
- R1 Pantry quantity: +/− steppers and direct number entry with Set (batch 15)
- R2 Add-dish / My-own-dish keyboard covering inputs: fixed (batch 15)
- R3 Bought → pantry made visible: confirm now toasts "N items moved to
  pantry ✓" and opens Pantry (batch 15)

## Waiting on the single pending deploy
- D1 Captain chat brain ("Radio failure" until deploy)
- D2 My-own-dish save · D3 price/purchase logging · D4 monthly report+lessons
- D5 bill scan · D6 AI habit advice · D7 covered-items banner · D8 boiled egg
- D9 base-item delete

## Build queue (each ≈ one zip)
- **R4 Dish readiness** — pick a dish → ingredient ✓/✗ vs pantry, "add missing
  to grocery" one-tap; the dosa-batter question answered structurally
- **R5 Cooked = visible consumption** — "Used: 200g rice ↓ …" after marking
  cooked; low-stock warnings
- **R6 Nutrition-outcome calendar** — week cards show the day's OUTCOME
  (balanced ✓ / kcal / protein bars) as the primary view; dishes secondary.
  Failed days get a "Review with Coach" button → opens Captain chat pre-loaded
  with that day's data; coach asks what happened, gives strict advice
- **R7 Panda welcome & presence** — first-launch full-screen intro explaining
  the mission (needs transparent-background panda art — generate via the
  Kling/image pipeline); afterwards greets by time of day and surfaces one
  live insight per screen
- **R8 Coach weekly plan from pantry** — after adding ingredients, coach
  proposes next week's plan built from stock + health targets
- **R9 Fruit tracking** — fruits in catalog, quick "fruit eaten" log on Home,
  counts toward fiber/vitamin targets; coach nags at zero-fruit days
- **R10 Family health profiles** — members, ages, conditions
  (diabetes/BP/iron/weight) → per-member targets feeding all suggestions
  (guidance framing only, never medical claims)
- **R11 Notifications** — morning coach brief, expiry alerts, evening
  cooked check-in
- **R12 Premium gate** — AI features behind ₹99/mo · ₹599/yr

Order of play: deploy once → R4 → R5 → R6 → R7 → R10 → R11 → R8/R9 → R12.
