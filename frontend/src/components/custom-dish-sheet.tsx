// Batch 11: "My own dish" — user-created recipes with their own nutrition
// values. Honest by design: the form states these are the user's estimates.
import React, { useState } from "react";
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

import { api } from "@/src/api";
import { clearDishCatalog } from "@/src/dish-catalog";
import { colors, fonts, radius, spacing } from "@/src/theme";

const CATEGORIES = [
  { id: "tiffin", label: "Tiffin" },
  { id: "kuzhambu", label: "Kuzhambu" },
  { id: "poriyal", label: "Poriyal" },
  { id: "kootu", label: "Kootu" },
  { id: "rasam", label: "Rasam" },
  { id: "variety_rice", label: "Rice" },
  { id: "accompaniment", label: "Side" },
  { id: "nonveg", label: "Non-veg" },
] as const;

const DIETS = [
  { id: "veg", label: "Veg" },
  { id: "egg", label: "Egg" },
  { id: "nonveg", label: "Non-veg" },
] as const;

export function CustomDishSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (dish: any) => void;
}) {
  const insets = useSafeAreaInsets();
  const [nameEn, setNameEn] = useState("");
  const [nameTa, setNameTa] = useState("");
  const [category, setCategory] = useState<string>("accompaniment");
  const [diet, setDiet] = useState<string>("veg");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [fiber, setFiber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (v: string) => v.replace(/[^0-9.]/g, "");
  const valid = nameEn.trim().length > 1 && parseFloat(kcal) > 0 && parseFloat(protein) >= 0;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const dish = await api.post("/api/recipes/custom", {
        name_en: nameEn.trim(),
        name_ta: nameTa.trim() || undefined,
        category,
        diet,
        kcal: parseFloat(kcal),
        protein_g: parseFloat(protein),
        fiber_g: parseFloat(fiber) || 0,
      });
      clearDishCatalog();
      onCreated(dish);
      setNameEn(""); setNameTa(""); setKcal(""); setProtein(""); setFiber("");
    } catch (e: any) {
      const m = String(e?.message ?? "");
      setError(
        m.includes("404")
          ? "Custom dishes activate after the next backend update"
          : "Couldn't save — check the values and try again",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.m }]}
          onPress={(e) => e.stopPropagation()}
          testID="custom-dish-sheet"
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>My own dish</Text>
              <Text style={styles.sub}>
                Add any dish your family cooks. It appears in your planner, calendar and
                grocery like every other dish.
              </Text>

              <Text style={styles.label}>Dish name (English) *</Text>
              <TextInput
                testID="custom-name-en"
                style={styles.input}
                value={nameEn}
                onChangeText={setNameEn}
                placeholder="e.g. Amma's Fish Fry"
                placeholderTextColor={colors.textMuted}
                maxLength={80}
              />

              <Text style={styles.label}>Dish name (Tamil)</Text>
              <TextInput
                testID="custom-name-ta"
                style={styles.input}
                value={nameTa}
                onChangeText={setNameTa}
                placeholder="மீன் வறுவல் (optional)"
                placeholderTextColor={colors.textMuted}
                maxLength={80}
              />

              <Text style={styles.label}>Type</Text>
              <View style={styles.chipWrap}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chip, category === c.id && styles.chipActive]}
                    onPress={() => setCategory(c.id)}
                  >
                    <Text style={[styles.chipText, category === c.id && styles.chipTextActive]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Diet</Text>
              <View style={styles.chipWrap}>
                {DIETS.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.chip, diet === d.id && styles.chipActive]}
                    onPress={() => setDiet(d.id)}
                  >
                    <Text style={[styles.chipText, diet === d.id && styles.chipTextActive]}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Nutrition per serving (your estimate)</Text>
              <View style={styles.macroRow}>
                <View style={styles.macroField}>
                  <TextInput
                    testID="custom-kcal"
                    style={styles.macroInput}
                    value={kcal}
                    onChangeText={(v) => setKcal(num(v))}
                    keyboardType="numeric"
                    placeholder="kcal *"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={styles.macroField}>
                  <TextInput
                    testID="custom-protein"
                    style={styles.macroInput}
                    value={protein}
                    onChangeText={(v) => setProtein(num(v))}
                    keyboardType="numeric"
                    placeholder="protein g *"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={styles.macroField}>
                  <TextInput
                    testID="custom-fiber"
                    style={styles.macroInput}
                    value={fiber}
                    onChangeText={(v) => setFiber(num(v))}
                    keyboardType="numeric"
                    placeholder="fiber g"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
              <Text style={styles.honest}>
                ⓘ Built-in dishes use per-serving estimates from standard Tamil home recipes
                (IFCT reference values). For your own dish, your numbers are the truth.
              </Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                testID="custom-save-btn"
                style={[styles.saveBtn, (!valid || busy) && { opacity: 0.5 }]}
                onPress={save}
                disabled={!valid || busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.riceWhite} />
                ) : (
                  <>
                    <Ionicons name="add" size={18} color={colors.riceWhite} />
                    <Text style={styles.saveBtnText}>Save & add to meal</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "90%",
    backgroundColor: colors.riceWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.l,
  },
  title: { fontFamily: fonts.headingEn, fontSize: 22, color: colors.textPrimary },
  sub: { fontSize: 13.5, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.m, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "800", color: colors.textSecondary, marginTop: spacing.m, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },
  input: {
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.m,
    paddingHorizontal: spacing.m,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.bananaLeaf, borderColor: colors.bananaLeaf },
  chipText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  chipTextActive: { color: colors.riceWhite },
  macroRow: { flexDirection: "row", gap: 8 },
  macroField: { flex: 1 },
  macroInput: {
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.m,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    textAlign: "center",
  },
  honest: { fontSize: 12, color: colors.textMuted, marginTop: 10, lineHeight: 17 },
  error: { fontSize: 13.5, color: colors.chili, fontWeight: "700", marginTop: 10 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.bananaLeaf,
    marginTop: spacing.l,
  },
  saveBtnText: { color: colors.riceWhite, fontWeight: "800", fontSize: 16 },
  cancelBtn: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 4 },
  cancelText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
});
