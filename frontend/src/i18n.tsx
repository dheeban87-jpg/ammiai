// AmmiAI i18n — Batch 8b. Lightweight, zero-dependency language system.
// English ⇄ Tamil toggle, persisted on device. Screens migrate to t()
// incrementally; untranslated strings simply stay English.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { storage } from "@/src/utils/storage";

export type Lang = "en" | "ta";

const LANG_KEY = "ammiai.lang";

type Entry = { en: string; ta: string };

const STRINGS = {
  // Tab bar
  "tab.home": { en: "Home", ta: "முகப்பு" },
  "tab.pantry": { en: "Pantry", ta: "சாமான்" },
  "tab.plan": { en: "Plan", ta: "திட்டம்" },
  "tab.calendar": { en: "Calendar", ta: "நாட்காட்டி" },
  "tab.grocery": { en: "Grocery", ta: "மளிகை" },

  // Screen headers (title + subtitle pairs; subtitle is the other language)
  "pantry.title": { en: "Pantry", ta: "சாமான் அறை" },
  "pantry.subtitle": { en: "சாமான் அறை", ta: "Pantry" },
  "plan.title": { en: "Plan", ta: "உணவு திட்டம்" },
  "plan.subtitle": { en: "இன்றைய உணவு திட்டம்", ta: "Today's meal plan" },
  "calendar.title": { en: "Calendar", ta: "நாட்காட்டி" },
  "calendar.subtitle": { en: "வாராந்திர அட்டவணை", ta: "Weekly schedule" },
  "grocery.title": { en: "Grocery", ta: "மளிகை பட்டியல்" },
  "grocery.subtitle": { en: "சந்தை பட்டியல்", ta: "Market list" },

  // Meals
  "meal.breakfast": { en: "Breakfast", ta: "காலை உணவு" },
  "meal.lunch": { en: "Lunch", ta: "மதிய உணவு" },
  "meal.dinner": { en: "Dinner", ta: "இரவு உணவு" },

  // Plan screen
  "plan.today": { en: "Today", ta: "இன்று" },
  "plan.week": { en: "This week", ta: "இந்த வாரம்" },
  "plan.regenerate": { en: "Regenerate", ta: "மீண்டும் உருவாக்கு" },

  // Meal card / dish actions
  "dish.add": { en: "Plan this meal — tap to add a dish", ta: "இந்த உணவைத் திட்டமிடு — உணவு சேர்க்க தட்டவும்" },
  "dish.swap": { en: "Swap", ta: "மாற்று" },
  "dish.cooked": { en: "Cooked", ta: "சமைத்தது" },
  "dish.base": { en: "Base", ta: "அடிப்படை" },

  // Add-dish sheet
  "addsheet.title": { en: "Add a dish", ta: "உணவு சேர்க்கவும்" },
  "addsheet.sub": { en: "Search all Amma-style dishes and add whatever you like", ta: "அம்மா ஸ்டைல் உணவுகளைத் தேடி விருப்பமானதைச் சேர்க்கவும்" },
  "addsheet.search": { en: "Search dish name…", ta: "உணவு பெயரைத் தேடு…" },
  "addsheet.close": { en: "Close", ta: "மூடு" },
  "addsheet.nomatch": { en: "No dishes match", ta: "பொருந்தும் உணவு இல்லை" },
  "addsheet.loadfail": { en: "Couldn't load the dish list. Check your connection and reopen.", ta: "உணவு பட்டியலை ஏற்ற முடியவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் திறக்கவும்." },

  // Nutrition chips
  "nut.balanced": { en: "Balanced", ta: "சமநிலை" },
  "nut.low_protein": { en: "Low protein", ta: "புரதம் குறைவு" },
  "nut.heavy": { en: "Heavy", ta: "அதிக கலோரி" },

  // Settings
  "settings.title": { en: "Settings", ta: "அமைப்புகள்" },
  "settings.language": { en: "Language", ta: "மொழி" },
  "settings.language.hint": { en: "Choose the app's main language", ta: "செயலியின் முதன்மை மொழியைத் தேர்வு செய்க" },
  "settings.language.en": { en: "English", ta: "English" },
  "settings.language.ta": { en: "தமிழ்", ta: "தமிழ்" },
} as const satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;

type I18nValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey) => string;
};

const Ctx = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem(LANG_KEY, "en");
      if (saved === "ta" || saved === "en") setLangState(saved);
    })();
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.setItem(LANG_KEY, l);
  }, []);

  const t = useCallback(
    (key: StringKey) => {
      const entry = STRINGS[key];
      if (!entry) return key;
      return entry[lang] ?? entry.en;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(Ctx);
  // Safe fallback so components render even outside the provider (tests).
  if (!ctx) {
    return {
      lang: "en",
      setLang: () => {},
      t: (key: StringKey) => STRINGS[key]?.en ?? key,
    };
  }
  return ctx;
}
