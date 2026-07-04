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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/app-header";
import { NutritionRing } from "@/src/components/nutrition-ring";
import { CHIP_META, MEAL_META, MealCard, type Meal, type MealItem } from "@/src/components/meal-card";
import { SwapSheet, type Violation } from "@/src/components/swap-sheet";
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
      setLoading(true);
      if (mode === "today") loadToday();
      else loadWeek();
    }, [mode, loadToday, loadWeek]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    if (mode === "today") loadToday();
    else loadWeek();
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
      <AppHeader title="Plan" subtitleTa="இன்றைய உணவு திட்டம்" />

      <View style={styles.segmentWrap} testID="plan-mode-toggle">
        <View style={styles.segment}>
          {(["today", "week"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              testID={`toggle-${m}`}
              style={[styles.segBtn, mode === m && styles.segBtnActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.segText, mode === m && { color: colors.riceWhite }]}>
                {m === "today" ? "Today" : "This week"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

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
          <DailyRings plan={plan} />

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

          <MealCard meal={plan.breakfast} onSwap={(it) => openSwap("breakfast", it)} onCooked={(it) => onCooked("breakfast", it)} testIDPrefix="meal-breakfast" />
          <MealCard meal={plan.lunch} onSwap={(it) => openSwap("lunch", it)} onCooked={(it) => onCooked("lunch", it)} testIDPrefix="meal-lunch" />
          <MealCard meal={plan.dinner} onSwap={(it) => openSwap("dinner", it)} onCooked={(it) => onCooked("dinner", it)} testIDPrefix="meal-dinner" />

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
              <View style={styles.aiHeaderTextWrap}>
                <View style={styles.aiHeaderTitleRow}>
                  <Ionicons name="sparkles" size={16} color={colors.turmeric} />
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
              </View>
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
                    <Ionicons name="sparkles" size={14} color={colors.riceWhite} />
                    <Text style={styles.aiHeaderBtnText}>
                      {aiMeta?.source === "ai" ? "Re-run" : "Personalise"}
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

      {mode === "today" && (
        <View style={[styles.fab, { bottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            testID="regenerate-btn"
            onPress={regenerate}
            style={styles.fabBtn}
            disabled={regenerating}
          >
            {regenerating ? (
              <ActivityIndicator color={colors.riceWhite} />
            ) : (
              <>
                <Ionicons name="refresh" size={18} color={colors.riceWhite} />
                <Text style={styles.fabText}>Regenerate</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <SwapSheet
        visible={swapCtx != null}
        target={swapCtx?.item ?? null}
        options={swapOptions}
        onClose={() => setSwapCtx(null)}
        onPick={doSwap}
        busy={swapBusy}
        violations={plan?.violations ?? null}
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

function DailyRings({ plan }: { plan: Plan }) {
  const r = plan.rings ?? { kcal: 0, protein_g: 0, fiber_g: 0 };
  const t = plan.day_targets ?? { kcal: 0, protein_g: 0, fiber_g: 0 };
  const totals = plan.day_totals ?? { kcal: 0, protein_g: 0, fiber_g: 0 };
  return (
    <View style={styles.ringsCard} testID="daily-rings">
      <Text style={styles.ringsTitle}>Today&apos;s balance</Text>
      <View style={styles.ringsRow}>
        <NutritionRing testID="ring-kcal" progress={r.kcal} color={colors.bananaLeaf}
          label="Calories" value={`${Math.round(totals.kcal)}`} hint={`/ ${Math.round(t.kcal)}`} />
        <NutritionRing testID="ring-protein" progress={r.protein_g} color={colors.chili}
          label="Protein" value={`${Math.round(totals.protein_g)}g`} hint={`/ ${Math.round(t.protein_g)}g`} />
        <NutritionRing testID="ring-fiber" progress={r.fiber_g} color={colors.turmeric}
          label="Fiber" value={`${Math.round(totals.fiber_g)}g`} hint={`/ ${Math.round(t.fiber_g)}g`} />
      </View>
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
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center" },
  segBtnActive: { backgroundColor: colors.bananaLeaf },
  segText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s,
    backgroundColor: `${colors.turmeric}12`,
    borderColor: `${colors.turmeric}55`,
    borderWidth: 1,
    borderRadius: radius.l,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  aiHeaderTextWrap: { flex: 1 },
  aiHeaderTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiHeaderTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  aiHeaderSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  aiHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.bananaLeaf,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  aiHeaderBtnText: { color: colors.riceWhite, fontWeight: "800", fontSize: 12 },
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
