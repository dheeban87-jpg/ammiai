// R3 — "Scan my veggies": one component drives pick → scan → confirm → write.
// Reused by the Pantry tab and the final onboarding step. All copy via t().
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { FoodAvatar } from "@/src/food-visual";
import { useI18n } from "@/src/i18n";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import type { Ingredient } from "@/src/types";
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
  presetItems,
  onPresetHandled,
}: {
  onAdded?: (added: number) => void;
  /** custom trigger; falls back to the default pill button */
  render?: (open: () => void) => React.ReactNode;
  /** Items scanned elsewhere (e.g. a bill on the Grocery tab) — setting this
   *  jumps straight to the same confirm sheet instead of taking a new photo. */
  presetItems?: ScanItem[] | null;
  onPresetHandled?: () => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Ingredient[]>([]);
  const [query, setQuery] = useState("");

  // Lazily load the ingredient catalog for the "add a missed item" search.
  useEffect(() => {
    if (phase === "confirm" && catalog.length === 0) {
      api.get<Ingredient[]>("/api/ingredients").then(setCatalog).catch(() => {});
    }
  }, [phase, catalog.length]);

  useEffect(() => {
    if (presetItems && presetItems.length > 0) {
      setRows(presetItems.map((i) => ({ ...i, include: true })));
      setPhase("confirm");
    }
  }, [presetItems]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const already = new Set(rows.map((r) => r.ingredient_id));
    return catalog
      .filter((c) => c.category !== "staple" && c.category !== "spice")
      .filter((c) => !already.has(c.ingredient_id) && c.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, catalog, rows]);

  const addRow = (ing: Ingredient) => {
    setRows((prev) => [
      ...prev,
      {
        ingredient_id: ing.ingredient_id,
        name: ing.name,
        category: ing.category,
        qty_class: "medium",
        qty: 250,
        unit: "g",
        include: true,
      },
    ]);
    setQuery("");
  };

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

  const closeConfirm = () => {
    setPhase("idle");
    setRows([]);
    setQuery("");
    onPresetHandled?.();
  };

  const confirm = async () => {
    const chosen = rows.filter((r) => r.include);
    setBusy(true);
    const n = await addScannedItems(chosen);
    setBusy(false);
    closeConfirm();
    onAdded?.(n);
  };

  const includedCount = rows.filter((r) => r.include).length;
  const includedTotal = rows
    .filter((r) => r.include && typeof r.price === "number")
    .reduce((sum, r) => sum + (r.price as number), 0);

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
      <Modal visible={phase === "confirm"} transparent animationType="slide" onRequestClose={closeConfirm}>
        <Pressable style={styles.backdrop} onPress={closeConfirm}>
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
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.rowName, !r.include && { color: colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {r.name}
                        </Text>
                        {/* What the bill charged — shown so the user can check
                            the read against the receipt before adding. */}
                        {typeof r.price === "number" ? (
                          <Text style={styles.rowPrice}>₹{Math.round(r.price)}</Text>
                        ) : null}
                      </View>
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

            {/* Add a missed item — one-tap fix for wrong/omitted matches */}
            <View style={styles.addMissed}>
              <Text style={styles.addMissedLabel}>{t("scan.add_missed")}</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("scan.search_ph")}
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                testID="scan-add-search"
              />
              {results.map((c) => (
                <TouchableOpacity
                  key={c.ingredient_id}
                  style={styles.resultRow}
                  onPress={() => addRow(c)}
                  testID={`scan-add-${c.ingredient_id}`}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.bananaLeaf} />
                  <Text style={styles.resultName}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.addBtn, (includedCount === 0 || busy) && { opacity: 0.5 }]}
              onPress={confirm}
              disabled={includedCount === 0 || busy}
              testID="scan-confirm-add"
            >
              {busy ? (
                <ActivityIndicator color={colors.riceWhite} />
              ) : (
                <Text style={styles.addBtnText}>
                  {t("scan.add_n", { n: includedCount })}
                  {includedTotal > 0 ? ` · ₹${Math.round(includedTotal)}` : ""}
                </Text>
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
  rowPrice: { fontSize: 12.5, fontWeight: "700", color: colors.bananaLeaf, marginTop: 1 },
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
  addMissed: {
    marginTop: spacing.m,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.m,
  },
  addMissedLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.riceWhite,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultName: { fontSize: 15, color: colors.textPrimary },
  addBtn: {
    marginTop: spacing.m,
    backgroundColor: colors.bananaLeaf,
    borderRadius: radius.m,
    paddingVertical: 14,
    alignItems: "center",
  },
  addBtnText: { color: colors.riceWhite, fontWeight: "800", fontSize: 15 },
});
