// AmmiAI i18n — lightweight, zero-dependency language system.
// English ⇄ Tamil toggle, persisted on device. The string catalog lives in
// i18n-strings.ts; t() supports {param} interpolation.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { storage } from "@/src/utils/storage";
import { STRINGS, type StringKey } from "@/src/i18n-strings";

export type Lang = "en" | "ta";
export type { StringKey } from "@/src/i18n-strings";

const LANG_KEY = "ammiai.lang";

type Params = Record<string, string | number>;

function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  let out = s;
  for (const k of Object.keys(params)) {
    out = out.split(`{${k}}`).join(String(params[k]));
  }
  return out;
}

type TFn = (key: StringKey, params?: Params) => string;

type I18nValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
};

const Ctx = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<Lang>(LANG_KEY, "en");
      if (saved === "ta" || saved === "en") setLangState(saved);
    })();
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.setItem(LANG_KEY, l);
  }, []);

  const t = useCallback<TFn>(
    (key, params) => {
      const entry = STRINGS[key];
      if (!entry) return key;
      return interpolate(entry[lang] ?? entry.en, params);
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
      t: (key, params) => interpolate(STRINGS[key]?.en ?? key, params),
    };
  }
  return ctx;
}
