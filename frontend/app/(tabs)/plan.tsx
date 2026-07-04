import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/app-header";
import { NutritionRing } from "@/src/components/nutrition-ring";
import { api } from "@/src/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

// ---- types (kept local — engine's shape is dynamic-ish) ---- //
type MealItem = {
  id: string;
  name_en: string;
  name_ta?: string;
  category: string;
  nutrition?: { kcal?: number; protein_g?: number; fiber_g?: number };
  static?: boolean;
  qty_g?: number;
  _score?: { pantry_ratio?: number; expiring_hits?: string[]; is_favorite?: boolean; zero_shop?: boolean };
};
type Meal = {
  key: "breakfast" | "lunch" | "dinner";
  template: string;
  items: MealItem[];
  chip: "balanced" | "low_protein" | "heavy";
  kcal: number;
  protein_g: number;
  fiber_g: number;
  target_kcal: [number, number];
  target_protein_min: number;
};
type Plan = {
  date: string;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
  day_totals: { kcal: number; protein_g: number; fiber_g: number };
  day_targets: { kcal: number; protein_g: number; fiber_g: number };
  rings: { kcal: number; protein_g: number; fiber_g: number };
  protein_target_g?: number;
  protein_actual_g?: number;
  protein_guard_actions?: string[];
};

const CHIP_META: Record<
  Meal["chip"],
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  balanced: {
    label: "Balanced",
    icon: "checkmark-circle",
    color: colors.bananaLeaf,
    bg: `${colors.bananaLeaf}18`,
  },
  low_protein: {
    label: "Low protein",
    icon: "alert-circle",
    color: colors.turmeric,
    bg: `${colors.turmeric}22`,
  },
  heavy: {
    label: "Heavy",
    icon: "flame",
    color: colors.chili,
    bg: `${colors.chili}22`,
  },
};

const MEAL_META: Record<Meal["key"], { title: string; ta: string; icon: keyof typeof Ionicons.glyphMap }> = {
  breakfast: { title: "Breakfast", ta: "காலை உணவு", icon: "sunny-outline" },
  lunch: { title: "Lunch", ta: "மதிய உணவு", icon: "restaurant-outline" },
  dinner: { title: "Dinner", ta: "இரவு உணவு", icon: "moon-outline" },
};

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"today" | "week">("today");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [week, setWeek] = useState<Plan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // swap sheet state
  const [swapCtx, setSwapCtx] = useState<
    { meal: Meal["key"]; item: MealItem; date: string } | null
  >(null);
  const [swapOptions, setSwapOptions] = useState<MealItem[] | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);

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
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load week plan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
      setError(e?.message ?? "Couldn't regenerate");
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

  return (
    <View style={styles.screen} testID="plan-screen">
      <AppHeader title="Plan" subtitleTa="இன்றைய உணவு திட்டம்" />

      {/* Sticky segmented toggle */}
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
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + 96 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.bananaLeaf} />
          }
          showsVerticalScrollIndicator={false}
        >
          <DailyRings plan={plan} />

          {plan.protein_guard_actions && plan.protein_guard_actions.length > 0 ? (
            <View style={styles.guardBanner} testID="protein-guard-banner">
              <Ionicons name="fitness" size={16} color={colors.turmeric} />
              <Text style={styles.guardText}>
                {plan.protein_guard_actions.join(" · ")}
              </Text>
            </View>
          ) : null}

          <MealCard
            meal={plan.breakfast}
            onSwap={(it) => openSwap("breakfast", it)}
            testIDPrefix="meal-breakfast"
          />
          <MealCard
            meal={plan.lunch}
            onSwap={(it) => openSwap("lunch", it)}
            testIDPrefix="meal-lunch"
          />
          <MealCard
            meal={plan.dinner}
            onSwap={(it) => openSwap("dinner", it)}
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
          contentContainerStyle={{
            padding: spacing.m,
            paddingBottom: insets.bottom + 96,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.bananaLeaf} />
          }
          renderItem={({ item }) => <WeekDayCard plan={item} />}
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

      {/* Swap sheet */}
      <Modal
        visible={swapCtx != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSwapCtx(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSwapCtx(null)}>
          <Pressable
            style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.m }]}
            onPress={(e) => e.stopPropagation()}
            testID="swap-sheet"
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Swap this dish</Text>
            {swapCtx ? (
              <Text style={styles.modalSub}>
                Instead of {swapCtx.item.name_en} · same category · same rules
              </Text>
            ) : null}
            {swapOptions === null ? (
              <View style={{ padding: spacing.l, alignItems: "center" }}>
                <ActivityIndicator color={colors.bananaLeaf} />
              </View>
            ) : swapOptions.length === 0 ? (
              <View style={styles.emptySwap}>
                <Text style={styles.emptySwapText}>
                  No valid alternates. All other dishes in this category would break a rule.
                </Text>
              </View>
            ) : (
              swapOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.swapOption}
                  onPress={() => doSwap(opt)}
                  disabled={swapBusy}
                  testID={`swap-option-${opt.id}`}
                >
                  <View style={styles.swapIconWrap}>
                    <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={colors.bananaLeaf} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.swapTitle}>{opt.name_en}</Text>
                    {opt.name_ta ? <Text style={styles.swapTa}>{opt.name_ta}</Text> : null}
                    <View style={styles.swapMeta}>
                      {opt._score?.zero_shop ? (
                        <View style={[styles.tinyChip, { backgroundColor: `${colors.bananaLeaf}18` }]}>
                          <Text style={[styles.tinyChipText, { color: colors.bananaLeaf }]}>
                            0 shopping
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.pantryHint}>
                          {Math.round((opt._score?.pantry_ratio ?? 0) * 100)}% in pantry
                        </Text>
                      )}
                      {opt._score?.expiring_hits?.length ? (
                        <View style={[styles.tinyChip, { backgroundColor: `${colors.turmeric}22` }]}>
                          <Text style={[styles.tinyChipText, { color: colors.turmeric }]}>
                            Uses expiring
                          </Text>
                        </View>
                      ) : null}
                      {opt._score?.is_favorite ? (
                        <View style={[styles.tinyChip, { backgroundColor: `${colors.chili}18` }]}>
                          <Text style={[styles.tinyChipText, { color: colors.chili }]}>♥ Favorite</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.swapKcal}>{opt.nutrition?.kcal ?? 0} kcal</Text>
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity
              onPress={() => setSwapCtx(null)}
              style={styles.cancelBtn}
              disabled={swapBusy}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---- Sub-components ---- //
function DailyRings({ plan }: { plan: Plan }) {
  const r = plan.rings ?? { kcal: 0, protein_g: 0, fiber_g: 0 };
  const t = plan.day_targets ?? { kcal: 0, protein_g: 0, fiber_g: 0 };
  const totals = plan.day_totals ?? { kcal: 0, protein_g: 0, fiber_g: 0 };
  return (
    <View style={styles.ringsCard} testID="daily-rings">
      <Text style={styles.ringsTitle}>Today&apos;s balance</Text>
      <View style={styles.ringsRow}>
        <NutritionRing
          testID="ring-kcal"
          progress={r.kcal}
          color={colors.bananaLeaf}
          label="Calories"
          value={`${Math.round(totals.kcal)}`}
          hint={`/ ${Math.round(t.kcal)}`}
        />
        <NutritionRing
          testID="ring-protein"
          progress={r.protein_g}
          color={colors.chili}
          label="Protein"
          value={`${Math.round(totals.protein_g)}g`}
          hint={`/ ${Math.round(t.protein_g)}g`}
        />
        <NutritionRing
          testID="ring-fiber"
          progress={r.fiber_g}
          color={colors.turmeric}
          label="Fiber"
          value={`${Math.round(totals.fiber_g)}g`}
          hint={`/ ${Math.round(t.fiber_g)}g`}
        />
      </View>
    </View>
  );
}

function MealCard({
  meal,
  onSwap,
  testIDPrefix,
}: {
  meal: Meal;
  onSwap: (item: MealItem) => void;
  testIDPrefix: string;
}) {
  const chip = CHIP_META[meal.chip];
  const meta = MEAL_META[meal.key];
  return (
    <View style={styles.mealCard} testID={testIDPrefix}>
      <View style={styles.mealHeader}>
        <View style={styles.mealHeaderLeft}>
          <View style={styles.mealIconWrap}>
            <Ionicons name={meta.icon} size={20} color={colors.bananaLeaf} />
          </View>
          <View>
            <Text style={styles.mealTitle}>{meta.title}</Text>
            <Text style={styles.mealTa}>{meta.ta}</Text>
          </View>
        </View>
        <View style={[styles.chipTag, { backgroundColor: chip.bg }]} testID={`${testIDPrefix}-chip`}>
          <Ionicons name={chip.icon} size={12} color={chip.color} />
          <Text style={[styles.chipTagText, { color: chip.color }]}>{chip.label}</Text>
        </View>
      </View>

      {meal.items.map((it, idx) => (
        <View
          key={`${it.id}-${idx}`}
          style={[
            styles.dishRow,
            idx === meal.items.length - 1 && { borderBottomWidth: 0 },
          ]}
          testID={`${testIDPrefix}-dish-${it.id}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.dishEn} numberOfLines={1}>
              {it.name_en}
              {it.qty_g ? <Text style={styles.dishQty}>  {it.qty_g}g</Text> : null}
            </Text>
            {it.name_ta && it.name_ta !== it.name_en ? (
              <Text style={styles.dishTa} numberOfLines={1}>
                {it.name_ta}
              </Text>
            ) : null}
            {!it.static && it._score ? (
              <View style={styles.dishMetaRow}>
                {it._score.zero_shop ? (
                  <Text style={[styles.dishMetaGood]}>0 shopping</Text>
                ) : (
                  <Text style={styles.dishMetaMuted}>
                    {Math.round((it._score.pantry_ratio ?? 0) * 100)}% in pantry
                  </Text>
                )}
                {it._score.expiring_hits && it._score.expiring_hits.length > 0 ? (
                  <Text style={styles.dishMetaWarn}> · uses expiring</Text>
                ) : null}
              </View>
            ) : null}
          </View>
          {!it.static ? (
            <TouchableOpacity
              testID={`${testIDPrefix}-swap-${it.id}`}
              style={styles.swapBtn}
              onPress={() => onSwap(it)}
              hitSlop={8}
            >
              <Ionicons name="swap-horizontal" size={16} color={colors.bananaLeaf} />
              <Text style={styles.swapBtnText}>Swap</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.staticTag}>
              <Text style={styles.staticTagText}>Base</Text>
            </View>
          )}
        </View>
      ))}

      <View style={styles.mealFooter}>
        <NutritionChip label="kcal" value={Math.round(meal.kcal)} tint={colors.bananaLeaf} />
        <NutritionChip label="P" value={`${Math.round(meal.protein_g)}g`} tint={colors.chili} />
        <NutritionChip label="Fiber" value={`${Math.round(meal.fiber_g)}g`} tint={colors.turmeric} />
      </View>
    </View>
  );
}

function NutritionChip({ label, value, tint }: { label: string; value: number | string; tint: string }) {
  return (
    <View style={[styles.nutChip, { backgroundColor: `${tint}12` }]}>
      <Text style={[styles.nutChipValue, { color: tint }]}>{value}</Text>
      <Text style={styles.nutChipLabel}>{label}</Text>
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
      {(["breakfast", "lunch", "dinner"] as const).map((mk) => {
        const meal = (plan as any)[mk] as Meal;
        const names = meal.items
          .filter((i) => !i.static)
          .map((i) => i.name_en)
          .join(", ");
        const chip = CHIP_META[meal.chip];
        return (
          <View key={mk} style={styles.weekMealRow}>
            <View style={styles.weekMealHeader}>
              <Text style={styles.weekMealLabel}>{MEAL_META[mk].title}</Text>
              <View style={[styles.chipTagTiny, { backgroundColor: chip.bg }]}>
                <Text style={[styles.chipTagTinyText, { color: chip.color }]}>
                  {chip.label}
                </Text>
              </View>
            </View>
            <Text style={styles.weekMealDishes} numberOfLines={2}>
              {names || "—"}
            </Text>
          </View>
        );
      })}
      <View style={styles.weekFooter}>
        <Text style={styles.weekFooterText}>
          {Math.round(plan.day_totals.kcal)} kcal · {Math.round(plan.day_totals.protein_g)}g protein ·{" "}
          {Math.round(plan.day_totals.fiber_g)}g fiber
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
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  segBtnActive: {
    backgroundColor: colors.bananaLeaf,
  },
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
  ringsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
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
  mealCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    marginBottom: spacing.m,
    ...shadow.card,
  },
  mealHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.m,
  },
  mealHeaderLeft: { flexDirection: "row", alignItems: "center" },
  mealIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}14`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.s,
  },
  mealTitle: {
    fontFamily: fonts.headingEn,
    fontSize: 18,
    color: colors.textPrimary,
  },
  mealTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 12,
    color: colors.textMuted,
  },
  chipTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
  },
  chipTagText: { fontSize: 11, fontWeight: "700" },
  chipTagTiny: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
  },
  chipTagTinyText: { fontSize: 10, fontWeight: "700" },
  dishRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dishEn: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  dishQty: { fontSize: 11, color: colors.textMuted, fontWeight: "400" },
  dishTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  dishMetaRow: { flexDirection: "row", marginTop: 3 },
  dishMetaGood: { fontSize: 11, color: colors.bananaLeaf, fontWeight: "600" },
  dishMetaMuted: { fontSize: 11, color: colors.textMuted },
  dishMetaWarn: { fontSize: 11, color: colors.turmeric, fontWeight: "600" },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}12`,
  },
  swapBtnText: { fontSize: 12, color: colors.bananaLeaf, fontWeight: "700" },
  staticTag: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
  },
  staticTagText: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  mealFooter: {
    flexDirection: "row",
    gap: 8,
    marginTop: spacing.m,
  },
  nutChip: {
    flex: 1,
    borderRadius: radius.m,
    paddingVertical: 8,
    alignItems: "center",
  },
  nutChipValue: { fontFamily: fonts.headingEn, fontSize: 18 },
  nutChipLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2, fontWeight: "600" },
  fab: {
    position: "absolute",
    right: spacing.m,
    zIndex: 5,
  },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: spacing.m,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.m,
  },
  modalTitle: {
    fontFamily: fonts.headingEn,
    fontSize: 20,
    color: colors.textPrimary,
  },
  modalSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    marginBottom: spacing.m,
  },
  emptySwap: { padding: spacing.l, alignItems: "center" },
  emptySwapText: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 13,
    maxWidth: 260,
  },
  swapOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.m,
    borderRadius: radius.m,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swapIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}14`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.m,
  },
  swapTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  swapTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  swapMeta: { flexDirection: "row", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" },
  tinyChip: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: radius.pill },
  tinyChipText: { fontSize: 10, fontWeight: "700" },
  pantryHint: { fontSize: 11, color: colors.textMuted },
  swapKcal: {
    fontFamily: fonts.headingEn,
    fontSize: 15,
    color: colors.textPrimary,
    marginLeft: spacing.s,
  },
  cancelBtn: {
    marginTop: spacing.s,
    paddingVertical: 12,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
  },
  cancelText: { color: colors.textSecondary, fontWeight: "600" },
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
  // Week view
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
  weekDate: {
    fontFamily: fonts.headingEn,
    fontSize: 16,
    color: colors.textPrimary,
  },
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
