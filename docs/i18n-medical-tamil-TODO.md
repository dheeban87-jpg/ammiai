# AmmiAI — Medical/compliance strings needing YOUR Tamil

Dheeban: these strings make health/nutrition/medical claims or carry the
"not medical advice / consult your doctor" compliance framing. I deliberately
did **NOT** machine-translate them — accuracy and the exact compliance wording
matter for Play Store medical-claims rules (CLAUDE.md rule 5).

**Until you fill the Tamil, the app shows the English text in Tamil mode** (safe
placeholder — the `ta` value equals the `en` value in `i18n-strings.ts`). Reply
with Tamil for each key and I'll drop it in.

Rules to keep when you translate: never say cure / treat / prevent / diagnose a
disease. Keep "estimate", "supports", "consult your doctor".

---

## Home (`app/(tabs)/index.tsx`)

| Key | English | TA (you author) |
|---|---|---|
| home.est_disclaimer | Rough estimate — bodies vary. Not medical advice. | _(fill in)_ |

<!-- APPENDED AS EACH SCREEN IS LOCALIZED. Known upcoming medical strings:
grocery: "ICMR-NIN 2024 guidance — not medical advice; consult your doctor."
settings: the goal note ("Used for calorie estimates… not medical advice.")
onboarding: health disclaimer
plan: BMI/path framing (Group B)  -->
