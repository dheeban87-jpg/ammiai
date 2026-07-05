import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NutritionRing } from "@/src/components/nutrition-ring";
import { MealCard, MEAL_META, type Meal, type MealItem } from "@/src/components/meal-card";
import { SwapSheet, type Violation } from "@/src/components/swap-sheet";
import { AddDishSheet } from "@/src/components/add-dish-sheet";
import { loadDishCatalog, filterDishes, type CatalogRecipe } from "@/src/dish-catalog";
import { useAuth } from "@/src/auth-context";
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
  violations?: Violation[];
  ai_reason?: string;
  ai_source?: "ai" | "fallback";
};

export default function DayEditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);

  const [swapCtx, setSwapCtx] = useState<
    { meal: Meal["key"]; item: MealItem } | null
  >(null);
  const [swapOptions, setSwapOptions] = useState<MealItem[] | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);

  const [addCtx, setAddCtx] = useState<{ meal: Meal["key"]; date: string } | null>(null);
  const [addOptions, setAddOptions] = useState<MealItem[] | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [catalog, setCatalog] = useState<CatalogRecipe[] | null>(null);
  const { profile } = useAuth();

  const load = useCallback(async () => {
    if (!date) return;
    try {
      const p = await api.post<Plan>("/api/plan/generate", { date, force: false });
      setPlan(p);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load plan");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setViolations([]);
      load();
    }, [load]),
  );

  const openSwap = async (mealKey: Meal["key"], item: MealItem) => {
    if (!date || item.static) return;
    setSwapCtx({ meal: mealKey, item });
    setSwapOptions(null);
    try {
      const r = await api.get<{ options: MealItem[] }>(
        `/api/plan/swap-options?date=${date}&meal=${mealKey}&recipe_id=${item.id}`,
      );
      setSwapOptions(r.options);
    } catch {
      setSwapOptions([]);
    }
  };

  const doSwap = async (opt: MealItem) => {
    if (!swapCtx || !date) return;
    setSwapBusy(true);
    try {
      const updated = await api.post<Plan>("/api/plan/swap", {
        date,
        meal: swapCtx.meal,
        current_recipe_id: swapCtx.item.id,
        new_recipe_id: opt.id,
      });
      setPlan(updated);
      setViolations(updated.violations ?? []);
      setSwapCtx(null);
    } finally {
      setSwapBusy(false);
    }
  };

  const openAddDish = async (meal: Meal["key"]) => {
    if (!date) return;
    setAddCtx({ meal, date });
    setAddOptions(null);
    try {
      const all = await loadDishCatalog();
      setCatalog(all);
      setAddOptions(filterDishes(all, { diet: profile?.diet }));
    } catch {
      setAddOptions([]);
    }
  };

  const searchAddDish = (q: string) => {
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
      setPlan(updated);
      setAddCtx(null);
    } finally {
      setAddBusy(false);
    }
  };

  const removeDish = async (meal: Meal["key"], item: MealItem) => {
    if (!date) return;
    try {
      const updated = await api.post<Plan>("/api/plan/remove-dish", {
        date,
        meal,
        recipe_id: item.id,
      });
      setPlan(updated);
    } catch {
      /* noop */
    }
  };

  const onCooked = async (mealKey: Meal["key"], item: MealItem) => {
    if (!date) return;
    try {
      await api.post(`/api/plan/${date}/cooked`, { meal: mealKey, recipe_id: item.id });
      // Refresh
      const p = await api.post<Plan>("/api/plan/generate", { date, force: false });
      setPlan(p);
    } catch {
      /* noop */
    }
  };

  const regenerate = async () => {
    if (!date) return;
    setRegenerating(true);
    try {
      const p = await api.post<Plan>("/api/plan/generate", {
        date,
        force: true,
        seed: Date.now() % 1_000_000,
      });
      setPlan(p);
      setViolations([]);
    } finally {
      setRegenerating(false);
    }
  };

  const dateObj = date ? new Date(date + "T00:00:00") : new Date();
  const label = dateObj.toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });
  const labelSub = dateObj.toLocaleDateString("en-US", { year: "numeric" });

  return (
    <View style={styles.screen} testID="day-edit-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.s }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn} testID="day-back">
          <Ionicons name="chevron-back" size={24} color={colors.textOnPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{label}</Text>
          <Text style={styles.headerSub}>{labelSub}</Text>
        </View>
        <TouchableOpacity
          testID="day-regenerate"
          onPress={regenerate}
          style={styles.regenBtn}
          disabled={regenerating}
        >
          {regenerating ? (
            <ActivityIndicator color={colors.riceWhite} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.riceWhite} />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.bananaLeaf} />
        </View>
      ) : plan ? (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.l }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Rings */}
          <View style={styles.ringsCard} testID="day-rings">
            <View style={styles.ringsRow}>
              <NutritionRing
                testID="day-ring-kcal"
                size={82}
                strokeWidth={9}
                progress={plan.rings.kcal}
                color={colors.bananaLeaf}
                label="Calories"
                value={`${Math.round(plan.day_totals.kcal)}`}
                hint={`/ ${Math.round(plan.day_targets.kcal)}`}
              />
              <NutritionRing
                testID="day-ring-protein"
                size={82}
                strokeWidth={9}
                progress={plan.rings.protein_g}
                color={colors.chili}
                label="Protein"
                value={`${Math.round(plan.day_totals.protein_g)}g`}
                hint={`/ ${Math.round(plan.day_targets.protein_g)}g`}
              />
              <NutritionRing
                testID="day-ring-fiber"
                size={82}
                strokeWidth={9}
                progress={plan.rings.fiber_g}
                color={colors.turmeric}
                label="Fiber"
                value={`${Math.round(plan.day_totals.fiber_g)}g`}
                hint={`/ ${Math.round(plan.day_targets.fiber_g)}g`}
              />
            </View>
          </View>

          {plan.ai_reason ? (
            <View style={styles.aiReasonCard} testID="day-ai-reason">
              <Ionicons name="sparkles" size={14} color={colors.turmeric} />
              <Text style={styles.aiReasonText} numberOfLines={4}>
                {plan.ai_reason}
              </Text>
            </View>
          ) : null}

          {/* Persistent violation banner (last swap) */}
          {violations.length > 0 ? (
            <View style={styles.violationsBanner} testID="day-violations">
              {violations.map((v) => (
                <View key={v.rule} style={styles.violationRow}>
                  <Ionicons name="warning" size={16} color={colors.turmeric} />
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={styles.violationTitle}>{v.message}</Text>
                    <Text style={styles.violationFix}>Suggestion: {v.suggested_fix}</Text>
                  </View>
                </View>
              ))}
              <Text style={styles.violationHint}>
                Your choice is kept. You can swap again to auto-fix.
              </Text>
            </View>
          ) : null}

          <MealCard
            meal={plan.breakfast}
            onSwap={(it) => openSwap("breakfast", it)}
            onCooked={(it) => onCooked("breakfast", it)}
            onRemove={(it) => removeDish("breakfast", it)}
            onAddDish={() => openAddDish("breakfast")}
            testIDPrefix="day-breakfast"
          />
          <MealCard
            meal={plan.lunch}
            onSwap={(it) => openSwap("lunch", it)}
            onCooked={(it) => onCooked("lunch", it)}
            onRemove={(it) => removeDish("lunch", it)}
            onAddDish={() => openAddDish("lunch")}
            testIDPrefix="day-lunch"
          />
          <MealCard
            meal={plan.dinner}
            onSwap={(it) => openSwap("dinner", it)}
            onCooked={(it) => onCooked("dinner", it)}
            onRemove={(it) => removeDish("dinner", it)}
            onAddDish={() => openAddDish("dinner")}
            testIDPrefix="day-dinner"
          />

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={colors.chili} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={{ color: colors.textMuted }}>{error || "Plan unavailable"}</Text>
        </View>
      )}

      <SwapSheet
        visible={swapCtx != null}
        target={swapCtx?.item ?? null}
        options={swapOptions}
        onClose={() => setSwapCtx(null)}
        onPick={doSwap}
        busy={swapBusy}
      />

      <AddDishSheet
        visible={addCtx != null}
        mealLabel={addCtx ? MEAL_META[addCtx.meal].title : undefined}
        options={addOptions}
        onClose={() => setAddCtx(null)}
        onPick={pickAddDish}
        onSearch={searchAddDish}
        busy={addBusy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
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
  header: {
    backgroundColor: colors.bananaLeafDark,
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontFamily: fonts.headingEn,
    fontSize: 20,
    color: colors.textOnPrimary,
    textAlign: "center",
  },
  headerSub: {
    fontSize: 11,
    color: "rgba(251,248,239,0.7)",
    textAlign: "center",
    marginTop: 2,
  },
  regenBtn: {
    width: 34, height: 34, borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.m },
  ringsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    marginBottom: spacing.m,
    ...shadow.card,
  },
  ringsRow: { flexDirection: "row", justifyContent: "space-around" },
  violationsBanner: {
    backgroundColor: "#FBEED0",
    borderRadius: radius.m,
    padding: spacing.m,
    marginBottom: spacing.m,
    gap: 6,
  },
  violationRow: { flexDirection: "row", alignItems: "flex-start" },
  violationTitle: { color: colors.turmeric, fontSize: 12, fontWeight: "700" },
  violationFix: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  violationHint: {
    marginTop: 4,
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: "italic",
  },
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
});
