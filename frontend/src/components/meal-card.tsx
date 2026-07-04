// Shared meal-card component used by /plan and /plan/day/[date]
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

export type MealItem = {
  id: string;
  name_en: string;
  name_ta?: string;
  category: string;
  nutrition?: { kcal?: number; protein_g?: number; fiber_g?: number };
  static?: boolean;
  qty_g?: number;
  cooked?: boolean;
  _score?: {
    pantry_ratio?: number;
    expiring_hits?: string[];
    is_favorite?: boolean;
    zero_shop?: boolean;
  };
};

export type Meal = {
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

export const CHIP_META: Record<
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

export const MEAL_META: Record<Meal["key"], { title: string; ta: string; icon: keyof typeof Ionicons.glyphMap }> = {
  breakfast: { title: "Breakfast", ta: "காலை உணவு", icon: "sunny-outline" },
  lunch: { title: "Lunch", ta: "மதிய உணவு", icon: "restaurant-outline" },
  dinner: { title: "Dinner", ta: "இரவு உணவு", icon: "moon-outline" },
};

export function MealCard({
  meal,
  onSwap,
  onCooked,
  testIDPrefix,
}: {
  meal: Meal;
  onSwap: (item: MealItem) => void;
  onCooked?: (item: MealItem) => void;
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
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={[
                  styles.dishEn,
                  it.cooked && { textDecorationLine: "line-through", color: colors.textMuted },
                ]}
                numberOfLines={1}
              >
                {it.name_en}
                {it.qty_g ? <Text style={styles.dishQty}>  {it.qty_g}g</Text> : null}
              </Text>
              {it.cooked ? (
                <View style={styles.cookedBadge} testID={`${testIDPrefix}-cooked-${it.id}`}>
                  <Ionicons name="checkmark" size={10} color={colors.riceWhite} />
                  <Text style={styles.cookedBadgeText}>Cooked</Text>
                </View>
              ) : null}
            </View>
            {it.name_ta && it.name_ta !== it.name_en ? (
              <Text style={styles.dishTa} numberOfLines={1}>
                {it.name_ta}
              </Text>
            ) : null}
            {!it.static && it._score ? (
              <View style={styles.dishMetaRow}>
                {it._score.zero_shop ? (
                  <Text style={styles.dishMetaGood}>0 shopping</Text>
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
          {it.static ? (
            <View style={styles.staticTag}>
              <Text style={styles.staticTagText}>Base</Text>
            </View>
          ) : (
            <View style={styles.actionsCol}>
              {onCooked && !it.cooked ? (
                <TouchableOpacity
                  testID={`${testIDPrefix}-cook-${it.id}`}
                  style={styles.cookBtn}
                  onPress={() => onCooked(it)}
                  hitSlop={6}
                >
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.chili} />
                  <Text style={styles.cookBtnText}>Cooked</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                testID={`${testIDPrefix}-swap-${it.id}`}
                style={styles.swapBtn}
                onPress={() => onSwap(it)}
                hitSlop={6}
              >
                <Ionicons name="swap-horizontal" size={14} color={colors.bananaLeaf} />
                <Text style={styles.swapBtnText}>Swap</Text>
              </TouchableOpacity>
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

const styles = StyleSheet.create({
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
  mealTitle: { fontFamily: fonts.headingEn, fontSize: 18, color: colors.textPrimary },
  mealTa: { fontFamily: fonts.bodyTa, fontSize: 12, color: colors.textMuted },
  chipTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
  },
  chipTagText: { fontSize: 11, fontWeight: "700" },
  dishRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dishEn: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  dishQty: { fontSize: 11, color: colors.textMuted, fontWeight: "400" },
  dishTa: { fontFamily: fonts.bodyTa, fontSize: 12, color: colors.textMuted, marginTop: 2 },
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
  cookBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: `${colors.chili}12`,
  },
  cookBtnText: { fontSize: 12, color: colors.chili, fontWeight: "700" },
  actionsCol: {
    alignItems: "flex-end",
    gap: 6,
  },
  cookedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bananaLeaf,
  },
  cookedBadgeText: {
    color: colors.riceWhite,
    fontSize: 9,
    fontWeight: "700",
  },
  staticTag: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
  },
  staticTagText: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  mealFooter: { flexDirection: "row", gap: 8, marginTop: spacing.m },
  nutChip: {
    flex: 1,
    borderRadius: radius.m,
    paddingVertical: 8,
    alignItems: "center",
  },
  nutChipValue: { fontFamily: fonts.headingEn, fontSize: 18 },
  nutChipLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2, fontWeight: "600" },
});
