import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radius, spacing } from "@/src/theme";
import type { MealItem } from "@/src/components/meal-card";

export type Violation = {
  rule: string;
  message: string;
  suggested_fix: string;
};

type Props = {
  visible: boolean;
  target: MealItem | null;
  options: MealItem[] | null;
  onClose: () => void;
  onPick: (opt: MealItem) => void;
  busy?: boolean;
  violations?: Violation[] | null;
};

export function SwapSheet({
  visible,
  target,
  options,
  onClose,
  onPick,
  busy,
  violations,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.m }]}
          onPress={(e) => e.stopPropagation()}
          testID="swap-sheet"
        >
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Swap this dish</Text>
          {target ? (
            <Text style={styles.modalSub}>
              Instead of {target.name_en} · same category
            </Text>
          ) : null}

          {violations && violations.length > 0 ? (
            <View style={styles.violationsWrap} testID="swap-violations">
              {violations.map((v) => (
                <View key={v.rule} style={styles.violationRow}>
                  <Ionicons name="warning" size={16} color={colors.turmeric} />
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={styles.violationTitle}>{v.message}</Text>
                    <Text style={styles.violationFix}>{v.suggested_fix}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {options === null ? (
            <View style={{ padding: spacing.l, alignItems: "center" }}>
              <ActivityIndicator color={colors.bananaLeaf} />
            </View>
          ) : options.length === 0 ? (
            <View style={styles.emptySwap}>
              <Text style={styles.emptySwapText}>
                No valid alternates. All other dishes in this category would break a rule.
              </Text>
            </View>
          ) : (
            options.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={styles.swapOption}
                onPress={() => onPick(opt)}
                disabled={busy}
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
                        <Text style={[styles.tinyChipText, { color: colors.bananaLeaf }]}>0 shopping</Text>
                      </View>
                    ) : (
                      <Text style={styles.pantryHint}>
                        {Math.round((opt._score?.pantry_ratio ?? 0) * 100)}% in pantry
                      </Text>
                    )}
                    {opt._score?.expiring_hits?.length ? (
                      <View style={[styles.tinyChip, { backgroundColor: `${colors.turmeric}22` }]}>
                        <Text style={[styles.tinyChipText, { color: colors.turmeric }]}>Uses expiring</Text>
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
            onPress={onClose}
            style={styles.cancelBtn}
            disabled={busy}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  modalTitle: { fontFamily: fonts.headingEn, fontSize: 20, color: colors.textPrimary },
  modalSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    marginBottom: spacing.m,
  },
  violationsWrap: {
    backgroundColor: "#FBEED0",
    borderRadius: radius.m,
    padding: spacing.s,
    marginBottom: spacing.m,
    gap: 6,
  },
  violationRow: { flexDirection: "row", alignItems: "flex-start" },
  violationTitle: { color: colors.turmeric, fontSize: 12, fontWeight: "700" },
  violationFix: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
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
});
