import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/app-header";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import { FoodAvatar } from "@/src/food-visual";

type GroceryItem = {
  ingredient_id: string;
  name: string;
  category: string;
  qty: number;
  unit: string;
  estimated_inr: number | null;
  need_base: number;
  have_base: number;
  base_unit: string;
};

type GroceryGroup = {
  category: string;
  items: GroceryItem[];
};

type GroceryList = {
  start_date: string;
  end_date: string;
  household_size: number;
  days_covered: number;
  groups: GroceryGroup[];
  total_items: number;
  total_estimated_inr: number;
};

type OrderVendor = "blinkit" | "instamart" | "zepto";

const VENDOR_META: Record<
  OrderVendor,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap; searchUrl: (q: string) => string }
> = {
  blinkit: {
    label: "Blinkit",
    color: "#F8CB46",
    icon: "flash",
    searchUrl: (q) => `https://blinkit.com/s/?q=${encodeURIComponent(q)}`,
  },
  instamart: {
    label: "Instamart",
    color: "#F15A29",
    icon: "bicycle",
    searchUrl: (q) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(q)}`,
  },
  zepto: {
    label: "Zepto",
    color: "#7A20CB",
    icon: "rocket",
    searchUrl: (q) => `https://www.zepto.co.in/search?query=${encodeURIComponent(q)}`,
  },
};

export default function GroceryScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<7 | 14>(7);
  const [data, setData] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [addItemVisible, setAddItemVisible] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<
    { ingredient_id: string; name: string; category: string }[] | null
  >(null);
  const [orderModal, setOrderModal] = useState<OrderVendor | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<GroceryList>(`/api/grocery/list?days=${days}`);
      setData(d);
      // Default: every item pre-selected — the whole list is "what you need".
      // Unchecking = "I'll skip this one" / already sorted elsewhere.
      setChecked(new Set(d.groups.flatMap((g) => g.items.map((it) => it.ingredient_id))));
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load list");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const selected = useMemo(() => {
    if (!data) return [] as GroceryItem[];
    return data.groups.flatMap((g) => g.items).filter((it) => checked.has(it.ingredient_id));
  }, [data, checked]);

  const selectedCost = useMemo(
    () => selected.reduce((sum, it) => sum + (it.estimated_inr ?? 0), 0),
    [selected],
  );

  const allIds = useMemo(
    () => (data ? data.groups.flatMap((g) => g.items.map((it) => it.ingredient_id)) : []),
    [data],
  );
  const selectAll = () => setChecked(new Set(allIds));
  const clearAll = () => setChecked(new Set());

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeItemPermanently = async (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await api.post("/api/grocery/remove-item", { ingredient_id: id });
      await load();
      setToast("Removed from list");
      setTimeout(() => setToast(null), 2000);
    } catch {
      /* noop */
    }
  };

  const searchAddItem = async (q: string) => {
    setAddQuery(q);
    try {
      const r = await api.get<{ items: { ingredient_id: string; name: string; category: string }[] }>(
        `/api/grocery/search-ingredients?q=${encodeURIComponent(q)}`,
      );
      setAddResults(r.items);
    } catch {
      setAddResults([]);
    }
  };

  const addManualItem = async (item: { ingredient_id: string; name: string }) => {
    try {
      await api.post("/api/grocery/add-item", { ingredient_id: item.ingredient_id, qty: 100, unit: "g" });
      setAddItemVisible(false);
      setAddQuery("");
      setAddResults(null);
      await load();
      setChecked((prev) => new Set(prev).add(item.ingredient_id));
      setToast(`${item.name} added to list`);
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast("Couldn't add item");
    }
  };

  const listAsText = useMemo(() => {
    if (!data) return "";
    const lines: string[] = [
      `🛒 AmmiAI Shopping List`,
      `${data.days_covered} days · ${data.household_size} people`,
      `${selected.length} items · ₹${Math.round(selectedCost)} est.`,
      "",
    ];
    for (const g of data.groups) {
      const items = g.items.filter((it) => checked.has(it.ingredient_id));
      if (!items.length) continue;
      lines.push(`— ${g.category} —`);
      for (const it of items) {
        lines.push(`• ${it.name} — ${it.qty} ${it.unit}`);
      }
      lines.push("");
    }
    lines.push("Made with AmmiAI 🌿");
    return lines.join("\n");
  }, [data, selected, checked, selectedCost]);

  const copyList = async () => {
    try {
      await Clipboard.setStringAsync(listAsText);
      setToast("List copied to clipboard");
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast("Couldn't copy");
    }
  };

  const shareWhatsapp = async () => {
    const encoded = encodeURIComponent(listAsText);
    const url = `https://wa.me/?text=${encoded}`;
    if (Platform.OS === "web") {
      window.open(url, "_blank");
      return;
    }
    // Prefer wa.me deep-link (works with WhatsApp on device)
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else if (await Sharing.isAvailableAsync()) {
      // Native fallback: copy to clipboard + native share
      await Clipboard.setStringAsync(listAsText);
      setToast("List copied — paste in WhatsApp");
      setTimeout(() => setToast(null), 3000);
    }
  };

  const openOrder = (vendor: OrderVendor) => {
    if (!data || selected.length === 0) {
      setToast("Select at least one item first");
      setTimeout(() => setToast(null), 2200);
      return;
    }
    setOrderModal(vendor);
  };

  const openVendorItem = (vendor: OrderVendor, name: string) => {
    const url = VENDOR_META[vendor].searchUrl(name);
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      Linking.openURL(url);
    }
  };

  const openOrderAll = (vendor: OrderVendor) => {
    for (const it of selected) {
      openVendorItem(vendor, it.name);
    }
    setOrderModal(null);
    // Prompt "Order placed?"
    setConfirmVisible(true);
  };

  const confirmOrderPlaced = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await api.post("/api/grocery/order-placed", {
        items: selected.map((it) => ({
          ingredient_id: it.ingredient_id,
          qty: it.qty,
          unit: it.unit,
        })),
      });
      setConfirmVisible(false);
      setToast(`${selected.length} items added to pantry`);
      setTimeout(() => setToast(null), 3000);
      await load(); // list will now be empty
    } finally {
      setBusy(false);
    }
  };

  const empty = !loading && data && data.total_items === 0;

  return (
    <View style={styles.screen} testID="grocery-screen">
      <AppHeader
        title={t("grocery.title")}
        subtitleTa={t("grocery.subtitle")}
        right={
          data && data.total_items > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>
                ₹{Math.round(selectedCost)}
              </Text>
            </View>
          ) : null
        }
      />

      {/* Range toggle */}
      <View style={styles.segmentWrap}>
        <View style={styles.segment}>
          {([7, 14] as const).map((d) => (
            <TouchableOpacity
              key={d}
              testID={`range-${d}`}
              style={[styles.segBtn, days === d && styles.segBtnActive]}
              onPress={() => setDays(d)}
            >
              <Text style={[styles.segText, days === d && { color: colors.riceWhite }]}>
                Next {d} days
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.bananaLeaf} />
        </View>
      ) : empty ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.bananaLeaf} />}
        >
          <View style={styles.emptyIcon}>
            <Ionicons name="checkmark-done" size={40} color={colors.bananaLeaf} />
          </View>
          <Text style={styles.emptyTitle}>You&apos;re fully stocked</Text>
          <Text style={styles.emptyTitleTa}>உங்கள் சாமான் அறை நிறைந்துள்ளது</Text>
          <Text style={styles.emptyBody}>
            {data && data.days_covered === 0
              ? "No plans found in this range. Plan meals in the Calendar first."
              : "Your pantry already covers every ingredient for the planned meals."}
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 220 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.bananaLeaf} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summary} testID="grocery-summary">
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{selected.length}</Text>
              <Text style={styles.summaryLabel}>selected</Text>
            </View>
            <View style={styles.summarySep} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{data?.days_covered ?? 0}</Text>
              <Text style={styles.summaryLabel}>days</Text>
            </View>
            <View style={styles.summarySep} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{data?.household_size ?? 1}</Text>
              <Text style={styles.summaryLabel}>people</Text>
            </View>
            <View style={styles.summarySep} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.chili }]}>
                ₹{Math.round(selectedCost)}
              </Text>
              <Text style={styles.summaryLabel}>est.</Text>
            </View>
          </View>

          <View style={styles.toolRow}>
            <TouchableOpacity style={styles.toolBtn} onPress={selectAll} testID="grocery-select-all" hitSlop={8}>
              <Ionicons name="checkmark-done-outline" size={16} color={colors.bananaLeaf} />
              <Text style={styles.toolBtnText}>Select all</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={clearAll} testID="grocery-clear-all" hitSlop={8}>
              <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.toolBtnText, { color: colors.textMuted }]}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtn, styles.toolBtnAdd]}
              onPress={() => setAddItemVisible(true)}
              testID="grocery-add-item"
              hitSlop={8}
            >
              <Ionicons name="add" size={18} color={colors.riceWhite} />
              <Text style={[styles.toolBtnText, { color: colors.riceWhite }]}>Add item</Text>
            </TouchableOpacity>
          </View>

          {data?.groups.map((g) => (
            <View key={g.category} style={styles.groupCard} testID={`group-${g.category}`}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{g.category}</Text>
                <Text style={styles.groupCount}>
                  {g.items.filter((it) => !checked.has(it.ingredient_id)).length}/{g.items.length}
                </Text>
              </View>
              {g.items.map((it) => {
                const on = checked.has(it.ingredient_id);
                return (
                  <View key={it.ingredient_id} style={styles.rowWrap}>
                    <TouchableOpacity
                      testID={`grocery-row-${it.ingredient_id}`}
                      style={styles.row}
                      onPress={() => toggle(it.ingredient_id)}
                      activeOpacity={0.7}
                      hitSlop={4}
                    >
                      <View style={[styles.checkbox, on && styles.checkboxOn]}>
                        {on ? <Ionicons name="checkmark" size={18} color={colors.riceWhite} /> : null}
                      </View>
                      <FoodAvatar
                        kind="ingredient"
                        id={it.ingredient_id}
                        category={it.category}
                        size={40}
                        style={{ marginHorizontal: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.rowName,
                            !on && { color: colors.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {it.name}
                        </Text>
                        <Text style={styles.rowSub}>
                          {it.qty} {it.unit}
                          {it.have_base > 0
                            ? `  · have ${it.have_base} ${it.base_unit}`
                            : ""}
                          {(it as any).manual ? "  · added by you" : ""}
                        </Text>
                      </View>
                      {it.estimated_inr != null ? (
                        <Text style={[styles.rowPrice, !on && { color: colors.textMuted }]}>
                          ₹{Math.round(it.estimated_inr)}
                        </Text>
                      ) : (
                        <Text style={styles.rowPriceMuted}>—</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`grocery-remove-${it.ingredient_id}`}
                      style={styles.rowRemoveBtn}
                      onPress={() => removeItemPermanently(it.ingredient_id)}
                      hitSlop={10}
                    >
                      <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Sticky action bar */}
      {!loading && !empty && data && data.total_items > 0 ? (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.s }]}>
          <View style={styles.utilityRow}>
            <TouchableOpacity
              testID="grocery-copy"
              style={styles.utilityBtn}
              onPress={copyList}
            >
              <Ionicons name="copy-outline" size={16} color={colors.bananaLeaf} />
              <Text style={styles.utilityText}>Copy list</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="grocery-whatsapp"
              style={styles.utilityBtn}
              onPress={shareWhatsapp}
            >
              <Ionicons name="logo-whatsapp" size={16} color={colors.bananaLeaf} />
              <Text style={styles.utilityText}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.vendorRow}>
            {(Object.keys(VENDOR_META) as OrderVendor[]).map((v) => {
              const m = VENDOR_META[v];
              const disabled = selected.length === 0;
              return (
                <TouchableOpacity
                  key={v}
                  testID={`order-${v}`}
                  style={[styles.vendorBtn, { backgroundColor: m.color }, disabled && styles.vendorBtnDisabled]}
                  onPress={() => openOrder(v)}
                  disabled={disabled}
                >
                  <Ionicons name={m.icon} size={18} color="#111" />
                  <Text style={styles.vendorBtnText}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {selected.length === 0 ? (
            <Text style={styles.selectHint}>Select items above to enable ordering</Text>
          ) : null}
        </View>
      ) : null}

      {/* Order vendor modal */}
      <Modal visible={orderModal != null} transparent animationType="fade" onRequestClose={() => setOrderModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOrderModal(null)}>
          <Pressable
            style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.m }]}
            onPress={(e) => e.stopPropagation()}
            testID="order-modal"
          >
            <View style={styles.modalHandle} />
            {orderModal ? (
              <>
                <Text style={styles.modalTitle}>Order on {VENDOR_META[orderModal].label}</Text>
                <Text style={styles.modalSub}>
                  We&apos;ll open the app/website search for each item. Add them to your cart in the app, then come back and confirm.
                </Text>
                <TouchableOpacity
                  testID="order-all-btn"
                  style={[styles.orderAll, { backgroundColor: VENDOR_META[orderModal].color }]}
                  onPress={() => openOrderAll(orderModal)}
                >
                  <Text style={styles.orderAllText}>
                    Open {selected.length} items on {VENDOR_META[orderModal].label}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.modalHint}>Or open one at a time:</Text>
                <ScrollView style={{ maxHeight: 260 }}>
                  {selected.map((it) => (
                    <TouchableOpacity
                      key={it.ingredient_id}
                      style={styles.singleItem}
                      onPress={() => openVendorItem(orderModal, it.name)}
                      hitSlop={6}
                    >
                      <FoodAvatar kind="ingredient" id={it.ingredient_id} category={it.category} size={30} />
                      <Text style={styles.singleItemName}>{it.name}</Text>
                      <Text style={styles.singleItemQty}>
                        {it.qty} {it.unit}
                      </Text>
                      <Ionicons name="open-outline" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setOrderModal(null)}
                >
                  <Text style={styles.cancelText}>Close</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Order-placed confirmation */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()} testID="confirm-order">
            <View style={styles.confirmIcon}>
              <Ionicons name="cart" size={26} color={colors.bananaLeaf} />
            </View>
            <Text style={styles.confirmTitle}>Order placed?</Text>
            <Text style={styles.confirmSub}>
              We&apos;ll bulk-add {selected.length} items to your pantry with today&apos;s date and default storage.
            </Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={styles.confirmSecondary}
                onPress={() => setConfirmVisible(false)}
                disabled={busy}
              >
                <Text style={styles.confirmSecondaryText}>Not yet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-yes"
                style={styles.confirmPrimary}
                onPress={confirmOrderPlaced}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.riceWhite} />
                ) : (
                  <Text style={styles.confirmPrimaryText}>Yes, add to pantry</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add item search modal */}
      <Modal visible={addItemVisible} transparent animationType="fade" onRequestClose={() => setAddItemVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAddItemVisible(false)}>
          <Pressable
            style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.m, maxHeight: "80%" }]}
            onPress={(e) => e.stopPropagation()}
            testID="add-item-sheet"
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add an item</Text>
            <Text style={styles.modalSub}>Search any of our 98 tracked ingredients to add to this list</Text>
            <View style={styles.addSearchWrap}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={addQuery}
                onChangeText={searchAddItem}
                placeholder="Search ingredient…"
                placeholderTextColor={colors.textMuted}
                style={styles.addSearchInput}
                testID="add-item-search"
                autoFocus
              />
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {addResults === null ? null : addResults.length === 0 ? (
                <Text style={{ color: colors.textMuted, textAlign: "center", padding: spacing.l }}>
                  {addQuery ? `No match for "${addQuery}"` : "Type to search"}
                </Text>
              ) : (
                addResults.map((r) => (
                  <TouchableOpacity
                    key={r.ingredient_id}
                    style={styles.addResultRow}
                    onPress={() => addManualItem(r)}
                    testID={`add-item-result-${r.ingredient_id}`}
                  >
                    <FoodAvatar kind="ingredient" id={r.ingredient_id} category={r.category} size={38} style={{ marginRight: 10 }} />
                    <Text style={styles.addResultName}>{r.name}</Text>
                    <Ionicons name="add-circle" size={24} color={colors.bananaLeaf} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddItemVisible(false)}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 240 }]} testID="grocery-toast">
          <Ionicons name="checkmark-circle" size={18} color={colors.bananaLeaf} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.toast, { bottom: insets.bottom + 240, backgroundColor: "#FBECE4" }]}>
          <Ionicons name="alert-circle" size={16} color={colors.chili} />
          <Text style={[styles.toastText, { color: colors.chili }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
  headerBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  headerBadgeText: { color: colors.riceWhite, fontWeight: "700", fontSize: 12 },
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
    minHeight: 46,
    justifyContent: "center",
    borderRadius: radius.pill,
    alignItems: "center",
  },
  segBtnActive: { backgroundColor: colors.bananaLeaf },
  segText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
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
  body: { padding: spacing.m },
  summary: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    ...shadow.card,
    marginBottom: spacing.m,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summarySep: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  summaryValue: {
    fontFamily: fonts.headingEn,
    fontSize: 20,
    color: colors.textPrimary,
  },
  summaryLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    marginBottom: spacing.m,
    ...shadow.card,
    overflow: "hidden",
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.m,
    paddingBottom: 6,
  },
  groupTitle: {
    fontFamily: fonts.headingEn,
    fontSize: 14,
    letterSpacing: 0.4,
    color: colors.textSecondary,
    textTransform: "uppercase",
  },
  groupCount: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "700",
  },
  toolRow: { flexDirection: "row", gap: 8, marginBottom: spacing.m },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}12`,
  },
  toolBtnAdd: { flex: 1, justifyContent: "center", backgroundColor: colors.bananaLeaf },
  toolBtnText: { fontSize: 13, fontWeight: "700", color: colors.bananaLeaf },
  rowWrap: { flexDirection: "row", alignItems: "center" },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: spacing.m,
  },
  rowRemoveBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: colors.bananaLeaf,
    borderColor: colors.bananaLeaf,
  },
  selectHint: {
    textAlign: "center",
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
  vendorBtnDisabled: { opacity: 0.35 },
  addSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSoft,
    marginBottom: spacing.m,
  },
  addSearchInput: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 10 },
  addResultRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  addResultName: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowName: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  rowSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowPrice: { fontFamily: fonts.headingEn, fontSize: 15, color: colors.bananaLeafDark },
  rowPriceMuted: { fontSize: 12, color: colors.textMuted },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    padding: spacing.m,
    paddingBottom: spacing.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadow.card,
  },
  utilityRow: { flexDirection: "row", gap: spacing.s, marginBottom: spacing.s },
  utilityBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}12`,
  },
  utilityText: { color: colors.bananaLeaf, fontWeight: "700", fontSize: 14 },
  vendorRow: { flexDirection: "row", gap: 6 },
  vendorBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 52,
    borderRadius: radius.m,
    ...shadow.card,
  },
  vendorBtnText: {
    color: "#111",
    fontWeight: "800",
    fontSize: 14,
  },
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
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    marginBottom: spacing.m,
    lineHeight: 18,
  },
  modalHint: {
    marginTop: spacing.m,
    marginBottom: spacing.s,
    color: colors.textMuted,
    fontSize: 12,
  },
  orderAll: {
    padding: spacing.m,
    borderRadius: radius.m,
    alignItems: "center",
  },
  orderAllText: { color: "#111", fontWeight: "800", fontSize: 14 },
  singleItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  singleItemName: { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: "600" },
  singleItemQty: { fontSize: 11, color: colors.textMuted, marginRight: 4 },
  cancelBtn: {
    marginTop: spacing.s,
    paddingVertical: 12,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
  },
  cancelText: { color: colors.textSecondary, fontWeight: "600" },
  confirmCard: {
    marginHorizontal: spacing.l,
    marginBottom: spacing.xxl,
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.l,
    alignItems: "center",
    alignSelf: "center",
    minWidth: 300,
  },
  confirmIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}14`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.m,
  },
  confirmTitle: { fontFamily: fonts.headingEn, fontSize: 22, color: colors.textPrimary },
  confirmSub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.s,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.l,
  },
  confirmRow: { flexDirection: "row", gap: spacing.s, width: "100%" },
  confirmSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.m,
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
  },
  confirmSecondaryText: { color: colors.textSecondary, fontWeight: "700" },
  confirmPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.m,
    alignItems: "center",
    backgroundColor: colors.bananaLeaf,
  },
  confirmPrimaryText: { color: colors.textOnPrimary, fontWeight: "700" },
  toast: {
    position: "absolute",
    left: spacing.m,
    right: spacing.m,
    padding: spacing.m,
    backgroundColor: colors.bananaLeafDark,
    borderRadius: radius.m,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...shadow.card,
  },
  toastText: { color: colors.riceWhite, flex: 1, fontSize: 13, fontWeight: "600" },
});
