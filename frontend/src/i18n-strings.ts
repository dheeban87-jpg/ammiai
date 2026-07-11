// AmmiAI translation catalog. One entry per user-facing string: { en, ta }.
// Tamil marked "TA-DRAFT" in the review doc is machine-drafted and pending
// owner review (see docs/i18n-tamil-review.md). Medical/compliance strings
// keep English in `ta` as a safe placeholder until the owner authors Tamil
// (see docs/i18n-medical-tamil-TODO.md) — never machine-translate medical copy.
export type Entry = { en: string; ta: string };

export const STRINGS = {
  // ---- Tab bar ----
  "tab.home": { en: "Home", ta: "முகப்பு" },
  "tab.pantry": { en: "Pantry", ta: "சாமான்" },
  "tab.plan": { en: "Plan", ta: "திட்டம்" },
  "tab.calendar": { en: "Calendar", ta: "நாட்காட்டி" },
  "tab.grocery": { en: "Grocery", ta: "மளிகை" },

  // ---- Screen headers (title + subtitle pairs; subtitle is the other language) ----
  "pantry.title": { en: "Pantry", ta: "சாமான் அறை" },
  "pantry.subtitle": { en: "சாமான் அறை", ta: "Pantry" },
  "plan.title": { en: "Plan", ta: "உணவு திட்டம்" },
  "plan.subtitle": { en: "இன்றைய உணவு திட்டம்", ta: "Today's meal plan" },
  "calendar.title": { en: "Calendar", ta: "நாட்காட்டி" },
  "calendar.subtitle": { en: "வாராந்திர அட்டவணை", ta: "Weekly schedule" },
  "grocery.title": { en: "Grocery", ta: "மளிகை பட்டியல்" },
  "grocery.subtitle": { en: "சந்தை பட்டியல்", ta: "Market list" },

  // ---- Meals ----
  "meal.breakfast": { en: "Breakfast", ta: "காலை உணவு" },
  "meal.lunch": { en: "Lunch", ta: "மதிய உணவு" },
  "meal.dinner": { en: "Dinner", ta: "இரவு உணவு" },

  // ---- Plan screen ----
  "plan.today": { en: "Today", ta: "இன்று" },
  "plan.week": { en: "This week", ta: "இந்த வாரம்" },
  "plan.regenerate": { en: "Regenerate", ta: "மீண்டும் உருவாக்கு" },

  // ---- Meal card / dish actions ----
  "dish.add": { en: "Plan this meal — tap to add a dish", ta: "இந்த உணவைத் திட்டமிடு — உணவு சேர்க்க தட்டவும்" },
  "dish.swap": { en: "Swap", ta: "மாற்று" },
  "dish.cooked": { en: "Cooked", ta: "சமைத்தது" },
  "dish.base": { en: "Base", ta: "அடிப்படை" },

  // ---- Add-dish sheet ----
  "addsheet.title": { en: "Add a dish", ta: "உணவு சேர்க்கவும்" },
  "addsheet.sub": { en: "Search all Amma-style dishes and add whatever you like", ta: "அம்மா ஸ்டைல் உணவுகளைத் தேடி விருப்பமானதைச் சேர்க்கவும்" },
  "addsheet.search": { en: "Search dish name…", ta: "உணவு பெயரைத் தேடு…" },
  "addsheet.close": { en: "Close", ta: "மூடு" },
  "addsheet.nomatch": { en: "No dishes match", ta: "பொருந்தும் உணவு இல்லை" },
  "addsheet.loadfail": { en: "Couldn't load the dish list. Check your connection and reopen.", ta: "உணவு பட்டியலை ஏற்ற முடியவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் திறக்கவும்." },

  // ---- Nutrition chips ----
  "nut.balanced": { en: "Balanced", ta: "சமநிலை" },
  "nut.low_protein": { en: "Low protein", ta: "புரதம் குறைவு" },
  "nut.heavy": { en: "Heavy", ta: "அதிக கலோரி" },

  // ---- Settings (existing) ----
  "settings.title": { en: "Settings", ta: "அமைப்புகள்" },
  "settings.language": { en: "Language", ta: "மொழி" },
  "settings.language.hint": { en: "Choose the app's main language", ta: "செயலியின் முதன்மை மொழியைத் தேர்வு செய்க" },
  "settings.language.en": { en: "English", ta: "English" },
  "settings.language.ta": { en: "தமிழ்", ta: "தமிழ்" },

  // ================= HOME (index.tsx) — TA-DRAFT (owner review) =================
  "home.greet_morning": { en: "Good morning", ta: "காலை வணக்கம்" },
  "home.greet_afternoon": { en: "Good afternoon", ta: "மதிய வணக்கம்" },
  "home.greet_evening": { en: "Good evening", ta: "மாலை வணக்கம்" },
  "home.streak": { en: "{n}-day streak", ta: "{n} நாள் தொடர்ச்சி" },
  "home.today_progress": { en: "Today's progress", ta: "இன்றைய முன்னேற்றம்" },
  "home.see_plan": { en: "See plan →", ta: "திட்டத்தைப் பார் →" },
  "home.ring_calories": { en: "Calories", ta: "கலோரி" },
  "home.ring_protein": { en: "Protein", ta: "புரதம்" },
  "home.ring_fiber": { en: "Fiber", ta: "நார்ச்சத்து" },
  "home.burnt_today": { en: "burnt today", ta: "இன்று எரிந்தது" },
  "home.net_kcal": { en: "net kcal (est)", ta: "நிகர கலோரி (தோராயம்)" },
  "home.to_goal": { en: "to goal", ta: "இலக்குக்கு" },
  "home.set_goal": { en: "Set goal", ta: "இலக்கை அமை" },
  "home.weight_target": { en: "weight target", ta: "எடை இலக்கு" },
  "home.habits_title": { en: "Today's habits", ta: "இன்றைய பழக்கங்கள்" },
  "home.habits_hint": { en: "tap to check in", ta: "பதிவு செய்ய தட்டவும்" },
  "home.weight_hint": { en: "Set your weight in Settings for accurate kcal estimates →", ta: "துல்லியமான கலோரி மதிப்பீட்டிற்கு அமைப்புகளில் உங்கள் எடையை அமைக்கவும் →" },
  "home.path_title": { en: "Your path", ta: "உங்கள் பாதை" },
  "home.path_cta": { en: "Set a target weight →", ta: "இலக்கு எடையை அமை →" },
  "home.expiring": { en: "{n} expiring soon", ta: "{n} விரைவில் காலாவதியாகும்" },
  "home.expiring_sub": { en: "Use them before they spoil", ta: "கெட்டுப்போகும் முன் பயன்படுத்துங்கள்" },
  "home.fresh": { en: "Pantry looks fresh", ta: "சாமான் அறை புத்தம்புதிதாக உள்ளது" },
  "home.fresh_sub": { en: "Nothing expiring today", ta: "இன்று எதுவும் காலாவதியாகவில்லை" },
  "home.cook_title": { en: "What can I cook?", ta: "நான் என்ன சமைக்கலாம்?" },
  "home.cook_sub": { en: "Dishes ready from your pantry", ta: "உங்கள் சாமானில் இருந்து தயாராகும் உணவுகள்" },
  "home.duration_q": { en: "How long?", ta: "எவ்வளவு நேரம்?" },
  "home.err_load": { en: "Failed to load", ta: "ஏற்ற முடியவில்லை" },
  // Captain voice (register-sensitive — owner review for "soldier" tone)
  "home.toast_logged": { en: "Logged, soldier 🫡", ta: "பதிவாச்சு, வீரா 🫡" },
  "home.toast_kcal": { en: "+~{k} kcal — logged, soldier 🫡", ta: "+~{k} கலோரி — பதிவாச்சு, வீரா 🫡" },
  "home.milestone": { en: "{n} days of {habit}. That's who you are now, soldier. 🫡", ta: "{n} நாட்கள் {habit}. இதுதான் இப்போ நீங்க, வீரா. 🫡" },
  "home.couldnt_log": { en: "Couldn't log that — try again", ta: "பதிவு செய்ய முடியலை — மீண்டும் முயலுங்கள்" },
  "home.premium_badge": { en: "Premium", ta: "பிரீமியம்" },
  // MEDICAL — owner authors Tamil (English placeholder keeps app safe until then)
  "home.est_disclaimer": { en: "Rough estimate — bodies vary. Not medical advice.", ta: "Rough estimate — bodies vary. Not medical advice." },
} as const satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;
