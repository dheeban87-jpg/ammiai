import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import { iconFor } from "@/src/ingredient-icons";
import type { Ingredient } from "@/src/types";

const UNITS = ["g", "kg", "ml", "L", "piece"];

export default function AddPantry() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("kg");
  const [storage, setStorage] = useState<"pantry" | "fridge">("pantry");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Ingredient[]>("/api/ingredients");
        setIngredients(data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load ingredients");
      }
    })();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ingredients.slice(0, 40);
    return ingredients
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.ingredient_id.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [query, ingredients]);

  useEffect(() => {
    if (!selected) return;
    // suggest storage & unit hints based on shelf life
    if (selected.fridge_days && !selected.pantry_days) setStorage("fridge");
    else if (selected.pantry_days && !selected.fridge_days) setStorage("pantry");
    // guess unit
    if (
      selected.ingredient_id.includes("oil") ||
      selected.ingredient_id === "milk" ||
      selected.ingredient_id === "curd"
    ) {
      setUnit("L");
    } else if (
      selected.ingredient_id === "egg" ||
      selected.ingredient_id.includes("coconut")
    ) {
      setUnit("piece");
    } else {
      setUnit("kg");
    }
  }, [selected]);

  const submit = async () => {
    if (!selected) return;
    const q = parseFloat(qty);
    if (!q || q <= 0) {
      setError("Quantity must be > 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/pantry", {
        ingredient_id: selected.ingredient_id,
        qty: q,
        unit,
        storage,
        purchase_date: date,
      });
      router.back();
    } catch (e: any) {
      if (e?.status === 402) {
        // Free-tier pantry quota — send them to paywall.
        setError(e?.message ?? "Free plan limit reached");
        router.push("/paywall");
      } else {
        setError(e?.message ?? "Failed to add");
      }
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = selected != null && parseFloat(qty) > 0 && !busy;

  return (
    <View style={styles.screen} testID="add-pantry-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.s }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          testID="add-back-btn"
          style={styles.backBtn}
        >
          <Ionicons name="close" size={24} color={colors.textOnPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Add to pantry</Text>
        <View style={{ width: 30 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {!selected ? (
          <View style={{ flex: 1 }}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                testID="ingredient-search"
                value={query}
                onChangeText={setQuery}
                placeholder="Search ingredient (e.g. tomato)"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                autoFocus
              />
            </View>
            <FlatList
              data={matches}
              keyExtractor={(i) => i.ingredient_id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: spacing.m,
                paddingBottom: insets.bottom + spacing.l,
              }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`ing-${item.ingredient_id}`}
                  style={styles.ingRow}
                  onPress={() => setSelected(item)}
                >
                  <View style={styles.ingIcon}>
                    <MaterialCommunityIcons
                      name={iconFor(item.ingredient_id, item.category)}
                      size={20}
                      color={colors.bananaLeaf}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ingName}>{item.name}</Text>
                    <Text style={styles.ingSub}>
                      {item.category} · pantry {item.pantry_days ?? "—"}d · fridge{" "}
                      {item.fridge_days ?? "—"}d
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyList}>No ingredient matches “{query}”.</Text>
              }
            />
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.selectedCard} testID="selected-ingredient">
              <View style={styles.ingIcon}>
                <MaterialCommunityIcons
                  name={iconFor(selected.ingredient_id, selected.category)}
                  size={22}
                  color={colors.bananaLeaf}
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.m }}>
                <Text style={styles.ingName}>{selected.name}</Text>
                <Text style={styles.ingSub}>{selected.category}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} testID="change-ingredient">
                <Text style={styles.changeLink}>Change</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Quantity</Text>
            <View style={styles.qtyRow}>
              <TextInput
                testID="qty-input"
                keyboardType="decimal-pad"
                value={qty}
                onChangeText={(t) => setQty(t.replace(/[^0-9.]/g, ""))}
                style={styles.qtyInput}
              />
              <View style={styles.unitPicker}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    testID={`unit-${u}`}
                    onPress={() => setUnit(u)}
                    style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                  >
                    <Text
                      style={[styles.unitText, unit === u && { color: colors.riceWhite }]}
                    >
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={styles.label}>Storage</Text>
            <View style={styles.segment}>
              <TouchableOpacity
                testID="storage-pantry"
                onPress={() => setStorage("pantry")}
                style={[styles.segBtn, storage === "pantry" && styles.segBtnActive]}
              >
                <Ionicons
                  name="cube-outline"
                  size={16}
                  color={storage === "pantry" ? colors.riceWhite : colors.textSecondary}
                />
                <Text
                  style={[styles.segText, storage === "pantry" && { color: colors.riceWhite }]}
                >
                  Pantry {selected.pantry_days ? `· ${selected.pantry_days}d` : ""}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="storage-fridge"
                onPress={() => setStorage("fridge")}
                style={[styles.segBtn, storage === "fridge" && styles.segBtnActive]}
              >
                <Ionicons
                  name="snow-outline"
                  size={16}
                  color={storage === "fridge" ? colors.riceWhite : colors.textSecondary}
                />
                <Text
                  style={[styles.segText, storage === "fridge" && { color: colors.riceWhite }]}
                >
                  Fridge {selected.fridge_days ? `· ${selected.fridge_days}d` : ""}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Purchase date</Text>
            <TextInput
              testID="date-input"
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              style={styles.dateInput}
            />
            <Text style={styles.hint}>
              Default: today. Change if you bought it earlier.
            </Text>

            {error ? (
              <View style={styles.errorBanner} testID="add-error">
                <Ionicons name="alert-circle" size={16} color={colors.chili} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>

      {selected && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.m }]}>
          <TouchableOpacity
            testID="add-submit-btn"
            style={[styles.footerBtn, !canSubmit && styles.btnDisabled]}
            onPress={submit}
            disabled={!canSubmit}
          >
            {busy ? (
              <ActivityIndicator color={colors.riceWhite} />
            ) : (
              <Text style={styles.footerBtnText}>Add to pantry</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
  header: {
    backgroundColor: colors.bananaLeafDark,
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: fonts.headingEn,
    fontSize: 22,
    color: colors.textOnPrimary,
  },
  searchWrap: {
    margin: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: colors.textPrimary,
  },
  ingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.m,
    borderRadius: radius.m,
    marginBottom: 8,
    ...shadow.card,
  },
  ingIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}14`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.m,
  },
  ingName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  ingSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  emptyList: {
    textAlign: "center",
    marginTop: spacing.xl,
    color: colors.textMuted,
  },
  form: { padding: spacing.m },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.m,
    borderRadius: radius.m,
    ...shadow.card,
    marginBottom: spacing.l,
  },
  changeLink: {
    color: colors.bananaLeaf,
    fontWeight: "700",
    fontSize: 12,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontWeight: "700",
    marginBottom: spacing.s,
    marginTop: spacing.m,
  },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.m },
  qtyInput: {
    width: 90,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 18,
    fontFamily: fonts.headingEn,
    color: colors.textPrimary,
    textAlign: "center",
  },
  unitPicker: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  unitBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unitBtnActive: {
    backgroundColor: colors.bananaLeaf,
    borderColor: colors.bananaLeaf,
  },
  unitText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  segment: { flexDirection: "row", gap: spacing.s },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.m,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segBtnActive: {
    backgroundColor: colors.bananaLeaf,
    borderColor: colors.bananaLeaf,
  },
  segText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  dateInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.textPrimary,
  },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  footer: {
    padding: spacing.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.riceWhite,
  },
  footerBtn: {
    backgroundColor: colors.bananaLeaf,
    paddingVertical: 14,
    borderRadius: radius.m,
    alignItems: "center",
  },
  footerBtnText: {
    color: colors.textOnPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  btnDisabled: { opacity: 0.5 },
  errorBanner: {
    marginTop: spacing.m,
    backgroundColor: "#FBECE4",
    borderRadius: radius.m,
    padding: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: { color: colors.chili, flex: 1, fontSize: 13 },
});
