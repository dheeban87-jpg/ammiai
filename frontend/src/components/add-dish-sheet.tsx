// AddDishSheet — searchable dish picker for manually planning/adding a dish
// to any meal slot. User-driven planning, not just AI-generated + swap.
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radius, spacing } from "@/src/theme";
import { FoodAvatar } from "@/src/food-visual";
import { useI18n } from "@/src/i18n";
import type { MealItem } from "@/src/components/meal-card";

type Props = {
  visible: boolean;
  mealLabel?: string;
  onCreateOwn?: () => void;
  options: MealItem[] | null;
  onClose: () => void;
  onPick: (opt: MealItem) => void;
  onSearch: (q: string) => void;
  busy?: boolean;
};

export function AddDishSheet({ visible, mealLabel, options, onClose, onPick, onSearch, busy, onCreateOwn }: Props) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const { t } = useI18n();

  const list = useMemo(() => options ?? [], [options]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { paddingBottom: insets.bottom + spacing.m, maxHeight: "82%" }]}
          onPress={(e) => e.stopPropagation()}
          testID="add-dish-sheet"
        >
          <View style={styles.handle} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.title}>{t("addsheet.title")}{mealLabel ? ` · ${mealLabel}` : ""}</Text>
            {onCreateOwn ? (
              <TouchableOpacity testID="create-own-dish-btn" style={styles.ownBtn} onPress={onCreateOwn} hitSlop={8}>
                <Ionicons name="create-outline" size={15} color={colors.riceWhite} />
                <Text style={styles.ownBtnText}>My own dish</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.sub}>{t("addsheet.sub")}</Text>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={q}
              onChangeText={(v) => {
                setQ(v);
                onSearch(v);
              }}
              placeholder={t("addsheet.search")}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              testID="add-dish-search"
            />
          </View>

          {options === null ? (
            <View style={{ padding: spacing.l, alignItems: "center" }}>
              <ActivityIndicator color={colors.bananaLeaf} />
            </View>
          ) : list.length === 0 ? (
            <View style={{ padding: spacing.l, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                {q
                  ? `${t("addsheet.nomatch")}: "${q}"`
                  : t("addsheet.loadfail")}
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {list.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.row}
                  onPress={() => onPick(opt)}
                  disabled={busy}
                  testID={`add-dish-option-${opt.id}`}
                >
                  <FoodAvatar kind="dish" id={opt.id} category={opt.category} size={58} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{opt.name_en}</Text>
                    {opt.name_ta ? <Text style={styles.rowTa} numberOfLines={1}>{opt.name_ta}</Text> : null}
                    {opt._score ? (
                      opt._score.zero_shop ? (
                        <Text style={styles.rowGood}>0 shopping</Text>
                      ) : (
                        <Text style={styles.rowMuted}>{Math.round((opt._score.pantry_ratio ?? 0) * 100)}% in pantry</Text>
                      )
                    ) : null}
                  </View>
                  <View style={styles.rowMacros}>
                    <Text style={styles.rowKcal}>{opt.nutrition?.kcal ?? 0} kcal</Text>
                    <Text style={styles.rowProtein}>P {opt.nutrition?.protein_g ?? 0}g</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Text style={styles.nutriNote}>
            ⓘ Nutrition values are per-serving estimates from standard Tamil home recipes (IFCT reference).
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn} disabled={busy}>
            <Text style={styles.cancelText}>{t("addsheet.close")}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: spacing.m,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.m },
  title: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.textPrimary },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: spacing.m },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSoft,
    marginBottom: spacing.m,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 74,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: radius.m,
    marginBottom: 4,
  },
  rowTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  rowTa: { fontFamily: fonts.bodyTa, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  rowGood: { fontSize: 11, color: colors.bananaLeaf, fontWeight: "700", marginTop: 2 },
  rowMuted: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowMacros: { alignItems: "flex-end" },
  rowProtein: { fontSize: 13, color: colors.chili, fontWeight: "800", marginTop: 2 },
  rowKcal: { fontFamily: fonts.headingEn, fontSize: 14, color: colors.textPrimary, marginLeft: spacing.s },
  ownBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.turmeric,
  },
  ownBtnText: { color: colors.riceWhite, fontWeight: "800", fontSize: 12.5 },
  nutriNote: { fontSize: 11.5, color: colors.textMuted, textAlign: "center", marginTop: 8, lineHeight: 16 },
  cancelBtn: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.s },
  cancelText: { color: colors.textMuted, fontWeight: "700", fontSize: 15 },
});
