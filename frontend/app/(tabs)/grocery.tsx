import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { useRouter } from "expo-router";

import { AppHeader } from "@/src/components/app-header";
import { ScreenErrorBoundary } from "@/src/components/error-boundary";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { readCache, writeCache } from "@/src/hooks/use-cached-query";
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
  covered_items?: { ingredient_id: string; name: string; need_qty: number; unit: string }[];
  groups: GroceryGroup[];
  total_items: number;
  total_estimated_inr: number;
};

type OrderVendor = "instamart" | "zepto";

const VENDOR_META: Record<
  OrderVendor,
  {
    label: string;
    color: string;
    icon: keyof typeof Ionicons.glyphMap;
    searchUrl: (q: string) => string;
    appUrl?: (q: string) => string; // native app scheme, tried first
  }
> = {
  instamart: {
    label: "Instamart",
    color: "#F15A29",
    icon: "bicycle",
    searchUrl: (q) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(q)}`,
    appUrl: (q) => `swiggy://instamart/search?query=${encodeURIComponent(q)}`,
  },
  zepto: {
    label: "Zepto",
    color: "#7A20CB",
    icon: "rocket",
    // Fixed: correct domain is zeptonow.com (zepto.co.in showed invalid pages)
    searchUrl: (q) => `https://www.zeptonow.com/search?query=${encodeURIComponent(q)}`,
    appUrl: (q) => `zepto://search?query=${encodeURIComponent(q)}`,
  },
};

function GroceryScreenInner() {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<7 | 14>(7);
  const [data, setData] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [addItemVisible, setAddItemVisible] = useState(false);
  const [healthItems, setHealthItems] = useState<any[]>([]);
  const [healthGuidance, setHealthGuidance] = useState<string[]>([]);
  const [captainBusy, setCaptainBusy] = useState<Set<string>>(new Set());
  const [actionsVisible, setActionsVisible] = useState(false);
  const [captainExpanded, setCaptainExpanded] = useState(false);
  const [mealsVisible, setMealsVisible] = useState(false);
  const [approvedMeals, setApprovedMeals] = useState<any[]>([]);
  const [mealsBusy, setMealsBusy] = useState(false);
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
      const raw = await api.get<GroceryList>(`/api/grocery/list?days=${days}`);
      // Defensive normalisation: drop any null/undefined rows the backend
      // (or a mid-deploy response) might contain — a single undefined item
      // in render was enough to crash release builds silently.
      const d: GroceryList = {
        ...raw,
        groups: (raw.groups ?? [])
          .filter((g) => g && Array.isArray(g.items))
          .map((g) => ({ ...g, items: g.items.filter((it) => it && it.ingredient_id) })),
        covered_items: Array.isArray(raw.covered_items)
          ? raw.covered_items.filter((c) => c && c.name)
          : [],
        total_items: raw.total_items ?? 0,
        total_estimated_inr: raw.total_estimated_inr ?? 0,
      };
      setData(d);
      writeCache(`grocery.list.${days}`, d); // R1: instant paint next open
      // No auto-selection — the list starts empty. Users select deliberately,
      // or tap a Captain's pick (rendered inline as the first group).
      setChecked(new Set());
      // Captain's health picks — inline first group. Fail silent if not deployed.
      try {
        const r = await api.get<{ items: any[]; guidance: string[] }>(
          "/api/grocery/suggest-health",
        );
        setHealthItems(Array.isArray(r.items) ? r.items : []);
        setHealthGuidance(Array.isArray(r.guidance) ? r.guidance : []);
      } catch {
        setHealthItems([]);
        setHealthGuidance([]);
      }
    } catch (e: any) {
      // Deploy-lag / offline: a not-yet-live endpoint or a network blip should
      // fail gracefully, not throw a red "404" toast for something that will
      // exist after the next backend deploy. Show a clean empty list instead.
      const status = e?.status;
      if (status === 404 || status === 503 || status === 0) {
        setData({
          groups: [],
          covered_items: [],
          total_items: 0,
          total_estimated_inr: 0,
          start_date: "",
          end_date: "",
          household_size: 1,
          days_covered: 0,
        });
        setChecked(new Set());
        setError(null);
      } else {
        setError(e?.message ?? "Couldn't load list");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useFocusEffect(
    useCallback(() => {
      // R1: seed from cache for an instant paint, then refresh in background.
      readCache<GroceryList>(`grocery.list.${days}`).then((c) => {
        if (c) {
          setData(c);
          setLoading(false);
        }
      });
      load();
    }, [load, days]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const selected = useMemo(() => {
    if (!data) return [] as GroceryItem[];
    return data.groups.flatMap((g) => g.items).filter((it) => checked.has(it.ingredient_id));
  }, [data, checked]);

  const selectedCost = useMemo(() => {
    let sum = 0;
    for (const it of selected) sum += it?.estimated_inr ?? 0;
    return sum;
  }, [selected]);

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

  const openConfirmWithPrices = (source: "online" | "local_shop") => {
    setPurchaseSource(source);
    setPrices({});
    setTotalPaid("");
    setShowItemPrices(false);
    setConfirmVisible(true);
  };

  const boughtLocalShop = () => {
    if (selected.length === 0) {
      setToast("Select at least one item first");
      setTimeout(() => setToast(null), 2200);
      return;
    }
    openConfirmWithPrices("local_shop");
  };

  const scanBill = async () => {
    try {
      // Lazy import: if this APK build predates the expo-image-picker
      // dependency, the Grocery screen must still open fine.
      let ImagePicker: typeof import("expo-image-picker");
      try {
        ImagePicker = await import("expo-image-picker");
      } catch {
        setToast("Bill scan needs the latest app build — rebuild the APK");
        setTimeout(() => setToast(null), 3500);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      setScanBusy(true);
      const asset = res.assets[0];
      const out = await api.post<{
        matches: Record<string, number>;
        unmatched: { name: string; price_inr: number }[];
        total_inr: number | null;
      }>("/api/grocery/scan-bill", {
        image_base64: asset.base64,
        media_type: asset.mimeType ?? "image/jpeg",
        list_items: selected.map((it) => ({ ingredient_id: it.ingredient_id, name: it.name })),
      });
      const filled: Record<string, string> = {};
      let hit = 0;
      for (const [iid, p] of Object.entries(out.matches ?? {})) {
        filled[iid] = String(Math.round(p));
        hit++;
      }
      if (hit > 0) {
        setPrices((prev) => ({ ...prev, ...filled }));
        setShowItemPrices(true);
      }
      if (out.total_inr != null) setTotalPaid(String(Math.round(out.total_inr)));
      const extra = out.unmatched?.length ? ` · ${out.unmatched.length} lines didn't match your list` : "";
      setToast(`Bill read: ${hit} prices filled${out.total_inr != null ? `, total ₹${Math.round(out.total_inr)}` : ""}${extra}`);
      setTimeout(() => setToast(null), 4000);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setToast(
        msg.includes("503") || msg.includes("404")
          ? "Bill scan activates after the next backend update"
          : "Couldn't read that bill — try a clearer photo",
      );
      setTimeout(() => setToast(null), 3500);
    } finally {
      setScanBusy(false);
    }
  };

  const openOrder = (vendor: OrderVendor) => {
    if (!data || selected.length === 0) {
      setToast("Select at least one item first");
      setTimeout(() => setToast(null), 2200);
      return;
    }
    startWizard(vendor);
    setOrderModal(vendor);
  };

  const openVendorItem = async (vendor: OrderVendor, name: string) => {
    const meta = VENDOR_META[vendor];
    const webUrl = meta.searchUrl(name);
    if (Platform.OS === "web") {
      window.open(webUrl, "_blank");
      return;
    }
    // Try the installed app first (deep-link scheme); fall back to the website.
    if (meta.appUrl) {
      try {
        await Linking.openURL(meta.appUrl(name));
        return;
      } catch {
        /* app not installed — fall through to web */
      }
    }
    Linking.openURL(webUrl);
  };

  // Zomato: order a healthy PREPARED MEAL (restaurant food, not grocery items).
  // Deep-link into Zomato (like Zepto search), then log the spend to the food
  // budget via the same confirm flow (no delivery app exposes price to auto-read).
  const openApprovedMeals = async () => {
    setMealsVisible(true);
    setMealsBusy(true);
    try {
      const r = await api.get<{ meals: any[] }>("/api/meals/approved");
      setApprovedMeals(r.meals ?? []);
    } catch (e: any) {
      setApprovedMeals([]);
      setToast(
        e?.status === 404
          ? "Captain's meals activate after the next backend update"
          : "Couldn't load Captain's meals",
      );
      setTimeout(() => setToast(null), 2600);
      setMealsVisible(false);
    } finally {
      setMealsBusy(false);
    }
  };

  const orderApprovedMeal = async (meal: any) => {
    // Search this exact approved dish on Zomato (deep-link like Zepto).
    const q = meal.name;
    const appUrl = `zomato://search?q=${encodeURIComponent(q)}`;
    const webUrl = `https://www.zomato.com/search?q=${encodeURIComponent(q)}`;
    try {
      if (Platform.OS === "web") {
        window.open(webUrl, "_blank");
      } else {
        try {
          await Linking.openURL(appUrl);
        } catch {
          await Linking.openURL(webUrl);
        }
      }
    } finally {
      // Record the dish immediately; amount is logged later via spend entry.
      try {
        await api.post("/api/meals/order-log", { dish_id: meal.id, dish_name: meal.name });
      } catch {}
      setMealsVisible(false);
      setToast(`${meal.name} recorded. Come back and log the amount for your budget.`);
      setTimeout(() => setToast(null), 4000);
    }
  };

  // Guided shopping wizard: there is no public cart API for Blinkit/Zepto/
  // Instamart, so the honest, workable pattern is one-item-at-a-time with
  // AmmiAI acting as the checklist: show item N, open its search in the
  // vendor app, user adds it there, comes back, taps Next. Progress is kept.
  const [wizardIdx, setWizardIdx] = useState(0);
  const [purchaseSource, setPurchaseSource] = useState<"online" | "local_shop">("online");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [totalPaid, setTotalPaid] = useState("");
  const [showItemPrices, setShowItemPrices] = useState(false);

  // Sum of user-entered item prices (declared AFTER `prices` to avoid TDZ).
  let pricesTotal = 0;
  for (const it of selected) {
    if (!it) continue;
    const v = parseFloat(prices[it.ingredient_id] ?? "");
    if (!isNaN(v)) pricesTotal += v;
  }
  const [scanBusy, setScanBusy] = useState(false);
  const [wizardDone, setWizardDone] = useState<Set<string>>(new Set());

  const startWizard = async (vendor: OrderVendor) => {
    setWizardIdx(0);
    setWizardDone(new Set());
    const names = selected.map((it) => it.name);
    await Clipboard.setStringAsync(names.join(", ")); // bonus: full list on clipboard
  };

  const wizardOpenCurrent = (vendor: OrderVendor) => {
    const it = selected[wizardIdx];
    if (it) openVendorItem(vendor, it.name);
  };

  const wizardNext = (markDone: boolean) => {
    const it = selected[wizardIdx];
    if (it && markDone) {
      setWizardDone((s) => new Set(s).add(it.ingredient_id));
    }
    if (wizardIdx + 1 < selected.length) {
      setWizardIdx(wizardIdx + 1);
    } else {
      setOrderModal(null);
      openConfirmWithPrices("online");
    }
  };

  const confirmOrderPlaced = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const tp = parseFloat(totalPaid);
      await api.post("/api/grocery/order-placed", {
        source: purchaseSource,
        total_paid_inr: isNaN(tp) ? null : tp,
        items: selected.map((it) => {
          const v = parseFloat(prices[it.ingredient_id] ?? "");
          return {
            ingredient_id: it.ingredient_id,
            qty: it.qty,
            unit: it.unit,
            paid_inr: isNaN(v) ? null : v,
          };
        }),
      });
      setConfirmVisible(false);
      const n = selected.length;
      setToast(`${n} item${n > 1 ? "s" : ""} moved to pantry ✓ — opening Pantry`);
      await load(); // list will now be empty
      setTimeout(() => {
        setToast(null);
        router.push("/pantry"); // backbone made visible: bought → pantry
      }, 1400);
    } finally {
      setBusy(false);
    }
  };

  // Tapping an inline Captain's pick adds it to the list AND selects it —
  // exactly the old addHealthSelected behaviour, but one tap per pick.
  const addCaptainPick = async (it: any) => {
    const id = it.ingredient_id;
    setCaptainBusy((prev) => new Set(prev).add(id));
    try {
      await api.post("/api/grocery/add-item", {
        ingredient_id: id,
        qty: it.qty ?? 100,
        unit: it.unit ?? "g",
      });
      await load(); // pick now lives in its category group
      setChecked((prev) => new Set(prev).add(id));
      setToast(`${it.name} added & selected ✓`);
      setTimeout(() => setToast(null), 2000);
    } catch (e: any) {
      setToast(
        e?.status === 404
          ? "Captain's picks activate after the next backend update"
          : "Couldn't add that pick",
      );
      setTimeout(() => setToast(null), 2600);
    } finally {
      setCaptainBusy((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  const empty = !loading && data && data.total_items === 0;

  return (
    <View style={styles.screen} testID="grocery-screen">
      <ScreenErrorBoundary name="Grocery/header">
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
      </ScreenErrorBoundary>

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
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 110 }]}
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

          {(() => {
            const existing = new Set(
              (data?.groups ?? []).flatMap((g) => g.items.map((it) => it.ingredient_id)),
            );
            const picks = healthItems.filter((it) => !existing.has(it.ingredient_id));
            if (picks.length === 0) return null;
            // Don't dump the full list on a first-time visitor — show the top few
            // (already ranked by the backend), rest behind an expander.
            const CAP = 4;
            const shown = captainExpanded ? picks : picks.slice(0, CAP);
            const moreCount = picks.length - shown.length;
            return (
              <View style={styles.captainCard} testID="captain-picks">
                <View style={styles.captainCardHead}>
                  <Text style={styles.captainCardEmoji}>🐼</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.captainCardTitle}>Captain&apos;s picks</Text>
                    <Text style={styles.captainCardSub}>
                      {healthGuidance[0] ?? "Groceries for your health focus — tap to add."}
                    </Text>
                  </View>
                </View>
                {shown.map((it) => {
                  const busy = captainBusy.has(it.ingredient_id);
                  return (
                    <TouchableOpacity
                      key={it.ingredient_id}
                      style={styles.captainRow}
                      onPress={() => addCaptainPick(it)}
                      disabled={busy}
                      testID={`captain-pick-${it.ingredient_id}`}
                      activeOpacity={0.7}
                    >
                      <View style={styles.checkbox}>
                        {busy ? (
                          <ActivityIndicator size="small" color={colors.bananaLeaf} />
                        ) : (
                          <Ionicons name="add" size={18} color={colors.bananaLeaf} />
                        )}
                      </View>
                      <FoodAvatar
                        kind="ingredient"
                        id={it.ingredient_id}
                        category={it.category}
                        size={40}
                        style={{ marginHorizontal: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName} numberOfLines={1}>{it.name}</Text>
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {it.focus ? `${it.focus} · ` : ""}{it.reason}
                        </Text>
                      </View>
                      <Text style={styles.rowPrice}>
                        {it.qty}{it.unit}{it.estimated_inr ? ` · ₹${Math.round(it.estimated_inr)}` : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {picks.length > CAP ? (
                  <TouchableOpacity
                    style={styles.captainMore}
                    onPress={() => setCaptainExpanded((v) => !v)}
                    testID="captain-picks-more"
                  >
                    <Text style={styles.captainMoreText}>
                      {captainExpanded ? "Show less" : `Show ${moreCount} more`}
                    </Text>
                    <Ionicons
                      name={captainExpanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={colors.bananaLeaf}
                    />
                  </TouchableOpacity>
                ) : null}
                <Text style={styles.captainDisclaimer}>
                  ICMR-NIN 2024 guidance — not medical advice; consult your doctor.
                </Text>
              </View>
            );
          })()}

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
                          {(it.have_base ?? 0) > 0
                            ? `Need ${it.need_base ?? it.qty}${it.base_unit ?? ""} · have ${it.have_base}${it.base_unit ?? ""} → buy ${it.qty} ${it.unit}`
                            : `Not in pantry → buy ${it.qty} ${it.unit}`}
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

      {/* Compact action bar — one slim row; all actions live in the sheet */}
      {!loading && !empty && data && data.total_items > 0 ? (
        <View style={[styles.slimBar, { paddingBottom: insets.bottom + spacing.s }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.slimCount} testID="grocery-selected-count">
              {selected.length} selected{selected.length ? ` · ₹${Math.round(selectedCost)}` : ""}
            </Text>
            <Text style={styles.slimHint}>
              {selected.length ? "Ready to order or share" : "Select items to order"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.slimPrimary}
            onPress={() => setActionsVisible(true)}
            testID="grocery-open-actions"
            activeOpacity={0.85}
          >
            <Ionicons name="bag-handle-outline" size={18} color={colors.riceWhite} />
            <Text style={styles.slimPrimaryText}>Order / Share</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Actions sheet — Copy / WhatsApp / vendors / local shop / Zomato / ONDC */}
      <Modal
        visible={actionsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setActionsVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActionsVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Order or share</Text>
            <Text style={styles.actionsSub}>
              {selected.length} item{selected.length !== 1 ? "s" : ""} selected · est. ₹
              {Math.round(selectedCost)}
            </Text>
            <View style={styles.actionsGrid}>
              <ActionTile
                icon="copy-outline"
                label="Copy list"
                onPress={() => {
                  setActionsVisible(false);
                  copyList();
                }}
              />
              <ActionTile
                icon="logo-whatsapp"
                label="WhatsApp"
                onPress={() => {
                  setActionsVisible(false);
                  shareWhatsapp();
                }}
              />
              {(Object.keys(VENDOR_META) as OrderVendor[]).map((v) => (
                <ActionTile
                  key={v}
                  icon={VENDOR_META[v].icon}
                  label={VENDOR_META[v].label}
                  tint={VENDOR_META[v].color}
                  disabled={selected.length === 0}
                  onPress={() => {
                    setActionsVisible(false);
                    openOrder(v);
                  }}
                />
              ))}
              <ActionTile
                icon="storefront-outline"
                label="Local shop"
                disabled={selected.length === 0}
                onPress={() => {
                  setActionsVisible(false);
                  boughtLocalShop();
                }}
              />
              <ActionTile
                icon="restaurant-outline"
                label="Zomato meals"
                onPress={() => {
                  setActionsVisible(false);
                  openApprovedMeals();
                }}
              />
            </View>
            <View style={styles.ondcRow}>
              <Ionicons name="globe-outline" size={15} color={colors.textMuted} />
              <Text style={styles.ondcText}>
                Order via ONDC (open network, live kirana prices) — coming after launch
              </Text>
            </View>
            {selected.length === 0 ? (
              <Text style={styles.selectHint}>Select items in the list to enable ordering.</Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Order vendor modal */}

      <ScreenErrorBoundary name="Grocery/order-modal">
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
                <Text style={styles.modalTitle}>Shop on {VENDOR_META[orderModal].label}</Text>
                <Text style={styles.modalSub}>
                  These apps don&apos;t allow adding a full cart from outside — so I&apos;ll guide you
                  item by item. Tap Search, add it in {VENDOR_META[orderModal].label}, come back, tap Next.
                </Text>

                {/* Progress */}
                <View style={styles.wizProgressRow}>
                  <Text style={styles.wizProgressText}>
                    Item {Math.min(wizardIdx + 1, selected.length)} of {selected.length}
                  </Text>
                  <View style={styles.wizDots}>
                    {selected.map((it, i) => (
                      <View
                        key={it.ingredient_id}
                        style={[
                          styles.wizDot,
                          wizardDone.has(it.ingredient_id) && styles.wizDotDone,
                          i === wizardIdx && styles.wizDotActive,
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {/* Current item hero */}
                {selected[wizardIdx] ? (
                  <View style={styles.wizHero} testID="wizard-current-item">
                    <FoodAvatar
                      kind="ingredient"
                      id={selected[wizardIdx].ingredient_id}
                      category={selected[wizardIdx].category}
                      size={72}
                    />
                    <View style={{ flex: 1, marginLeft: spacing.m }}>
                      <Text style={styles.wizName} numberOfLines={2}>{selected[wizardIdx].name}</Text>
                      <Text style={styles.wizQty}>
                        {selected[wizardIdx].qty} {selected[wizardIdx].unit}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <TouchableOpacity
                  testID="wizard-search-btn"
                  style={[styles.orderAll, { backgroundColor: VENDOR_META[orderModal].color }]}
                  onPress={() => wizardOpenCurrent(orderModal)}
                >
                  <Ionicons name="search" size={18} color="#1F1F1F" />
                  <Text style={styles.orderAllText}>
                    Search in {VENDOR_META[orderModal].label}
                  </Text>
                </TouchableOpacity>

                <View style={styles.wizBtnRow}>
                  <TouchableOpacity
                    testID="wizard-skip-btn"
                    style={styles.wizSkipBtn}
                    onPress={() => wizardNext(false)}
                  >
                    <Text style={styles.wizSkipText}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="wizard-next-btn"
                    style={styles.wizNextBtn}
                    onPress={() => wizardNext(true)}
                  >
                    <Ionicons name="checkmark" size={18} color={colors.riceWhite} />
                    <Text style={styles.wizNextText}>
                      {wizardIdx + 1 < selected.length ? "Added — next item" : "Added — finish"}
                    </Text>
                  </TouchableOpacity>
                </View>

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
      </ScreenErrorBoundary>

      {/* Order-placed confirmation */}
      <ScreenErrorBoundary name="Grocery/confirm-modal">
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <Pressable style={styles.modalBackdrop} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()} testID="confirm-order">
            <View style={styles.confirmIcon}>
              <Ionicons name="cart" size={26} color={colors.bananaLeaf} />
            </View>
            <Text style={styles.confirmTitle}>
              {purchaseSource === "local_shop" ? "Bought at local shop" : "Order placed?"}
            </Text>
            <Text style={styles.confirmSub}>
              Prices are optional — they power your budget and monthly habit report.
              Quickest: type just the bill total, or scan the bill.
            </Text>

            {/* Quick total (optional) */}
            <View style={styles.totalInputRow}>
              <Text style={styles.totalInputLabel}>Total paid</Text>
              <View style={styles.priceInputWrap}>
                <Text style={styles.priceRupee}>₹</Text>
                <TextInput
                  testID="total-paid-input"
                  style={styles.priceInput}
                  keyboardType="numeric"
                  value={totalPaid}
                  onChangeText={(v) => setTotalPaid(v.replace(/[^0-9.]/g, ""))}
                  placeholder="optional"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            {/* Options row */}
            <View style={styles.priceOptionsRow}>
              <TouchableOpacity
                testID="scan-bill-btn"
                style={styles.scanBtn}
                onPress={scanBill}
                disabled={scanBusy}
              >
                {scanBusy ? (
                  <ActivityIndicator size="small" color={colors.bananaLeafDark} />
                ) : (
                  <Ionicons name="camera-outline" size={18} color={colors.bananaLeafDark} />
                )}
                <Text style={styles.scanBtnText}>{scanBusy ? "Reading bill…" : "Scan bill"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="toggle-item-prices"
                style={[styles.scanBtn, showItemPrices && styles.scanBtnActive]}
                onPress={() => setShowItemPrices((s) => !s)}
              >
                <Ionicons name="list-outline" size={18} color={showItemPrices ? colors.riceWhite : colors.bananaLeafDark} />
                <Text style={[styles.scanBtnText, showItemPrices && { color: colors.riceWhite }]}>Item prices</Text>
              </TouchableOpacity>
            </View>

            {showItemPrices ? (
            <ScrollView style={styles.priceList} keyboardShouldPersistTaps="handled">
              {selected.map((it) => (
                <View key={it.ingredient_id} style={styles.priceRow}>
                  <FoodAvatar kind="ingredient" id={it.ingredient_id} category={it.category} size={34} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.priceName} numberOfLines={1}>{it.name}</Text>
                    <Text style={styles.priceQty}>{it.qty} {it.unit}</Text>
                  </View>
                  <View style={styles.priceInputWrap}>
                    <Text style={styles.priceRupee}>₹</Text>
                    <TextInput
                      testID={`price-${it.ingredient_id}`}
                      style={styles.priceInput}
                      keyboardType="numeric"
                      value={prices[it.ingredient_id] ?? ""}
                      onChangeText={(v) =>
                        setPrices((p) => ({ ...p, [it.ingredient_id]: v.replace(/[^0-9.]/g, "") }))
                      }
                      placeholder={it.estimated_inr != null ? String(Math.round(it.estimated_inr)) : "0"}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
            ) : null}
            {showItemPrices && pricesTotal > 0 ? (
              <View style={styles.priceTotalRow}>
                <Text style={styles.priceTotalLabel}>Items total</Text>
                <Text style={styles.priceTotalValue}>₹{Math.round(pricesTotal)}</Text>
              </View>
            ) : null}
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
                  <Text style={styles.confirmPrimaryText}>Save to pantry</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      </ScreenErrorBoundary>

      <ScreenErrorBoundary name="Grocery/add-item-modal">

      {/* Captain's approved meals sheet (Zomato) */}
      <Modal visible={mealsVisible} transparent animationType="slide" onRequestClose={() => setMealsVisible(false)}>
        <ScreenErrorBoundary name="Grocery/meals-sheet">
        <Pressable style={styles.modalBackdrop} onPress={() => setMealsVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>🐼 Captain&apos;s approved meals</Text>
            <Text style={styles.healthGuidance}>
              Order these healthy dishes on Zomato, soldier. Only dietician-approved
              meals — I don&apos;t offer junk. Tap one to search it.
            </Text>
            {mealsBusy && approvedMeals.length === 0 ? (
              <ActivityIndicator color={colors.bananaLeaf} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
                {approvedMeals.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.mealRow}
                    onPress={() => orderApprovedMeal(m)}
                    testID={`meal-${m.id}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.healthName}>{m.name}</Text>
                      <Text style={styles.healthReason}>
                        {(m.tags || []).join(" · ") || "healthy"}
                        {m.nutrition?.kcal ? ` · ${m.nutrition.kcal} kcal` : ""}
                      </Text>
                    </View>
                    <View style={styles.mealSearchTag}>
                      <Ionicons name="search" size={15} color="#E23744" />
                      <Text style={styles.mealSearchText}>Zomato</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {approvedMeals.length === 0 && !mealsBusy ? (
                  <Text style={styles.healthEmpty}>Set a health focus in Settings to get Captain&apos;s meals.</Text>
                ) : null}
              </ScrollView>
            )}
            <Text style={styles.healthDisclaimer}>
              Captain-approved healthy meals — not medical treatment. The dish is
              recorded; log the amount to track your food budget.
            </Text>
          </Pressable>
        </Pressable>
        </ScreenErrorBoundary>
      </Modal>

      {/* Add item search modal */}
      <Modal visible={addItemVisible} transparent animationType="fade" onRequestClose={() => setAddItemVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAddItemVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ width: "100%" }}
          >
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
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
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
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
      </ScreenErrorBoundary>

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

function ActionTile({
  icon,
  label,
  onPress,
  disabled,
  tint,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tint?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionTile, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={[styles.actionTileIcon, tint ? { backgroundColor: tint } : null]}>
        <Ionicons name={icon} size={20} color={tint ? "#111" : colors.bananaLeaf} />
      </View>
      <Text style={styles.actionTileLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
  // Compact action bar
  slimBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.m,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.card,
  },
  slimCount: { fontFamily: fonts.headingEn, fontSize: 16, color: colors.textPrimary },
  slimHint: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  slimPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.bananaLeaf,
    paddingHorizontal: spacing.l,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  slimPrimaryText: { color: colors.riceWhite, fontWeight: "800", fontSize: 14.5 },
  actionsSub: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.m },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.s },
  actionTile: {
    width: "31%",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.m,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSoft,
  },
  actionTileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.bananaLeaf}14`,
  },
  actionTileLabel: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
  // Inline Captain's picks group
  captainCard: {
    backgroundColor: `${colors.bananaLeaf}0D`,
    borderRadius: radius.l,
    padding: spacing.m,
    marginBottom: spacing.m,
    borderWidth: 1,
    borderColor: `${colors.bananaLeaf}26`,
  },
  captainCardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.s },
  captainCardEmoji: { fontSize: 22 },
  captainCardTitle: { fontFamily: fonts.headingEn, fontSize: 15.5, color: colors.bananaLeafDark },
  captainCardSub: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  captainRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: `${colors.bananaLeaf}1A`,
  },
  captainMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: `${colors.bananaLeaf}1A`,
  },
  captainMoreText: { color: colors.bananaLeaf, fontWeight: "700", fontSize: 13 },
  captainDisclaimer: { fontSize: 11, color: colors.textMuted, marginTop: spacing.s, fontStyle: "italic" },
  captainListBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: `${colors.bananaLeaf}14`,
    borderWidth: 1.5,
    borderColor: `${colors.bananaLeaf}44`,
    borderRadius: radius.l,
    padding: 14,
    marginBottom: spacing.m,
  },
  captainListEmoji: { fontSize: 30 },
  captainListTitle: { fontFamily: fonts.headingEn, fontSize: 17, color: colors.bananaLeafDark },
  captainListSub: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  healthGuidance: { fontSize: 13.5, color: colors.textSecondary, fontStyle: "italic", marginBottom: 8, lineHeight: 19 },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  healthName: { fontSize: 15.5, fontWeight: "700", color: colors.textPrimary },
  healthReason: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  healthQty: { fontSize: 13, fontWeight: "800", color: colors.bananaLeafDark },
  healthEmpty: { fontSize: 14, color: colors.textMuted, textAlign: "center", paddingVertical: 20 },
  healthDisclaimer: { fontSize: 11, color: colors.textMuted, textAlign: "center", marginTop: 10, lineHeight: 15 },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mealSearchTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: "#E2374415",
  },
  mealSearchText: { fontSize: 13, fontWeight: "800", color: "#E23744" },
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
  addResultName: { flex: 1, fontSize: 16.5, fontWeight: "700", color: colors.textPrimary },
  rowName: { fontSize: 16.5, fontWeight: "700", color: colors.textPrimary },
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
  coveredBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: `${colors.bananaLeaf}10`,
    borderColor: `${colors.bananaLeaf}44`,
    borderWidth: 1,
    borderRadius: radius.m,
    padding: spacing.m,
    marginTop: spacing.s,
  },
  coveredText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.bananaLeafDark, fontWeight: "600" },
  zomatoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 56,
    borderRadius: radius.pill,
    backgroundColor: "#E23744",
    marginTop: spacing.s,
  },
  zomatoBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  ondcRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    opacity: 0.75,
  },
  ondcText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  localShopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    marginTop: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.bananaLeaf,
    backgroundColor: `${colors.bananaLeaf}0E`,
  },
  localShopText: { fontSize: 15, fontWeight: "800", color: colors.bananaLeafDark },
  totalInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    marginTop: 8,
  },
  totalInputLabel: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  priceOptionsRow: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 12 },
  scanBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.bananaLeaf,
    backgroundColor: `${colors.bananaLeaf}0E`,
  },
  scanBtnActive: { backgroundColor: colors.bananaLeaf },
  scanBtnText: { fontSize: 14, fontWeight: "800", color: colors.bananaLeafDark },
  priceList: { alignSelf: "stretch", maxHeight: 220, marginTop: 6 },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  priceName: { fontSize: 15.5, fontWeight: "700", color: colors.textPrimary },
  priceQty: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  priceInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.m,
    paddingHorizontal: 10,
    minHeight: 46,
    minWidth: 88,
    backgroundColor: colors.surface,
  },
  priceRupee: { fontSize: 15, color: colors.textSecondary, fontWeight: "700", marginRight: 3 },
  priceInput: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.textPrimary, padding: 0 },
  priceTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "stretch",
    paddingVertical: 10,
    marginTop: 2,
  },
  priceTotalLabel: { fontSize: 15, fontWeight: "800", color: colors.textSecondary },
  priceTotalValue: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.chili },
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
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border,
    alignSelf: "center", marginBottom: 14,
  },
  sheetTitle: { fontFamily: fonts.headingBold, fontSize: 21, color: colors.textPrimary, marginBottom: 10 },
  sheetPrimary: {
    minHeight: 54, borderRadius: 999, backgroundColor: colors.bananaLeaf,
    alignItems: "center", justifyContent: "center", marginTop: 14,
  },
  sheetPrimaryText: { color: colors.riceWhite, fontWeight: "800", fontSize: 16 },
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
    flexDirection: "row",
    gap: 8,
    minHeight: 54,
    padding: spacing.m,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  orderAllText: { color: "#1F1F1F", fontWeight: "800", fontSize: 16 },
  wizProgressRow: { alignSelf: "stretch", marginTop: 4, marginBottom: spacing.m },
  wizProgressText: { fontSize: 14, fontWeight: "800", color: colors.textSecondary, marginBottom: 6 },
  wizDots: { flexDirection: "row", gap: 5, flexWrap: "wrap" },
  wizDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  wizDotDone: { backgroundColor: colors.bananaLeaf },
  wizDotActive: { borderWidth: 2, borderColor: colors.turmeric },
  wizHero: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.l,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  wizName: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  wizQty: { fontSize: 15, color: colors.textSecondary, marginTop: 3, fontWeight: "700" },
  wizBtnRow: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 10 },
  wizSkipBtn: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  wizSkipText: { fontSize: 15, fontWeight: "700", color: colors.textSecondary },
  wizNextBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.bananaLeaf,
    alignItems: "center",
    justifyContent: "center",
  },
  wizNextText: { fontSize: 15.5, fontWeight: "800", color: colors.riceWhite },
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


export default function GroceryScreen() {
  return (
    <ScreenErrorBoundary name="Grocery">
      <GroceryScreenInner />
    </ScreenErrorBoundary>
  );
}
