import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { readCache, writeCache } from "@/src/hooks/use-cached-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/app-header";
import { NutritionRing } from "@/src/components/nutrition-ring";
import { CHIP_META, MEAL_META, MealCard, type Meal, type MealItem, type MealOutcome } from "@/src/components/meal-card";
import { SwapSheet, type Violation } from "@/src/components/swap-sheet";
import { AddDishSheet } from "@/src/components/add-dish-sheet";
import { CustomDishSheet } from "@/src/components/custom-dish-sheet";
import { loadDishCatalog, filterDishes, type CatalogRecipe } from "@/src/dish-catalog";
import { SuggestSheet, pickSuggestion, type Suggestion, type PantryInfo } from "@/src/components/suggest-sheet";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

type Plan = {
  date: string;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
  day_totals: { kcal: number; protein_g: number; fiber_g: number };
  day_targets: { kcal: number; protein_g: number; fiber_g: number };
  rings: { kcal: number; protein_g: number; fiber_g: number };
  protein_guard_actions?: string[];
  violations?: Violation[];
  ai_reason?: string;
  ai_source?: "ai" | "fallback";
};

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<"today" | "week">("today");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [week, setWeek] = useState<Plan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [swapCtx, setSwapCtx] = useState<
    { meal: Meal["key"]; item: MealItem; date: string } | null
  >(null);
  const [swapOptions, setSwapOptions] = useState<MealItem[] | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);

  const [addCtx, setAddCtx] = useState<{ meal: Meal["key"]; date: string } | null>(null);
  const [addOptions, setAddOptions] = useState<MealItem[] | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [suggestCtx, setSuggestCtx] = useState<{ meal: Meal["key"]; date: string } | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggestSkip, setSuggestSkip] = useState<string[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [pantryInfo, setPantryInfo] = useState<PantryInfo | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const onCustomCreated = async (dish: any) => {
    setCustomOpen(false);
    setCatalog(null); // force re-fetch so the new dish is searchable
    if (addCtx) {
      try {
        const updated = await api.post<Plan>("/api/plan/add-dish", {
          date: addCtx.date,
          meal: addCtx.meal,
          recipe_id: dish.id,
        });
        if (mode === "today") setPlan(updated);
        else loadWeek();
        setAddCtx(null);
      } catch {
        /* dish saved; user can add it from the list */
      }
    }
  };

  const loadPantryInfo = async (): Promise<PantryInfo | null> => {
    if (pantryInfo) return pantryInfo;
    try {
      const rows = await api.get<{ ingredient_id: string; days_left: number | null }[]>("/api/pantry");
      const info: PantryInfo = {
        ids: new Set(rows.map((r) => r.ingredient_id)),
        expiring: new Set(
          rows.filter((r) => r.days_left != null && r.days_left <= 2).map((r) => r.ingredient_id),
        ),
      };
      setPantryInfo(info);
      return info;
    } catch {
      return null;
    }
  };
  const [addQuery, setAddQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogRecipe[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMeta, setAiMeta] = useState<{
    source?: "ai" | "fallback";
    week_start?: string;
    generated_at?: string;
  } | null>(null);
  const [aiToast, setAiToast] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    try {
      const p = await api.get<Plan>("/api/plan/today");
      setPlan(p);
      writeCache("home.plan", p); // shared cache key with Home's today plan
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load plan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadWeek = useCallback(async () => {
    try {
      const w = await api.get<{ days: Plan[] }>("/api/plan/week");
      setWeek(w.days);
      // Pull the AI-week cache (if any) — cheap read
      try {
        const cache = await api.get<{
          cached: boolean;
          week_start?: string;
          generated_at?: string;
          meta?: { source?: "ai" | "fallback" };
        }>("/api/ai/plan/week");
        if (cache.cached) {
          setAiMeta({
            source: cache.meta?.source,
            week_start: cache.week_start,
            generated_at: cache.generated_at,
          });
        } else {
          setAiMeta(null);
        }
      } catch {
        /* noop */
      }
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load week plan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const personalizeWithAi = async () => {
    setAiBusy(true);
    setError(null);
    try {
      const resp = await api.post<{
        week_start: string;
        days: Plan[];
        meta: { source?: "ai" | "fallback" };
      }>("/api/ai/plan/week", {});
      setWeek(resp.days);
      setAiMeta({
        source: resp.meta?.source,
        week_start: resp.week_start,
        generated_at: new Date().toISOString(),
      });
      setAiToast(
        resp.meta?.source === "ai"
          ? "Week personalised with AI ✨"
          : "AI unreachable — used the rule-based plan.",
      );
      setTimeout(() => setAiToast(null), 3500);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't personalise week");
    } finally {
      setAiBusy(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // R1: seed today's plan from cache for an instant paint (no 30-60s
      // cold-Render spinner), then refresh in the background.
      if (mode === "today") {
        readCache<Plan>("home.plan").then((c) => {
          if (c) {
            setPlan(c);
            setLoading(false);
          }
        });
        loadToday();
      } else {
        setLoading(true);
        loadWeek();
      }
    }, [mode, loadToday, loadWeek]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    if (mode === "today") loadToday();
    else loadWeek();
  };

  // R4 forgiving log — record how the meal actually went. "cooked" also runs
  // the normal cook flow (pantry decrement); the rest just mark the outcome.
  const logOutcome = async (meal: "breakfast" | "lunch" | "dinner", outcome: MealOutcome) => {
    if (!plan) return;
    try {
      await api.post(`/api/plan/${plan.date}/log`, { meal, outcome });
      await loadToday();
    } catch {
      /* non-blocking: logging should never interrupt the user */
    }
  };

  const [regenMeal, setRegenMeal] = useState<"breakfast" | "lunch" | "dinner" | null>(null);

  // Rebuild ONE meal from the pantry, leaving the other two untouched.
  const regenerateMeal = async (meal: "breakfast" | "lunch" | "dinner") => {
    if (!plan) return;
    setRegenMeal(meal);
    try {
      await api.post(`/api/plan/${plan.date}/regenerate-meal?meal=${meal}`, {});
      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't rebuild that meal");
      setTimeout(() => setError(null), 2500);
    } finally {
      setRegenMeal(null);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const p = await api.post<Plan>("/api/plan/generate", {
        force: true,
        seed: Date.now() % 1_000_000,
      });
      setPlan(p);
    } catch (e: any) {
      if (e?.status === 402) {
        setError(e?.message ?? "Free plan quota reached");
        router.push("/paywall");
      } else {
        setError(e?.message ?? "Couldn't regenerate");
      }
    } finally {
      setRegenerating(false);
    }
  };

  const openSwap = async (meal: Meal["key"], item: MealItem) => {
    if (!plan || item.static) return;
    setSwapCtx({ meal, item, date: plan.date });
    setSwapOptions(null);
    try {
      const r = await api.get<{ options: MealItem[] }>(
        `/api/plan/swap-options?date=${plan.date}&meal=${meal}&recipe_id=${item.id}`,
      );
      setSwapOptions(r.options);
    } catch {
      setSwapOptions([]);
    }
  };

  const doSwap = async (opt: MealItem) => {
    if (!swapCtx) return;
    setSwapBusy(true);
    try {
      const updated = await api.post<Plan>("/api/plan/swap", {
        date: swapCtx.date,
        meal: swapCtx.meal,
        current_recipe_id: swapCtx.item.id,
        new_recipe_id: opt.id,
      });
      setPlan(updated);
      setSwapCtx(null);
    } finally {
      setSwapBusy(false);
    }
  };

  const openAddDish = async (meal: Meal["key"], date: string) => {
    setAddCtx({ meal, date });
    setAddOptions(null);
    setAddQuery("");
    try {
      const all = await loadDishCatalog();
      setCatalog(all);
      setAddOptions(filterDishes(all, { diet: profile?.diet }));
    } catch {
      setAddOptions([]);
    }
  };

  const searchAddDish = (q: string) => {
    setAddQuery(q);
    if (!catalog) return;
    setAddOptions(filterDishes(catalog, { q, diet: profile?.diet }));
  };

  const pickAddDish = async (opt: MealItem) => {
    if (!addCtx) return;
    setAddBusy(true);
    try {
      const updated = await api.post<Plan>("/api/plan/add-dish", {
        date: addCtx.date,
        meal: addCtx.meal,
        recipe_id: opt.id,
      });
      if (mode === "today") setPlan(updated);
      else loadWeek();
      setAddCtx(null);
    } finally {
      setAddBusy(false);
    }
  };

  const openSuggest = async (mealKey: Meal["key"], date: string) => {
    if (!plan) return;
    setSuggestCtx({ meal: mealKey, date });
    setSuggestSkip([]);
    try {
      const all = catalog ?? (await loadDishCatalog());
      if (!catalog) setCatalog(all);
      const pInfo = await loadPantryInfo();
      const mealObj = (plan as any)[mealKey] as Meal;
      const exclude = mealObj.items.map((i) => i.id);
      setSuggestion(pickSuggestion(all, mealObj, profile?.diet, exclude, [], pInfo, profile?.health?.goals ?? []));
    } catch {
      setSuggestion(null);
    }
  };

  const suggestAnother = () => {
    if (!suggestCtx || !catalog || !plan) return;
    const mealObj = (plan as any)[suggestCtx.meal] as Meal;
    const exclude = mealObj.items.map((i) => i.id);
    const skip = suggestion ? [...suggestSkip, suggestion.recipe.id] : suggestSkip;
    setSuggestSkip(skip);
    setSuggestion(pickSuggestion(catalog, mealObj, profile?.diet, exclude, skip, pantryInfo, profile?.health?.goals ?? []));
  };

  const addSuggested = async () => {
    if (!suggestCtx || !suggestion) return;
    setSuggestBusy(true);
    try {
      const updated = await api.post<Plan>("/api/plan/add-dish", {
        date: suggestCtx.date,
        meal: suggestCtx.meal,
        recipe_id: suggestion.recipe.id,
      });
      if (mode === "today") setPlan(updated);
      else loadWeek();
      setSuggestCtx(null);
      setSuggestion(null);
    } finally {
      setSuggestBusy(false);
    }
  };

  const removeDish = async (mealKey: Meal["key"], item: MealItem, date: string) => {
    try {
      const updated = await api.post<Plan>("/api/plan/remove-dish", {
        date,
        meal: mealKey,
        recipe_id: item.id,
      });
      if (mode === "today") setPlan(updated);
      else loadWeek();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setStreakToast(
        item.static && (msg.includes("404") || msg.includes("fixed base"))
          ? "Removing rice/curd unlocks with the next backend update 🐼"
          : "Couldn't remove that dish — try again",
      );
      setTimeout(() => setStreakToast(null), 3200);
    }
  };

  const [streakToast, setStreakToast] = useState<string | null>(null);
  const onCooked = async (mealKey: Meal["key"], item: MealItem) => {
    if (!plan) return;
    try {
      const resp = await api.post<{
        streak: { current_streak: number; total_cooked: number };
      }>(`/api/plan/${plan.date}/cooked`, { meal: mealKey, recipe_id: item.id });
      // Refresh plan to reflect cooked flag & pantry deduction (also updates rings)
      const fresh = await api.get<Plan>("/api/plan/today");
      setPlan(fresh);
      setStreakToast(
        `${item.name_en} cooked! 🔥 ${resp.streak.current_streak}-day streak`,
      );
      setTimeout(() => setStreakToast(null), 3500);
    } catch {
      /* noop */
    }
  };

  return (
    <View style={styles.screen} testID="plan-screen">
      <AppHeader title={t("plan.title")} subtitleTa={t("plan.subtitle")} />


      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.bananaLeaf} />
        </View>
      ) : mode === "today" && plan ? (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.bananaLeaf} />
          }
          showsVerticalScrollIndicator={false}
        >
          <RemainingToday plan={plan} />

          {plan.ai_reason ? (
            <View style={styles.aiReasonCard} testID="today-ai-reason">
              <Ionicons name="sparkles" size={14} color={colors.turmeric} />
              <Text style={styles.aiReasonText} numberOfLines={3}>
                {plan.ai_reason}
              </Text>
            </View>
          ) : null}

          {plan.protein_guard_actions && plan.protein_guard_actions.length > 0 ? (
            <View style={styles.guardBanner} testID="protein-guard-banner">
              <Ionicons name="fitness" size={16} color={colors.turmeric} />
              <Text style={styles.guardText}>{plan.protein_guard_actions.join(" · ")}</Text>
            </View>
          ) : null}

          <MealCard
            meal={plan.breakfast}
            onSwap={(it) => openSwap("breakfast", it)}
            onCooked={(it) => onCooked("breakfast", it)}
            onRemove={(it) => removeDish("breakfast", it, plan.date)}
            onAddDish={() => openAddDish("breakfast", plan.date)}
            onRegenerate={() => regenerateMeal("breakfast")}
            regenerating={regenMeal === "breakfast"}
            onLogOutcome={(o) => logOutcome("breakfast", o)}
            testIDPrefix="meal-breakfast"
          />
          <MealCard
            meal={plan.lunch}
            onSwap={(it) => openSwap("lunch", it)}
            onCooked={(it) => onCooked("lunch", it)}
            onRemove={(it) => removeDish("lunch", it, plan.date)}
            onAddDish={() => openAddDish("lunch", plan.date)}
            onRegenerate={() => regenerateMeal("lunch")}
            regenerating={regenMeal === "lunch"}
            onLogOutcome={(o) => logOutcome("lunch", o)}
            testIDPrefix="meal-lunch"
          />
          <MealCard
            meal={plan.dinner}
            onSwap={(it) => openSwap("dinner", it)}
            onCooked={(it) => onCooked("dinner", it)}
            onRemove={(it) => removeDish("dinner", it, plan.date)}
            onAddDish={() => openAddDish("dinner", plan.date)}
            onRegenerate={() => regenerateMeal("dinner")}
            regenerating={regenMeal === "dinner"}
            onLogOutcome={(o) => logOutcome("dinner", o)}
            testIDPrefix="meal-dinner"
          />

          {error ? (
            <View style={styles.errorBanner} testID="plan-error">
              <Ionicons name="alert-circle" size={16} color={colors.chili} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : mode === "week" && week ? (
        <FlatList
          data={week}
          keyExtractor={(d) => d.date}
          contentContainerStyle={{ padding: spacing.m, paddingBottom: insets.bottom + 96 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.bananaLeaf} />
          }
          ListHeaderComponent={
            <View style={styles.aiHeader} testID="ai-week-header">
              <View style={styles.aiHeaderTitleRow}>
                <Ionicons name="sparkles" size={18} color={colors.turmeric} />
                <Text style={styles.aiHeaderTitle}>
                  {aiMeta?.source === "ai"
                    ? "AI-personalised week"
                    : "Personalise this week"}
                </Text>
              </View>
              <Text style={styles.aiHeaderSub}>
                {aiMeta?.source === "ai"
                  ? "Claude Sonnet picked and ordered your week from your pantry."
                  : "Let AmmiAI pick the best week from your pantry + favourites."}
              </Text>
              <TouchableOpacity
                testID="ai-personalise-btn"
                onPress={personalizeWithAi}
                style={[styles.aiHeaderBtn, aiBusy && { opacity: 0.6 }]}
                disabled={aiBusy}
                hitSlop={6}
              >
                {aiBusy ? (
                  <ActivityIndicator color={colors.riceWhite} />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color={colors.riceWhite} />
                    <Text style={styles.aiHeaderBtnText}>
                      {aiMeta?.source === "ai" ? "Re-run AI" : "Personalise with AI"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/plan/day/${item.date}`)}
              activeOpacity={0.9}
            >
              <WeekDayCard plan={item} />
            </TouchableOpacity>
          )}
        />
      ) : (
        <View style={styles.center}>
          <Text style={{ color: colors.textMuted }}>{error || "No plan available"}</Text>
        </View>
      )}

      {/* Global Regenerate removed — each meal card now regenerates itself. */}

      <SwapSheet
        visible={swapCtx != null}
        target={swapCtx?.item ?? null}
        options={swapOptions}
        onClose={() => setSwapCtx(null)}
        onPick={doSwap}
        busy={swapBusy}
        violations={plan?.violations ?? null}
      />

      <AddDishSheet
        visible={addCtx != null}
        mealLabel={addCtx ? MEAL_META[addCtx.meal].title : undefined}
        options={addOptions}
        onClose={() => setAddCtx(null)}
        onPick={pickAddDish}
        onSearch={searchAddDish}
        busy={addBusy}
        onCreateOwn={() => setCustomOpen(true)}
      />

      <CustomDishSheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        onCreated={onCustomCreated}
      />

      <SuggestSheet
        visible={suggestCtx != null}
        suggestion={suggestion}
        mealLabel={suggestCtx ? MEAL_META[suggestCtx.meal].title : ""}
        busy={suggestBusy}
        onAdd={addSuggested}
        onAnother={suggestAnother}
        onClose={() => { setSuggestCtx(null); setSuggestion(null); }}
      />

      {streakToast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 100 }]} testID="streak-toast">
          <Ionicons name="flame" size={18} color={colors.turmeric} />
          <Text style={styles.toastText}>{streakToast}</Text>
        </View>
      ) : null}

      {aiToast ? (
        <View
          style={[styles.toast, { bottom: insets.bottom + 100 }]}
          testID="ai-toast"
        >
          <Ionicons name="sparkles" size={18} color={colors.turmeric} />
          <Text style={styles.toastText}>{aiToast}</Text>
        </View>
      ) : null}
    </View>
  );
}

// "Remaining today" — the rings live on Home; Plan shows what's still left to
// eat vs targets plus one actionable gap hint (rule-based, biggest deficit).
function RemainingToday({ plan }: { plan: Plan }) {
  const t = plan.day_targets ?? { kcal: 0, protein_g: 0, fiber_g: 0 };
  const totals = plan.day_totals ?? { kcal: 0, protein_g: 0, fiber_g: 0 };
  const leftK = Math.max(0, Math.round(t.kcal - totals.kcal));
  const leftP = Math.max(0, Math.round(t.protein_g - totals.protein_g));
  const leftF = Math.max(0, Math.round(t.fiber_g - totals.fiber_g));

  // Biggest actionable gap (protein/fiber, by fraction of target left).
  const pFrac = t.protein_g ? leftP / t.protein_g : 0;
  const fFrac = t.fiber_g ? leftF / t.fiber_g : 0;
  let hint: string;
  if (leftP <= 0 && leftF <= 0 && leftK <= 0) {
    hint = "🎯 On target — a balanced day, soldier.";
  } else if (leftP > 0 && pFrac >= fFrac) {
    hint = `💡 Short ~${leftP}g protein — add curd, a boiled egg, or extra dal to dinner.`;
  } else if (leftF > 0) {
    hint = `💡 Short ~${leftF}g fiber — add a vegetable poriyal, greens, or a fruit.`;
  } else {
    hint = `💡 ~${leftK} kcal left — a light dish or fruit rounds off the day.`;
  }

  return (
    <View style={styles.ringsCard} testID="remaining-today">
      <Text style={styles.ringsTitle}>Remaining today</Text>
      <View style={styles.remainRow}>
        <RemainCell value={`${leftK}`} label="kcal left" color={colors.bananaLeaf} />
        <View style={styles.remainDivider} />
        <RemainCell value={`${leftP}g`} label="protein" color={colors.chili} />
        <View style={styles.remainDivider} />
        <RemainCell value={`${leftF}g`} label="fiber" color={colors.turmeric} />
      </View>
      <Text style={styles.remainHint}>{hint}</Text>
    </View>
  );
}

function RemainCell({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.remainCell}>
      <Text style={[styles.remainVal, { color }]}>{value}</Text>
      <Text style={styles.remainLbl}>{label}</Text>
    </View>
  );
}

function WeekDayCard({ plan }: { plan: Plan }) {
  const d = new Date(plan.date + "T00:00:00");
  const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const balancedCount = ["breakfast", "lunch", "dinner"].filter(
    (m) => (plan as any)[m].chip === "balanced",
  ).length;
  return (
    <View style={styles.weekCard} testID={`week-day-${plan.date}`}>
      <View style={styles.weekHeader}>
        <Text style={styles.weekDate}>{label}</Text>
        <View style={styles.weekBadge}>
          <Ionicons name="checkmark-circle" size={12} color={colors.bananaLeaf} />
          <Text style={styles.weekBadgeText}>{balancedCount}/3 balanced</Text>
        </View>
      </View>
      {plan.ai_reason ? (
        <View
          style={styles.weekAiReason}
          testID={`week-ai-reason-${plan.date}`}
        >
          <Ionicons name="sparkles" size={12} color={colors.turmeric} />
          <Text style={styles.weekAiReasonText} numberOfLines={2}>
            {plan.ai_reason}
          </Text>
        </View>
      ) : null}
      {(["breakfast", "lunch", "dinner"] as const).map((mk) => {
        const meal = (plan as any)[mk] as Meal;
        const names = meal.items.filter((i) => !i.static).map((i) => i.name_en).join(", ");
        const chip = CHIP_META[meal.chip];
        return (
          <View key={mk} style={styles.weekMealRow}>
            <View style={styles.weekMealHeader}>
              <Text style={styles.weekMealLabel}>{MEAL_META[mk].title}</Text>
              <View style={[styles.chipTagTiny, { backgroundColor: chip.bg }]}>
                <Text style={[styles.chipTagTinyText, { color: chip.color }]}>{chip.label}</Text>
              </View>
            </View>
            <Text style={styles.weekMealDishes} numberOfLines={2}>{names || "—"}</Text>
          </View>
        );
      })}
      <View style={styles.weekFooter}>
        <Text style={styles.weekFooterText}>
          {Math.round(plan.day_totals.kcal)} kcal · {Math.round(plan.day_totals.protein_g)}g protein · {Math.round(plan.day_totals.fiber_g)}g fiber
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
  segmentWrap: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.s,
    paddingBottom: spacing.s,
    backgroundColor: colors.riceWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSoft,
    padding: 4,
    borderRadius: radius.pill,
  },
  segBtn: { flex: 1, minHeight: 46, justifyContent: "center", borderRadius: radius.pill, alignItems: "center" },
  segBtnActive: { backgroundColor: colors.bananaLeaf },
  segText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  body: { padding: spacing.m },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  ringsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    ...shadow.card,
    marginBottom: spacing.m,
  },
  ringsTitle: {
    fontFamily: fonts.headingEn,
    fontSize: 14,
    letterSpacing: 0.4,
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: spacing.m,
  },
  ringsRow: { flexDirection: "row", justifyContent: "space-around" },
  remainRow: { flexDirection: "row", alignItems: "center" },
  remainCell: { flex: 1, alignItems: "center", gap: 2 },
  remainDivider: { width: 1, height: 32, backgroundColor: colors.border },
  remainVal: { fontFamily: fonts.headingBold, fontSize: 22 },
  remainLbl: { fontSize: 11.5, color: colors.textMuted },
  remainHint: {
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: spacing.m,
    lineHeight: 18,
  },
  guardBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FBEED0",
    padding: spacing.m,
    borderRadius: radius.m,
    marginBottom: spacing.m,
  },
  guardText: { color: colors.turmeric, flex: 1, fontSize: 12, fontWeight: "600" },
  aiHeader: {
    backgroundColor: `${colors.turmeric}12`,
    borderColor: `${colors.turmeric}55`,
    borderWidth: 1,
    borderRadius: radius.l,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  aiHeaderTextWrap: { flex: 1 },
  aiHeaderTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiHeaderTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  aiHeaderSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  aiHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    backgroundColor: colors.bananaLeaf,
    marginTop: spacing.m,
    borderRadius: radius.pill,
  },
  aiHeaderBtnText: { color: colors.riceWhite, fontWeight: "800", fontSize: 15 },
  aiReasonCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: `${colors.turmeric}0F`,
    borderLeftWidth: 3,
    borderLeftColor: colors.turmeric,
    borderRadius: radius.m,
    paddingVertical: 10,
    paddingHorizontal: spacing.m,
    marginBottom: spacing.m,
    alignItems: "flex-start",
  },
  aiReasonText: {
    flex: 1,
    fontSize: 13,
    fontStyle: "italic",
    color: colors.textPrimary,
    lineHeight: 18,
  },
  weekAiReason: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    marginBottom: spacing.s,
    paddingLeft: 2,
  },
  weekAiReasonText: {
    flex: 1,
    fontSize: 12,
    fontStyle: "italic",
    color: colors.textSecondary,
    lineHeight: 16,
  },
  fab: { position: "absolute", right: spacing.m, zIndex: 5 },
  fabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bananaLeaf,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    ...shadow.card,
  },
  fabText: { color: colors.textOnPrimary, fontWeight: "700", fontSize: 14 },
  errorBanner: {
    marginTop: spacing.m,
    backgroundColor: "#FBECE4",
    borderRadius: radius.m,
    padding: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: { color: colors.chili, flex: 1, fontSize: 13 },
  toast: {
    position: "absolute",
    left: spacing.m,
    right: spacing.m,
    padding: spacing.m,
    backgroundColor: colors.bananaLeafDark,
    borderRadius: radius.m,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...shadow.card,
  },
  toastText: { color: colors.riceWhite, flex: 1, fontSize: 13, fontWeight: "600" },
  weekCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    marginBottom: spacing.m,
    ...shadow.card,
  },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.s,
  },
  weekDate: { fontFamily: fonts.headingEn, fontSize: 16, color: colors.textPrimary },
  weekBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}14`,
  },
  weekBadgeText: { fontSize: 11, color: colors.bananaLeaf, fontWeight: "700" },
  chipTagTiny: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: radius.pill },
  chipTagTinyText: { fontSize: 10, fontWeight: "700" },
  weekMealRow: {
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  weekMealHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  weekMealLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  weekMealDishes: { fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  weekFooter: {
    marginTop: spacing.s,
    paddingTop: spacing.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  weekFooterText: { fontSize: 11, color: colors.textMuted },
});
