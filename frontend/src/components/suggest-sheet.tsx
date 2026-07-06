// Capt. Charmer's dish suggestion — user feedback v1.0.8.
// A "Suggest" button on each meal asks the Captain to pick a dish that
// pushes the meal toward Balanced. All logic is client-side (uses the
// cached dish catalog + the meal's live macros); adding uses the same
// backend endpoint the Add-dish sheet already uses.
import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, spacing } from "@/src/theme";
import { FoodAvatar } from "@/src/food-visual";
import type { CatalogRecipe } from "@/src/dish-catalog";
import type { Meal } from "@/src/components/meal-card";

const CAPTAIN_IMG = require("../../assets/veeran/posters/point.png");

export type Suggestion = {
  recipe: CatalogRecipe;
  reason: string;
};

/** Pick the dish that best fixes this meal's weakest macro. */
export function pickSuggestion(
  catalog: CatalogRecipe[],
  meal: Meal,
  diet: string | null | undefined,
  excludeIds: string[],
  skipIds: string[] = [],
): Suggestion | null {
  const excluded = new Set([...excludeIds, ...skipIds]);
  const pool = catalog.filter((r) => {
    if (excluded.has(r.id)) return false;
    if (diet === "veg" && r.diet !== "veg") return false;
    if (diet === "egg" && r.diet === "nonveg") return false;
    return true;
  });
  if (pool.length === 0) return null;

  const proteinGap = Math.max(0, (meal.target_protein_min ?? 0) - (meal.protein_g ?? 0));
  const kcalRoom = Math.max(0, (meal.target_kcal?.[1] ?? 800) - (meal.kcal ?? 0));

  const scored = pool
    .map((r) => {
      const p = r.nutrition?.protein_g ?? 0;
      const f = (r.nutrition as any)?.fiber_g ?? 0;
      const k = r.nutrition?.kcal ?? 0;
      let score = proteinGap > 0 ? p * 3 + f : f * 2 + p;
      if (k > kcalRoom) score -= (k - kcalRoom) / 15; // don't blow the kcal budget
      return { r, score, p, f, k };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;
  const reason =
    proteinGap > 0
      ? `+${Math.round(best.p)}g protein — closes the gap toward Balanced`
      : `+${Math.round(best.f)}g fiber, only ${Math.round(best.k)} kcal — keeps it light`;
  return { recipe: best.r, reason };
}

export function SuggestSheet({
  visible,
  suggestion,
  mealLabel,
  busy,
  onAdd,
  onAnother,
  onClose,
}: {
  visible: boolean;
  suggestion: Suggestion | null;
  mealLabel: string;
  busy?: boolean;
  onAdd: () => void;
  onAnother: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} testID="suggest-sheet">
          <Image source={CAPTAIN_IMG} style={styles.captain} resizeMode="cover" />
          <Text style={styles.title}>Captain's pick · {mealLabel}</Text>
          {suggestion ? (
            <>
              <View style={styles.dishRow}>
                <FoodAvatar
                  kind="dish"
                  id={suggestion.recipe.id}
                  category={suggestion.recipe.category}
                  size={64}
                  style={{ marginRight: spacing.m }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dishName} numberOfLines={2}>{suggestion.recipe.name_en}</Text>
                  {suggestion.recipe.name_ta ? (
                    <Text style={styles.dishTa} numberOfLines={1}>{suggestion.recipe.name_ta}</Text>
                  ) : null}
                  <Text style={styles.macro}>
                    {suggestion.recipe.nutrition?.kcal ?? 0} kcal · P {suggestion.recipe.nutrition?.protein_g ?? 0}g
                  </Text>
                </View>
              </View>
              <Text style={styles.reason}>"{suggestion.reason}. Carry on."</Text>
              <TouchableOpacity
                testID="suggest-add-btn"
                style={[styles.addBtn, busy && { opacity: 0.6 }]}
                onPress={onAdd}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.riceWhite} />
                ) : (
                  <>
                    <Ionicons name="add" size={18} color={colors.riceWhite} />
                    <Text style={styles.addBtnText}>Yes Captain, add it</Text>
                  </>
                )}
              </TouchableOpacity>
              <View style={styles.secondaryRow}>
                <TouchableOpacity testID="suggest-another-btn" style={styles.ghostBtn} onPress={onAnother} disabled={busy}>
                  <Ionicons name="refresh" size={15} color={colors.bananaLeaf} />
                  <Text style={styles.ghostBtnText}>Another pick</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={onClose} disabled={busy}>
                  <Text style={styles.ghostBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={styles.reason}>No suitable dish left to suggest — the meal looks complete, soldier.</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.l,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: spacing.l,
    alignItems: "center",
  },
  captain: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: colors.turmeric,
    marginBottom: spacing.s,
  },
  title: { fontFamily: fonts.headingEn, fontSize: 20, color: colors.textPrimary, marginBottom: spacing.m },
  dishRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginBottom: spacing.s },
  dishName: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  dishTa: { fontFamily: fonts.bodyTa, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  macro: { fontSize: 13, color: colors.textSecondary, marginTop: 4, fontWeight: "700" },
  reason: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
    marginBottom: spacing.m,
    lineHeight: 20,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "stretch",
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.bananaLeaf,
  },
  addBtnText: { color: colors.riceWhite, fontWeight: "800", fontSize: 16 },
  secondaryRow: { flexDirection: "row", gap: spacing.m, marginTop: spacing.s },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 48,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  ghostBtnText: { color: colors.bananaLeaf, fontWeight: "700", fontSize: 14 },
});
