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
| home.updating | updating… | புதுப்பிக்கிறது… | |
| home.stale | Showing yesterday's data — reconnecting… | நேற்றைய தரவைக் காட்டுகிறது — மீண்டும் இணைக்கிறது… | R1 offline banner |

## R3 fridge-photo scan (Pantry + onboarding component)

| key | en | ta (machine draft) | notes |
|---|---|---|---|
| scan.button | Scan my veggies | காய்கறிகளை ஸ்கேன் செய் | |
| scan.camera | Take a photo | புகைப்படம் எடு | |
| scan.gallery | Choose from gallery | கேலரியிலிருந்து தேர்ந்தெடு | |
| scan.scanning 🎖️ | Inspecting your supplies, soldier… | உங்கள் பொருட்களை ஆய்வு செய்கிறேன், வீரா… | "soldier"→"வீரா" — confirm tone |
| scan.confirm_title | Confirm your items | உங்கள் பொருட்களை உறுதிசெய் | |
| scan.confirm_sub | Tap to include, edit the amount, then add. | சேர்க்க தட்டவும், அளவை மாற்றவும், பின் சேர்க்கவும். | |
| scan.none | No clear items found — try better light and a closer shot. | தெளிவான பொருட்கள் இல்லை — நல்ல வெளிச்சத்தில் அருகில் எடுக்கவும். | |
| scan.add_n | Add {n} to pantry | {n} பொருட்களைச் சேர் | |
| scan.added | Added to your pantry ✓ | உங்கள் சாமான் அறையில் சேர்க்கப்பட்டது ✓ | |
| scan.perm_camera | Camera permission is needed to scan. | ஸ்கேன் செய்ய கேமரா அனுமதி தேவை. | |
| scan.perm_gallery | Photo permission is needed to pick an image. | படம் தேர்ந்தெடுக்க அனுமதி தேவை. | |
| scan.error | Couldn't read that photo — try a clearer shot. | அந்த புகைப்படத்தைப் படிக்க முடியலை — தெளிவாக எடுக்கவும். | colloquial "முடியலை" — ok? |
| scan.add_missed | Add a missed item | விடுபட்ட பொருளைச் சேர் | |
| scan.search_ph | Search vegetables, greens… | காய்கறிகள், கீரைகளைத் தேடு… | |

## R2 staples section (Pantry)

| key | en | ta (machine draft) | notes |
|---|---|---|---|
| staples.title | Staples ✓ assumed stocked | அடிப்படை பொருட்கள் ✓ இருப்பதாகக் கருதுகிறோம் | |
| staples.sub_ok | Rice · dals · oil · spices — tap only if something ran out | அரிசி · பருப்பு · எண்ணெய் · மசாலா — தீர்ந்தால் மட்டும் தட்டவும் | |
| staples.sub_out | {n} marked run out — added to grocery | {n} தீர்ந்தது எனக் குறித்தீர்கள் — மளிகையில் சேர்க்கப்பட்டது | |
| staples.stocked | Stocked | உள்ளது | |
| staples.ranout | Ran out | தீர்ந்தது | |

## Onboarding fresh-items + scan step

| key | en | ta (machine draft) | notes |
|---|---|---|---|
| onb.fresh_title | Add your fresh items | உங்கள் புதிய பொருட்கள் | |
| onb.scan_title | Point your camera at your vegetables | உங்கள் காய்கறிகளை நோக்கி கேமராவைக் காட்டுங்கள் | |
| onb.scan_sub | One photo and I'll stock your fresh items — no typing. | ஒரு புகைப்படம் போதும், நான் உங்கள் புதிய பொருட்களைச் சேர்க்கிறேன் — தட்டச்சு தேவையில்லை. | |
| onb.scan_skip | Skip — I'll add them myself | தவிர் — நானே சேர்த்துக்கொள்கிறேன் | |
| onb.dinners_title | Dinners you can cook tonight | இன்றிரவு சமைக்கக்கூடிய உணவுகள் | |
| onb.dinners_sub 🎖️ | Straight from what you have. Welcome aboard, soldier. | உங்களிடம் உள்ளதிலிருந்தே. வரவேற்கிறேன், வீரா. | "soldier"→"வீரா" |

<!-- SCREENS BELOW APPENDED AS EACH IS LOCALIZED: Grocery, Settings, Calendar, Plan, Pantry, components -->
