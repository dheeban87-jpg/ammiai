// Shared meal-card component used by /plan and /plan/day/[date]
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FoodAvatar } from "@/src/food-visual";

import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { openYoutubeRecipe } from "@/src/youtube-recipe";

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
  onRemove,
  onAddDish,
  onSuggest,
  testIDPrefix,
}: {
  meal: Meal;
  onSwap: (item: MealItem) => void;
  onCooked?: (item: MealItem) => void;
  onRemove?: (item: MealItem) => void;
  onAddDish?: () => void;
  onSuggest?: () => void;
  testIDPrefix: string;
}) {
  const chip = CHIP_META[meal.chip];
  const meta = MEAL_META[meal.key];
  const { t, lang } = useI18n();
  const isEmpty = meal.items.length === 0 || meal.items.every((it) => it.static);
  return (
    <View style={styles.mealCard} testID={testIDPrefix}>
      <View style={styles.mealHeader}>
        <View style={styles.mealHeaderLeft}>
          <View style={styles.mealIconWrap}>
            <Ionicons name={meta.icon} size={20} color={colors.bananaLeaf} />
          </View>
          <View>
            <Text style={styles.mealTitle}>{lang === "ta" ? meta.ta : meta.title}</Text>
            <Text style={styles.mealTa}>{lang === "ta" ? meta.title : meta.ta}</Text>
          </View>
        </View>
        <View style={[styles.chipTag, { backgroundColor: chip.bg }]} testID={`${testIDPrefix}-chip`}>
          <Ionicons name={chip.icon} size={12} color={chip.color} />
          <Text style={[styles.chipTagText, { color: chip.color }]}>{t(`nut.${meal.chip}` as any)}</Text>
        </View>
      </View>

      {isEmpty && onAddDish ? (
        <TouchableOpacity
          style={styles.emptyState}
          onPress={onAddDish}
          testID={`${testIDPrefix}-plan-empty`}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.bananaLeaf} />
          <Text style={styles.emptyStateText}>{t("dish.add")}</Text>
        </TouchableOpacity>
      ) : null}

      {meal.items.map((it, idx) => (
        <View
          key={`${it.id}-${idx}`}
          style={[
            styles.dishRow,
            idx === meal.items.length - 1 && { borderBottomWidth: 0 },
          ]}
          testID={`${testIDPrefix}-dish-${it.id}`}
        >
          <FoodAvatar
            kind="dish"
            id={it.id}
            category={(it as any).category}
            size={56}
            style={{ marginRight: 10 }}
          />
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
                  <Text style={styles.cookedBadgeText}>{t("dish.cooked")}</Text>
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
            <View style={styles.actionsCol}>
              <View style={styles.staticTag}>
                <Text style={styles.staticTagText}>{t("dish.base")}</Text>
              </View>
              {onRemove ? (
                <TouchableOpacity
                  testID={`${testIDPrefix}-remove-${it.id}`}
                  style={styles.baseRemoveBtn}
                  onPress={() => onRemove(it)}
                  hitSlop={10}
                  accessibilityLabel={`Remove ${it.name_en}`}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={styles.actionsCol}>
              {onCooked && !it.cooked ? (
                <TouchableOpacity
                  testID={`${testIDPrefix}-cook-${it.id}`}
                  style={styles.cookBtn}
                  onPress={() => onCooked(it)}
                  hitSlop={10}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.chili} />
                  <Text style={styles.cookBtnText}>{t("dish.cooked")}</Text>
                </TouchableOpacity>
              ) : null}
              <View style={{ flexDirection: "row", gap: 6 }}>
                {/* Watch how to cook it — opens YouTube on "<dish> tamil recipe",
                    same deep-link pattern as the Instamart/Zepto search. */}
                <TouchableOpacity
                  testID={`${testIDPrefix}-yt-${it.id}`}
                  style={styles.ytBtn}
                  onPress={() => openYoutubeRecipe(it.name_en, it.name_ta)}
                  hitSlop={10}
                  accessibilityLabel={`Watch ${it.name_en} recipe on YouTube`}
                >
                  <Ionicons name="logo-youtube" size={16} color="#E23744" />
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`${testIDPrefix}-swap-${it.id}`}
                  style={styles.swapBtn}
                  onPress={() => onSwap(it)}
                  hitSlop={10}
                >
                  <Ionicons name="swap-horizontal" size={16} color={colors.bananaLeaf} />
                  <Text style={styles.swapBtnText}>{t("dish.swap")}</Text>
                </TouchableOpacity>
                {onRemove ? (
                  <TouchableOpacity
                    testID={`${testIDPrefix}-remove-${it.id}`}
                    style={styles.removeBtn}
                    onPress={() => onRemove(it)}
                    hitSlop={10}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}
        </View>
      ))}

      {!isEmpty && onSuggest ? (
        <TouchableOpacity
          style={styles.suggestBtn}
          onPress={onSuggest}
          testID={`${testIDPrefix}-suggest`}
          hitSlop={8}
        >
          <Ionicons name="sparkles" size={17} color={colors.riceWhite} />
          <Text style={styles.suggestText}>{`Captain's suggestion`}</Text>
        </TouchableOpacity>
      ) : null}

      {!isEmpty && onAddDish ? (
        <TouchableOpacity
          style={styles.addDishBtn}
          onPress={onAddDish}
          testID={`${testIDPrefix}-add-dish`}
          hitSlop={8}
        >
          <Ionicons name="add" size={18} color={colors.bananaLeaf} />
          <Text style={styles.addDishText}>Add dish</Text>
        </TouchableOpacity>
      ) : null}

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
  mealTitle: { fontFamily: fonts.headingEn, fontSize: 21, color: colors.textPrimary },
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
    minHeight: 64,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dishEn: { fontSize: 17.5, fontWeight: "700", color: colors.textPrimary },
  dishAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 10 },
  dishAvatarEmoji: { fontSize: 22 },
  dishQty: { fontSize: 11, color: colors.textMuted, fontWeight: "400" },
  dishTa: { fontFamily: fonts.bodyTa, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  dishMetaRow: { flexDirection: "row", marginTop: 3 },
  dishMetaGood: { fontSize: 11, color: colors.bananaLeaf, fontWeight: "600" },
  dishMetaMuted: { fontSize: 11, color: colors.textMuted },
  dishMetaWarn: { fontSize: 11, color: colors.turmeric, fontWeight: "600" },
  ytBtn: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "#E2374414",
    alignItems: "center",
    justifyContent: "center",
  },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 40,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}14`,
  },
  swapBtnText: { fontSize: 13, color: colors.bananaLeaf, fontWeight: "700" },
  removeBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
  },
  cookBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 40,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: `${colors.chili}14`,
  },
  cookBtnText: { fontSize: 13, color: colors.chili, fontWeight: "700" },
  actionsCol: {
    alignItems: "flex-end",
    gap: 8,
  },
  emptyState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    marginBottom: spacing.s,
    borderRadius: radius.m,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: `${colors.bananaLeaf}40`,
    backgroundColor: `${colors.bananaLeaf}08`,
  },
  emptyStateText: { color: colors.bananaLeaf, fontWeight: "700", fontSize: 14 },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 50,
    marginTop: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.turmeric,
  },
  suggestText: { color: colors.riceWhite, fontWeight: "800", fontSize: 15 },
  addDishBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    marginTop: spacing.xs,
    marginBottom: spacing.s,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addDishText: { color: colors.bananaLeaf, fontWeight: "700", fontSize: 13 },
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
  baseRemoveBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSoft,
    marginTop: 6,
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
