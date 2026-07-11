import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/app-header";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { readCache, writeCache } from "@/src/hooks/use-cached-query";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import { GROUP_ORDER, groupFor, iconFor } from "@/src/ingredient-icons";
import { FoodAvatar } from "@/src/food-visual";
import { PressableScale } from "@/src/components/pressable-scale";
import type { PantryItem } from "@/src/types";

const FRESHNESS_COLOR: Record<string, string> = {
  green: colors.bananaLeaf,
  yellow: colors.turmeric,
  red: colors.chili,
  unknown: colors.textMuted,
};

const FRESHNESS_LABEL: Record<string, string> = {
  green: "Fresh",
  yellow: "Use soon",
  red: "Expires ≤1d",
  unknown: "No date",
};

type FilterKey = "all" | "expiring" | "pantry" | "fridge";

export default function PantryScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [actionItem, setActionItem] = useState<PantryItem | null>(null);
  const [qtyEdit, setQtyEdit] = useState("");
  const [busy, setBusy] = useState(false);
  const [waste, setWaste] = useState<{ total_estimated_inr: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [pantry, wasteResp] = await Promise.all([
        api.get<PantryItem[]>("/api/pantry"),
        api.get<{ total_estimated_inr: number }>("/api/waste-log"),
      ]);
      setItems(pantry);
      setWaste(wasteResp);
      writeCache("pantry", pantry); // R1: shared key with Home's pantry cache
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // R1: seed from cache for an instant paint, then refresh in background.
      readCache<PantryItem[]>("pantry").then((c) => {
        if (c) {
          setItems(c);
          setLoading(false);
        }
      });
      load();
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "pantry") return items.filter((i) => i.storage === "pantry");
    if (filter === "fridge") return items.filter((i) => i.storage === "fridge");
    // expiring: red + yellow
    return items.filter((i) => i.freshness === "red" || i.freshness === "yellow");
  }, [items, filter]);

  const grouped = useMemo(() => {
    const g: Record<string, PantryItem[]> = {};
    for (const it of filtered) {
      const key = groupFor(it.category);
      (g[key] ||= []).push(it);
    }
    return GROUP_ORDER.map((k) => [k, g[k]] as const).filter(([, arr]) => arr && arr.length > 0);
  }, [filtered]);

  const expiringCount = useMemo(
    () => items.filter((i) => i.freshness === "red" || i.freshness === "yellow").length,
    [items],
  );

  const setQtyDirect = async (item: PantryItem, newQty: number) => {
    setBusy(true);
    try {
      if (newQty <= 0) {
        await api.del(`/api/pantry/${item.id}`);
        setActionItem(null);
      } else {
        await api.patch(`/api/pantry/${item.id}`, { qty: newQty });
        setActionItem({ ...item, qty: newQty });
        setQtyEdit(String(newQty));
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onUsed = async (item: PantryItem) => {
    setBusy(true);
    try {
      const newQty = Math.max(0, item.qty - 1);
      if (newQty <= 0) {
        await api.del(`/api/pantry/${item.id}`);
      } else {
        await api.patch(`/api/pantry/${item.id}`, { qty: newQty });
      }
      await load();
    } finally {
      setBusy(false);
      setActionItem(null);
    }
  };

  const onDiscard = async (item: PantryItem) => {
    setBusy(true);
    try {
      await api.post(`/api/pantry/${item.id}/discard`, { reason: "manual" });
      await load();
    } finally {
      setBusy(false);
      setActionItem(null);
    }
  };

  const onDelete = async (item: PantryItem) => {
    setBusy(true);
    try {
      await api.del(`/api/pantry/${item.id}`);
      await load();
    } finally {
      setBusy(false);
      setActionItem(null);
    }
  };

  const FILTERS: { key: FilterKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "all", label: `All ${items.length}`, icon: "apps" },
    { key: "expiring", label: `Expiring ${expiringCount}`, icon: "alarm" },
    { key: "pantry", label: "Pantry", icon: "cube-outline" },
    { key: "fridge", label: "Fridge", icon: "snow-outline" },
  ];

  return (
    <View style={styles.screen} testID="pantry-screen">
      <AppHeader
        title={t("pantry.title")}
        subtitleTa={t("pantry.subtitle")}
        right={
          <TouchableOpacity
            testID="pantry-add-btn"
            onPress={() => router.push("/pantry/add")}
            style={styles.addBtn}
            hitSlop={10}
          >
            <Ionicons name="add" size={22} color={colors.bananaLeafDark} />
          </TouchableOpacity>
        }
      />

      {/* Sticky chip row */}
      <View style={styles.chipRowWrap} testID="filter-chips">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRowInner}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                testID={`filter-${f.key}`}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Ionicons
                  name={f.icon}
                  size={14}
                  color={active ? colors.riceWhite : colors.textSecondary}
                />
                <Text style={[styles.chipText, active && { color: colors.riceWhite }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.bananaLeaf} />
        </View>
      ) : filtered.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.bananaLeaf} />}
        >
          <View style={styles.emptyIcon}>
            <Ionicons name="cube-outline" size={40} color={colors.bananaLeaf} />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === "all" ? "Your pantry is empty" : "Nothing here"}
          </Text>
          <Text style={styles.emptyTitleTa}>உங்கள் சாமான் அறை காலியாக உள்ளது</Text>
          <Text style={styles.emptyBody}>
            {filter === "all"
              ? "Tap + to add ingredients with quantity and purchase date."
              : "Try changing the filter or adding new items."}
          </Text>
          {filter === "all" && (
            <TouchableOpacity
              testID="pantry-empty-add"
              style={styles.emptyBtn}
              onPress={() => router.push("/pantry/add")}
            >
              <Text style={styles.emptyBtnText}>Add first item</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={([k]) => k}
          contentContainerStyle={{
            paddingHorizontal: spacing.m,
            paddingBottom: insets.bottom + 100,
            paddingTop: spacing.s,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.bananaLeaf} />}
          ListHeaderComponent={
            <>
              {waste && waste.total_estimated_inr > 0 ? (
                <View style={styles.wasteBanner} testID="waste-banner">
                  <Ionicons name="trash-bin-outline" size={16} color={colors.chili} />
                  <Text style={styles.wasteBannerText}>
                    ₹{waste.total_estimated_inr.toFixed(0)} in food waste logged. Plan meals to save more.
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity
                testID="pantry-what-to-cook"
                style={styles.cookChainBtn}
                onPress={() => router.push("/cook")}
                activeOpacity={0.85}
              >
                <Ionicons name="restaurant" size={20} color={colors.riceWhite} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cookChainTitle}>What can I cook?</Text>
                  <Text style={styles.cookChainSub}>Dishes you can make from your pantry now</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.riceWhite} />
              </TouchableOpacity>
            </>
          }
          renderItem={({ item: [groupName, rows] }) => (
            <View style={styles.group}>
              <Text style={styles.groupTitle} testID={`group-${groupName}`}>
                {groupName}
              </Text>
              {rows.map((row) => (
                <PantryRow
                  key={row.id}
                  item={row}
                  onPress={() => setActionItem(row)}
                />
              ))}
            </View>
          )}
        />
      )}

      <Modal
        visible={actionItem != null}
        animationType="fade"
        transparent
        onRequestClose={() => setActionItem(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActionItem(null)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ width: "100%" }}
          >
          <Pressable
            style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.m }]}
            onPress={(e) => e.stopPropagation()}
            testID="pantry-action-sheet"
          >
            {actionItem && (
              <>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <MaterialCommunityIcons
                    name={iconFor(actionItem.ingredient_id, actionItem.category)}
                    size={30}
                    color={colors.bananaLeaf}
                  />
                  <View style={{ flex: 1, marginLeft: spacing.m }}>
                    <Text style={styles.modalTitle}>{actionItem.ingredient_name}</Text>
                    <Text style={styles.modalSub}>
                      {actionItem.qty} {actionItem.unit} · {actionItem.storage}
                    </Text>
                  </View>
                </View>

                {/* Quick quantity control — user feedback: direct entry + steppers */}
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    testID="qty-minus"
                    style={styles.qtyBtn}
                    disabled={busy}
                    onPress={() => setQtyDirect(actionItem, Math.max(0, actionItem.qty - 1))}
                  >
                    <Ionicons name="remove" size={22} color={colors.chili} />
                  </TouchableOpacity>
                  <View style={styles.qtyInputWrap}>
                    <TextInput
                      testID="qty-input"
                      style={styles.qtyInput}
                      keyboardType="numeric"
                      defaultValue={String(actionItem.qty)}
                      onChangeText={(v) => setQtyEdit(v.replace(/[^0-9.]/g, ""))}
                      onSubmitEditing={() => {
                        const n = parseFloat(qtyEdit);
                        if (!isNaN(n)) setQtyDirect(actionItem, n);
                      }}
                      returnKeyType="done"
                    />
                    <Text style={styles.qtyUnit}>{actionItem.unit}</Text>
                  </View>
                  <TouchableOpacity
                    testID="qty-plus"
                    style={styles.qtyBtn}
                    disabled={busy}
                    onPress={() => setQtyDirect(actionItem, actionItem.qty + 1)}
                  >
                    <Ionicons name="add" size={22} color={colors.bananaLeaf} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="qty-set"
                    style={styles.qtySetBtn}
                    disabled={busy}
                    onPress={() => {
                      const n = parseFloat(qtyEdit);
                      if (!isNaN(n)) setQtyDirect(actionItem, n);
                    }}
                  >
                    <Text style={styles.qtySetText}>Set</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ display: "none" }}>
                  <View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => onUsed(actionItem)}
                  disabled={busy}
                  testID="action-used"
                >
                  <Ionicons name="checkmark-done-outline" size={20} color={colors.bananaLeaf} />
                  <View style={{ flex: 1, marginLeft: spacing.m }}>
                    <Text style={styles.actionTitle}>Used one</Text>
                    <Text style={styles.actionHint}>
                      Reduce qty by 1 · removes at 0
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => onDiscard(actionItem)}
                  disabled={busy}
                  testID="action-discard"
                >
                  <Ionicons name="trash-outline" size={20} color={colors.chili} />
                  <View style={{ flex: 1, marginLeft: spacing.m }}>
                    <Text style={styles.actionTitle}>Discard</Text>
                    <Text style={styles.actionHint}>
                      Logs to waste (₹ estimate if known)
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => onDelete(actionItem)}
                  disabled={busy}
                  testID="action-delete"
                >
                  <Ionicons name="close-circle-outline" size={20} color={colors.textSecondary} />
                  <View style={{ flex: 1, marginLeft: spacing.m }}>
                    <Text style={styles.actionTitle}>Remove (no log)</Text>
                    <Text style={styles.actionHint}>Delete this entry silently</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setActionItem(null)}
                  disabled={busy}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

function PantryRow({ item, onPress }: { item: PantryItem; onPress: () => void }) {
  const dot = FRESHNESS_COLOR[item.freshness];
  const label = FRESHNESS_LABEL[item.freshness];
  const daysText =
    item.days_left == null
      ? "—"
      : item.days_left <= 0
        ? "expired"
        : `${item.days_left}d left`;
  return (
    <PressableScale
      style={styles.row}
      onPress={onPress}
      testID={`pantry-row-${item.id}`}
    >
      <FoodAvatar
        kind="ingredient"
        id={item.ingredient_id}
        category={item.category}
        size={46}
        style={{ marginRight: spacing.m }}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.ingredient_name}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {item.qty} {item.unit} · {item.storage}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <View style={styles.freshWrap}>
          <View style={[styles.freshDot, { backgroundColor: dot }]} />
          <Text style={[styles.freshText, { color: dot }]}>{label}</Text>
        </View>
        <Text style={styles.daysText}>{daysText}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.riceWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  chipRowWrap: {
    height: 56,
    justifyContent: "center",
    backgroundColor: colors.riceWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chipRowInner: {
    paddingHorizontal: spacing.m,
    alignItems: "center",
    gap: 8,
  },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipActive: {
    backgroundColor: colors.bananaLeaf,
    borderColor: colors.bananaLeaf,
  },
  chipText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { padding: spacing.l, alignItems: "center", flexGrow: 1, justifyContent: "center" },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}14`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.l,
  },
  emptyTitle: { fontFamily: fonts.headingEn, fontSize: 22, color: colors.textPrimary },
  emptyTitleTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyBody: {
    marginTop: spacing.m,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: spacing.l,
    backgroundColor: colors.bananaLeaf,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.m,
  },
  emptyBtnText: { color: colors.textOnPrimary, fontWeight: "700" },
  cookChainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.bananaLeaf,
    borderRadius: radius.l,
    padding: 14,
    marginBottom: spacing.m,
  },
  cookChainTitle: { fontFamily: fonts.headingEn, fontSize: 16, color: colors.riceWhite },
  cookChainSub: { fontSize: 12, color: "rgba(251,248,239,0.85)", marginTop: 1 },
  wasteBanner: {
    backgroundColor: "#FBECE4",
    padding: spacing.m,
    borderRadius: radius.m,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.m,
  },
  wasteBannerText: { color: colors.chili, flex: 1, fontSize: 12 },
  group: { marginBottom: spacing.l },
  groupTitle: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.textSecondary,
    fontWeight: "700",
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.m,
    borderRadius: radius.m,
    marginBottom: 8,
    ...shadow.card,
  },
  rowIconWrap: {
    width: 46,
    height: 46,
    borderRadius: radius.m,
    backgroundColor: `${colors.bananaLeaf}14`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.m,
  },
  rowTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  rowEmoji: { fontSize: 24 },
  rowSub: { fontSize: 15, color: colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: "flex-end" },
  freshWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  freshDot: { width: 8, height: 8, borderRadius: 4 },
  freshText: { fontSize: 14, fontWeight: "700" },
  daysText: { fontSize: 14.5, color: colors.textSecondary, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
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
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.m,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.m,
    marginBottom: spacing.m,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  modalSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.m,
    marginBottom: spacing.s,
  },
  qtyBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  qtyInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.m,
    minHeight: 52,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  qtyInput: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.textPrimary, textAlign: "center", padding: 0 },
  qtyUnit: { fontSize: 14, fontWeight: "700", color: colors.textMuted, marginLeft: 6 },
  qtySetBtn: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.bananaLeaf,
    alignItems: "center",
    justifyContent: "center",
  },
  qtySetText: { color: colors.riceWhite, fontWeight: "800", fontSize: 15 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: spacing.m,
    borderRadius: radius.m,
  },
  actionTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  actionHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cancelBtn: {
    marginTop: spacing.s,
    paddingVertical: 14,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
  },
  cancelText: { color: colors.textSecondary, fontWeight: "600" },
});
