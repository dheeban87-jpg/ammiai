# S4 — Health Connect compliance checklist

Health/fitness data is sensitive. Per the standing rule, the compliance items
below ship **in the same release** as the feature. Built items are done; owner
items are BLOCKING before this reaches production (closed testing can proceed).

## What the app does (data minimization)
- Reads **read-only**, minimum scope: `Steps`, `ActiveCaloriesBurned`,
  `ExerciseSession`.
- Stores **only daily aggregates** (steps + active kcal per day) in the user's
  own account DB — never raw samples. Endpoint: `POST /api/activity/health-sync`.
- Fails soft: no Health Connect / denied permission → the app is fully usable
  with manual habit logging (never blocked).

## Built (this release)
- [x] In-app **DPDP consent gate** before any Health Connect read is requested
      (`hc.consent_body`: what is read, why, where stored, delete-anytime,
      supports wellness — does not diagnose/treat).
- [x] Read-only permissions declared in `app.json`
      (`android.permission.health.READ_STEPS` / `READ_ACTIVE_CALORIES_BURNED` /
      `READ_EXERCISE`) + the `react-native-health-connect` config plugin
      (prebuild verified).
- [x] Health-claims grep clean (no diagnose/cure/treat/reverse/prevent-disease
      in any new copy; the only such words appear in the required negative
      disclaimer).
- [ ] **Settings → "My health data" delete-all** — the consent copy promises
      "view or delete anytime in Settings". A delete control that clears
      `db.health_activity` + revokes the local consent flag must be wired before
      production. (Backend already deletes `health_activity` on account delete.)

## Owner action items (BLOCKING before production; not code)
- [ ] **Play Console → Health Connect declaration form** — Google requires apps
      using Health Connect to declare data types + handling and link a privacy
      policy, or the app is rejected.
- [ ] **Privacy policy** updated: what we read from Health Connect (steps,
      active calories, exercise sessions), why (personalized food + habit
      suggestions), what we store (daily totals only), retention, and deletion.
- [ ] **Play Console Data Safety form** updated for health/fitness data
      (collected, not shared, encrypted in transit, deletable).

## Testing (needs a real Android 14 device — cannot verify in Expo Go or here)
- [ ] Fresh install → tap the card → DPDP consent → Health Connect permission
      sheet → steps + active kcal visible on Home within one session.
- [ ] Deny-permission path → app fully usable via manual habit logging.
- [ ] Active kcal from Health Connect visibly increases "burnt today" on Home.
