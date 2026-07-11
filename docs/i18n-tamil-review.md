# AmmiAI — Tamil translation review (machine-drafted)

Dheeban: these are **machine-drafted** Tamil strings. Please skim for tone and
register — machine Tamil can be stilted or too formal even on simple UI text,
and the app's voice (Capt. Charmer's gruff "soldier" tone) matters.

**How to use:** edit the `TA (draft)` column directly, or reply with fixes and
I'll apply them. Keys map 1:1 to `frontend/src/i18n-strings.ts`.

Legend: 🎖️ = Captain-voice line (register-sensitive). Medical/compliance
strings are NOT here — they're in `i18n-medical-tamil-TODO.md` for you to author.

---

## Home (`app/(tabs)/index.tsx`)

| Key | English | TA (draft) | Notes |
|---|---|---|---|
| home.greet_morning | Good morning | காலை வணக்கம் | |
| home.greet_afternoon | Good afternoon | மதிய வணக்கம் | |
| home.greet_evening | Good evening | மாலை வணக்கம் | |
| home.streak | {n}-day streak | {n} நாள் தொடர்ச்சி | |
| home.today_progress | Today's progress | இன்றைய முன்னேற்றம் | |
| home.see_plan | See plan → | திட்டத்தைப் பார் → | |
| home.ring_calories | Calories | கலோரி | |
| home.ring_protein | Protein | புரதம் | |
| home.ring_fiber | Fiber | நார்ச்சத்து | |
| home.burnt_today | burnt today | இன்று எரிந்தது | |
| home.net_kcal | net kcal (est) | நிகர கலோரி (தோராயம்) | |
| home.to_goal | to goal | இலக்குக்கு | |
| home.set_goal | Set goal | இலக்கை அமை | |
| home.weight_target | weight target | எடை இலக்கு | |
| home.habits_title | Today's habits | இன்றைய பழக்கங்கள் | |
| home.habits_hint | tap to check in | பதிவு செய்ய தட்டவும் | |
| home.weight_hint | Set your weight in Settings for accurate kcal estimates → | துல்லியமான கலோரி மதிப்பீட்டிற்கு அமைப்புகளில் உங்கள் எடையை அமைக்கவும் → | long — check phrasing |
| home.path_title | Your path | உங்கள் பாதை | |
| home.path_cta | Set a target weight → | இலக்கு எடையை அமை → | |
| home.expiring | {n} expiring soon | {n} விரைவில் காலாவதியாகும் | |
| home.expiring_sub | Use them before they spoil | கெட்டுப்போகும் முன் பயன்படுத்துங்கள் | |
| home.fresh | Pantry looks fresh | சாமான் அறை புத்தம்புதிதாக உள்ளது | |
| home.fresh_sub | Nothing expiring today | இன்று எதுவும் காலாவதியாகவில்லை | |
| home.cook_title | What can I cook? | நான் என்ன சமைக்கலாம்? | |
| home.cook_sub | Dishes ready from your pantry | உங்கள் சாமானில் இருந்து தயாராகும் உணவுகள் | |
| home.duration_q | How long? | எவ்வளவு நேரம்? | |
| home.err_load | Failed to load | ஏற்ற முடியவில்லை | |
| home.toast_logged 🎖️ | Logged, soldier 🫡 | பதிவாச்சு, வீரா 🫡 | "soldier"→"வீரா" — confirm tone |
| home.toast_kcal 🎖️ | +~{k} kcal — logged, soldier 🫡 | +~{k} கலோரி — பதிவாச்சு, வீரா 🫡 | |
| home.milestone 🎖️ | {n} days of {habit}. That's who you are now, soldier. 🫡 | {n} நாட்கள் {habit}. இதுதான் இப்போ நீங்க, வீரா. 🫡 | {habit} stays English (backend) |
| home.couldnt_log | Couldn't log that — try again | பதிவு செய்ய முடியலை — மீண்டும் முயலுங்கள் | |
| home.premium_badge | Premium | பிரீமியம் | transliteration — ok? |

<!-- SCREENS BELOW APPENDED AS EACH IS LOCALIZED: Grocery, Settings, Calendar, Plan, Pantry, components -->
