// R3 — "Scan my veggies": one component drives pick → scan → confirm → write.
// Reused by the Pantry tab and the final onboarding step. All copy via t().
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { FoodAvatar } from "@/src/food-visual";
import { useI18n } from "@/src/i18n";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import {
  addScannedItems,
  captureAndScan,
  type ScanItem,
  type ScanSource,
} from "@/src/pantry-scan";

type Row = ScanItem & { include: boolean };
type Phase = "idle" | "choose" | "scanning" | "confirm";

export function ScanVeggies({
  onAdded,
  render,
}: {
  onAdded?: (added: number) => void;
  /** custom trigger; falls back to the default pill button */
  render?: (open: () => void) => React.ReactNode;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setError(null);
    setPhase("choose");
  };

  const runScan = async (source: ScanSource) => {
    setPhase("scanning");
    setError(null);
    try {
      const res = await captureAndScan(source);
      if (res === null) {
        setPhase("idle"); // user cancelled the picker
        return;
      }
      setRows(res.items.map((i) => ({ ...i, include: true })));
      setPhase("confirm");
    } catch (e: any) {
      setError(
        e?.perm === "camera"
          ? t("scan.perm_camera")
          : e?.perm === "gallery"
            ? t("scan.perm_gallery")
            : t("scan.error"),
      );
      setPhase("idle");
    }
  };

  const step = (id: string, dir: 1 | -1) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.ingredient_id !== id) return r;
        const inc = r.unit === "pc" ? 1 : 50;
        return { ...r, qty: Math.max(inc, r.qty + dir * inc) };
      }),
    );

  const confirm = async () => {
    const chosen = rows.filter((r) => r.include);
    setBusy(true);
    const n = await addScannedItems(chosen);
    setBusy(false);
    setPhase("idle");
    setRows([]);
    onAdded?.(n);
  };

  const includedCount = rows.filter((r) => r.include).length;

  return (
    <>
      {render ? (
        render(open)
      ) : (
        <TouchableOpacity style={styles.pill} onPress={open} testID="scan-veggies-btn" activeOpacity={0.85}>
          <Ionicons name="camera" size={18} color={colors.riceWhite} />
          <Text style={styles.pillText}>{t("scan.button")}</Text>
        </TouchableOpacity>
      )}

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.chili} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Source chooser */}
      <Modal visible={phase === "choose"} transparent animationType="fade" onRequestClose={() => setPhase("idle")}>
        <Pressable style={styles.backdrop} onPress={() => setPhase("idle")}>
          <Pressable style={styles.chooseSheet} onPress={() => {}}>
            <View style={styles.handle} />
            <TouchableOpacity style={styles.chooseBtn} onPress={() => runScan("camera")} testID="scan-camera">
              <Ionicons name="camera-outline" size={22} color={colors.bananaLeaf} />
              <Text style={styles.chooseText}>{t("scan.camera")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chooseBtn} onPress={() => runScan("gallery")} testID="scan-gallery">
              <Ionicons name="images-outline" size={22} color={colors.bananaLeaf} />
              <Text style={styles.chooseText}>{t("scan.gallery")}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Scanning overlay */}
      <Modal visible={phase === "scanning"} transparent animationType="fade">
        <View style={styles.scanOverlay}>
          <ActivityIndicator size="large" color={colors.riceWhite} />
          <Text style={styles.scanText}>{t("scan.scanning")}</Text>
        </View>
      </Modal>

      {/* Confirmation sheet */}
      <Modal visible={phase === "confirm"} transparent animationType="slide" onRequestClose={() => setPhase("idle")}>
        <Pressable style={styles.backdrop} onPress={() => setPhase("idle")}>
          <Pressable style={styles.confirmSheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.confirmTitle}>{t("scan.confirm_title")}</Text>
            <Text style={styles.confirmSub}>{t("scan.confirm_sub")}</Text>

            {rows.length === 0 ? (
              <Text style={styles.none}>{t("scan.none")}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                {rows.map((r) => (
                  <View key={r.ingredient_id} style={styles.row}>
                    <TouchableOpacity
                      style={styles.rowLeft}
                      onPress={() =>
                        setRows((prev) =>
                          prev.map((x) => (x.ingredient_id === r.ingredient_id ? { ...x, include: !x.include } : x)),
                        )
                      }
                      testID={`scan-row-${r.ingredient_id}`}
                    >
                      <Ionicons
                        name={r.include ? "checkbox" : "square-outline"}
                        size={22}
                        color={r.include ? colors.bananaLeaf : colors.textMuted}
                      />
                      <FoodAvatar kind="ingredient" id={r.ingredient_id} category={r.category} size={34} style={{ marginHorizontal: 8 }} />
                      <Text style={[styles.rowName, !r.include && { color: colors.textMuted }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.stepper}>
                      <TouchableOpacity onPress={() => step(r.ingredient_id, -1)} style={styles.stepBtn} hitSlop={6}>
                        <Ionicons name="remove" size={15} color={colors.textPrimary} />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>
                        {r.qty}
                        {r.unit}
                      </Text>
                      <TouchableOpacity onPress={() => step(r.ingredient_id, 1)} style={styles.stepBtn} hitSlop={6}>
                        <Ionicons name="add" size={15} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.addBtn, (includedCount === 0 || busy) && { opacity: 0.5 }]}
              onPress={confirm}
              disabled={includedCount === 0 || busy}
              testID="scan-confirm-add"
            >
              {busy ? (
                <ActivityIndicator color={colors.riceWhite} />
              ) : (
                <Text style={styles.addBtnText}>{t("scan.add_n", { n: includedCount })}</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.bananaLeaf,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: spacing.l,
    ...shadow.card,
  },
  pillText: { color: colors.riceWhite, fontWeight: "800", fontSize: 14.5 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.s },
  errorText: { color: colors.chili, fontSize: 12.5, flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.m,
  },
  chooseSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.l,
    paddingBottom: spacing.xl,
    gap: spacing.s,
  },
  chooseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.m,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSoft,
  },
  chooseText: { fontSize: 15.5, fontWeight: "700", color: colors.textPrimary },
  scanOverlay: {
    flex: 1,
    backgroundColor: "rgba(20,61,34,0.86)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.m,
    padding: spacing.xl,
  },
  scanText: { color: colors.riceWhite, fontFamily: fonts.headingEn, fontSize: 16, textAlign: "center" },
  confirmSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.l,
    paddingBottom: spacing.xl,
  },
  confirmTitle: { fontFamily: fonts.headingEn, fontSize: 18, color: colors.textPrimary },
  confirmSub: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.m },
  none: { fontSize: 14, color: colors.textSecondary, textAlign: "center", paddingVertical: spacing.l },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary, flex: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { fontSize: 13.5, fontWeight: "700", color: colors.textPrimary, minWidth: 48, textAlign: "center" },
  addBtn: {
    marginTop: spacing.m,
    backgroundColor: colors.bananaLeaf,
    borderRadius: radius.m,
    paddingVertical: 14,
    alignItems: "center",
  },
  addBtnText: { color: colors.riceWhite, fontWeight: "800", fontSize: 15 },
});
