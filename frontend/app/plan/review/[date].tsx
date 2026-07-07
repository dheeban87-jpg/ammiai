// Batch 16: past-day nutrition review — the outcome view the owner asked for.
// Shows what was actually eaten vs targets, per-meal breakdown, and hands the
// day to Capt. Charmer for strict review + improvement orders.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { CaptainChat } from "@/src/components/captain-chat";
import type { Meal, MealItem } from "@/src/components/meal-card";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

type Plan = {
  date: string;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
  day_targets?: { kcal: number; protein_g: number; fiber_g: number };
};

const MEALS = [
  { key: "breakfast", label: "Breakfast", icon: "sunny-outline" },
  { key: "lunch", label: "Lunch", icon: "restaurant-outline" },
  { key: "dinner", label: "Dinner", icon: "moon-outline" },
] as const;

function eaten(meal: Meal): { items: MealItem[]; kcal: number; protein: number; fiber: number } {
  const anyCooked = meal.items.some((i) => i.cooked && !i.static);
  const items = meal.items.filter((i) => (i.static ? anyCooked : !!i.cooked));
  let kcal = 0, protein = 0, fiber = 0;
  for (const it of items) {
    kcal += it.nutrition?.kcal ?? 0;
    protein += it.nutrition?.protein_g ?? 0;
    fiber += (it.nutrition as any)?.fiber_g ?? 0;
  }
  return { items, kcal, protein, fiber };
}

export default function DayReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  const load = useCallback(async () => {
    if (!date) return;
    try {
      const p = await api.post<Plan>("/api/plan/generate", { date, force: false });
      setPlan(p);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    if (!plan) return null;
    let kcal = 0, protein = 0, fiber = 0, cooked = 0, balanced = 0;
    for (const m of MEALS) {
      const meal = (plan as any)[m.key] as Meal;
      const e = eaten(meal);
      kcal += e.kcal; protein += e.protein; fiber += e.fiber;
      cooked += e.items.filter((i) => !i.static).length;
      if (meal.chip === "balanced") balanced++;
    }
    return { kcal: Math.round(kcal), protein: Math.round(protein), fiber: Math.round(fiber), cooked, balanced };
  }, [plan]);

  const coachBrief = useMemo(() => {
    if (!plan || !totals) return "";
    const tgt = plan.day_targets;
    const meals = MEALS.map((m) => {
      const e = eaten((plan as any)[m.key] as Meal);
      const names = e.items.filter((i) => !i.static).map((i) => i.name_en).join(", ") || "nothing cooked";
      return `${m.label}: ${names}`;
    }).join("; ");
    return (
      `Coach, review my day ${plan.date}. I ate: ${meals}. ` +
      `Totals eaten: ${totals.kcal} kcal, ${totals.protein}g protein, ${totals.fiber}g fiber` +
      (tgt ? ` (targets ${Math.round(tgt.kcal)} kcal / ${Math.round(tgt.protein_g)}g P / ${Math.round(tgt.fiber_g)}g fiber)` : "") +
      `. Balanced meals: ${totals.balanced}/3. Ask me anything you need, then give strict improvement orders for tomorrow.`
    );
  }, [plan, totals]);

  const pct = (v: number, t?: number) => (t && t > 0 ? Math.min(100, Math.round((v / t) * 100)) : null);

  return (
    <View style={styles.screen} testID="day-review-screen">
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn} testID="review-back">
          <Ionicons name="chevron-back" size={24} color={colors.riceWhite} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Day review</Text>
          <Text style={styles.headerSub}>{date}</Text>
        </View>
      </View>

      {loading || !plan || !totals ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.bananaLeaf} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          {/* Outcome */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Nutrition taken</Text>
            {(
              [
                ["Calories", totals.kcal, plan.day_targets?.kcal, "kcal", colors.bananaLeafDark],
                ["Protein", totals.protein, plan.day_targets?.protein_g, "g", colors.chili],
                ["Fiber", totals.fiber, plan.day_targets?.fiber_g, "g", colors.turmeric],
              ] as const
            ).map(([label, val, tgt, unit, tint]) => {
              const p = pct(val, tgt);
              return (
                <View key={label} style={styles.macroRow}>
                  <Text style={styles.macroName}>{label}</Text>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${p ?? 0}%`, backgroundColor: tint }]} />
                  </View>
                  <Text style={[styles.macroNum, { color: tint }]}>
                    {val}{unit === "g" ? "g" : ""}{tgt ? ` / ${Math.round(tgt)}` : ""}
                  </Text>
                </View>
              );
            })}
            <View style={styles.outcomeRow}>
              <View style={[styles.outcomePill, totals.balanced === 3 ? styles.pillGood : totals.balanced >= 1 ? styles.pillMid : styles.pillLow]}>
                <Text style={styles.outcomePillText}>{totals.balanced}/3 meals balanced</Text>
              </View>
              <Text style={styles.outcomeMeta}>{totals.cooked} dishes cooked</Text>
            </View>
          </View>

          {/* Per-meal breakdown */}
          {MEALS.map((m) => {
            const meal = (plan as any)[m.key] as Meal;
            const e = eaten(meal);
            const real = meal.items.filter((i) => !i.static);
            return (
              <View key={m.key} style={styles.card}>
                <View style={styles.mealHead}>
                  <Ionicons name={m.icon as any} size={17} color={colors.bananaLeaf} />
                  <Text style={styles.mealTitle}>{m.label}</Text>
                  <Text style={styles.mealMacros}>
                    {Math.round(e.kcal)} kcal · P {Math.round(e.protein)}g
                  </Text>
                </View>
                {real.length === 0 ? (
                  <Text style={styles.mealEmpty}>Nothing was planned.</Text>
                ) : (
                  real.map((it) => (
                    <View key={it.id} style={styles.dishRow}>
                      <Ionicons
                        name={it.cooked ? "checkmark-circle" : "close-circle-outline"}
                        size={17}
                        color={it.cooked ? colors.bananaLeaf : colors.textMuted}
                      />
                      <Text style={[styles.dishName, !it.cooked && { color: colors.textMuted }]} numberOfLines={1}>
                        {it.name_en}
                      </Text>
                      <Text style={styles.dishStatus}>{it.cooked ? "eaten" : "skipped"}</Text>
                    </View>
                  ))
                )}
              </View>
            );
          })}

          {/* Coach handoff */}
          <TouchableOpacity
            testID="coach-review-btn"
            style={styles.coachBtn}
            onPress={() => setChatOpen(true)}
          >
            <Ionicons name="sparkles" size={18} color={colors.riceWhite} />
            <Text style={styles.coachBtnText}>Get Coach&apos;s review & improvement orders</Text>
          </TouchableOpacity>
          <Text style={styles.coachHint}>
            The Captain reads this day&apos;s intake vs targets and gives strict, specific
            orders for tomorrow.
          </Text>
        </ScrollView>
      )}

      <CaptainChat
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        initialMessage={coachBrief}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bananaLeafDark,
    paddingHorizontal: spacing.m,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.headingBold, fontSize: 24, color: colors.riceWhite },
  headerSub: { fontSize: 13, color: "rgba(251,248,239,0.75)", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.m, gap: spacing.m },
  card: { backgroundColor: colors.surface, borderRadius: radius.l, padding: spacing.m, ...shadow.card },
  sectionLabel: { fontSize: 13, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 },
  macroRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  macroName: { width: 70, fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  barBg: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.surfaceSoft, overflow: "hidden" },
  barFill: { height: 12, borderRadius: 6 },
  macroNum: { minWidth: 84, textAlign: "right", fontSize: 14, fontWeight: "800" },
  outcomeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  outcomePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  pillGood: { backgroundColor: `${colors.bananaLeaf}22` },
  pillMid: { backgroundColor: `${colors.turmeric}26` },
  pillLow: { backgroundColor: `${colors.chili}1E` },
  outcomePillText: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  outcomeMeta: { fontSize: 13, color: colors.textMuted, fontWeight: "700" },
  mealHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  mealTitle: { flex: 1, fontFamily: fonts.headingEn, fontSize: 17, color: colors.textPrimary },
  mealMacros: { fontSize: 12.5, fontWeight: "800", color: colors.textSecondary },
  mealEmpty: { fontSize: 13.5, color: colors.textMuted, fontStyle: "italic" },
  dishRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  dishName: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  dishStatus: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  coachBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.turmeric,
  },
  coachBtnText: { color: colors.riceWhite, fontWeight: "800", fontSize: 15.5 },
  coachHint: { fontSize: 12.5, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
});
