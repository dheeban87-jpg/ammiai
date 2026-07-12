import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import type { Recipe } from "@/src/types";

// Curated favorites — must exist in recipes_ammiaai_v2.json
const CURATED_FAV_IDS = [
  "tf_idli",
  "tf_dosa",
  "kz_sambar",
  "kz_vatha",
  "kz_mor",
  "rs_tomato",
  "tf_pongal",
  "vr_thayir",
  "vr_lemon",
  "vr_puliyodarai",
  "pr_keerai",
  "pr_potato",
  "kt_sorakkai",
  "tf_adai",
  "nv_chicken_kuzhambu",
];

const DIETS: { key: "veg" | "nonveg" | "eggetarian"; label: string; ta: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "veg", label: "Vegetarian", ta: "சைவம்", icon: "leaf" },
  { key: "eggetarian", label: "Eggetarian", ta: "முட்டையுடன்", icon: "egg" },
  { key: "nonveg", label: "Non-vegetarian", ta: "அசைவம்", icon: "fish" },
];

const SPICE: { key: "mild" | "medium" | "hot"; label: string; ta: string; emoji: string }[] = [
  { key: "mild", label: "Mild", ta: "குறைவு", emoji: "🌱" },
  { key: "medium", label: "Medium", ta: "மிதம்", emoji: "🌶" },
  { key: "hot", label: "Hot", ta: "காரம்", emoji: "🔥" },
];

const ALLERGY_CHIPS: { key: string; label: string }[] = [
  { key: "no_onion_garlic", label: "No onion & garlic" },
  { key: "no_coconut", label: "No coconut" },
  { key: "no_dairy", label: "No dairy" },
  { key: "no_nuts", label: "No nuts" },
];

const GOAL_CHIPS: { key: string; label: string }[] = [
  { key: "high_protein", label: "High-protein / Gym" },
  { key: "diabetic_friendly", label: "Managing sugar" },
  { key: "bp_friendly", label: "Heart / low-oil" },
  { key: "iron_support", label: "Iron / energy" },
  { key: "bone_calcium", label: "Bone / calcium" },
  { key: "digestion_fiber", label: "Digestion / fiber" },
  { key: "weight_loss", label: "Weight loss" },
  { key: "balanced", label: "General wellness" },
];

const TOTAL_STEPS = 6; // 5 profile steps + pantry quick-add

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, saveProfile, refreshProfile } = useAuth();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.name ?? "");
  const [diet, setDiet] = useState<"veg" | "nonveg" | "eggetarian" | null>(null);
  const [household, setHousehold] = useState(2);
  const [spice, setSpice] = useState<"mild" | "medium" | "hot">("medium");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [customAvoid, setCustomAvoid] = useState<string>("");
  const [showAllDishes, setShowAllDishes] = useState(false);
  const [heightCm, setHeightCm] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [goals, setGoals] = useState<string[]>([]);
  const [sex, setSex] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [ageBand, setAgeBand] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [bundleAdded, setBundleAdded] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<Recipe[]>("/api/recipes");
        setRecipes(r);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const bmi = useMemo(() => {
    const h = parseFloat(heightCm);
    const w = parseFloat(weightKg);
    if (!h || !w) return null;
    const m = h / 100;
    return +(w / (m * m)).toFixed(1);
  }, [heightCm, weightKg]);

  const bmiCategory = useMemo(() => {
    if (bmi == null) return null;
    if (bmi < 18.5) return { label: "Underweight", color: colors.turmeric };
    if (bmi < 25) return { label: "Normal", color: colors.bananaLeaf };
    if (bmi < 30) return { label: "Overweight", color: colors.turmeric };
    return { label: "Obese", color: colors.chili };
  }, [bmi]);

  const displayedDishes = useMemo(() => {
    if (showAllDishes) return recipes;
    const map = new Map(recipes.map((r) => [r.id, r]));
    return CURATED_FAV_IDS.map((id) => map.get(id)).filter(Boolean) as Recipe[];
  }, [recipes, showAllDishes]);

  const toggle = (arr: string[], key: string) =>
    arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key];

  const canProceed = useMemo(() => {
    if (step === 0) return name.trim().length >= 2;
    if (step === 1) return diet != null;
    if (step === 2) return household >= 1 && !!spice;
    if (step === 3) return true; // favorites/allergies optional
    if (step === 4) return true; // health optional
    if (step === 5) return true; // pantry optional
    return true;
  }, [step, name, diet, household, spice]);

  const submitProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const avoid = customAvoid
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await saveProfile({
        name: name.trim(),
        diet: diet ?? undefined,
        household_size: household,
        spice_level: spice,
        favorites,
        allergies,
        custom_avoid: avoid,
        health: {
          height_cm: heightCm ? parseFloat(heightCm) : undefined,
          weight_kg: weightKg ? parseFloat(weightKg) : undefined,
          bmi: bmi ?? undefined,
          goals,
          sex: (sex ?? undefined) as "male" | "female" | undefined,
          age_band: ageBand ?? undefined,
          activity: (activity ?? undefined) as "sedentary" | "moderate" | "active" | undefined,
        },
      });
      setStep(5);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save profile");
    } finally {
      setSaving(false);
    }
  };

  const addBundle = async () => {
    setBundleBusy(true);
    setError(null);
    try {
      await api.post("/api/pantry/bundle", {});
      setBundleAdded(true);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't add starter pantry");
    } finally {
      setBundleBusy(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await saveProfile({ onboarding_complete: true });
      await refreshProfile();
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't finish onboarding");
      setSaving(false);
    }
  };

  const onNext = () => {
    if (step < 4) setStep(step + 1);
    else if (step === 4) submitProfile(); // save then jump to pantry step
    else if (step === 5) finish();
  };

  const onBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const progress = (step + 1) / TOTAL_STEPS;

  return (
    <View style={styles.screen} testID="onboarding-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.s }]}>
        <Pressable
          onPress={onBack}
          disabled={step === 0}
          style={styles.backBtn}
          testID="onboarding-back"
          hitSlop={12}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={step === 0 ? "transparent" : colors.textOnPrimary}
          />
        </Pressable>
        <View style={styles.progressWrap}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.stepText} testID="onboarding-step">
          {step + 1}/{TOTAL_STEPS}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + 96 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 && (
            <View testID="step-name">
              <Text style={styles.h1}>What should we call you?</Text>
              <Text style={styles.h1Ta}>உங்கள் பெயர் என்ன?</Text>
              <TextInput
                testID="name-input"
                value={name}
                onChangeText={setName}
                style={styles.input}
                placeholder="e.g. Priya"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
          )}

          {step === 1 && (
            <View testID="step-diet">
              <Text style={styles.h1}>What&apos;s your diet?</Text>
              <Text style={styles.h1Ta}>உங்கள் உணவு பழக்கம்?</Text>
              <View style={styles.stackList}>
                {DIETS.map((d) => (
                  <TouchableOpacity
                    key={d.key}
                    testID={`diet-${d.key}`}
                    style={[styles.optionRow, diet === d.key && styles.optionRowActive]}
                    onPress={() => setDiet(d.key)}
                  >
                    <Ionicons
                      name={d.icon}
                      size={22}
                      color={diet === d.key ? colors.bananaLeaf : colors.textSecondary}
                    />
                    <View style={{ flex: 1, marginLeft: spacing.m }}>
                      <Text style={styles.optionTitle}>{d.label}</Text>
                      <Text style={styles.optionTa}>{d.ta}</Text>
                    </View>
                    {diet === d.key && (
                      <Ionicons name="checkmark-circle" size={22} color={colors.bananaLeaf} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {step === 2 && (
            <View testID="step-household">
              <Text style={styles.h1}>Household size & spice</Text>
              <Text style={styles.h1Ta}>வீட்டில் எத்தனை பேர்?</Text>

              <Text style={styles.subLabel}>People at home</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  testID="household-decrement"
                  style={styles.stepperBtn}
                  onPress={() => setHousehold((n) => Math.max(1, n - 1))}
                >
                  <Ionicons name="remove" size={32} color={colors.riceWhite} />
                </TouchableOpacity>
                <Text style={styles.stepperValue} testID="household-value">
                  {household}
                </Text>
                <TouchableOpacity
                  testID="household-increment"
                  style={styles.stepperBtn}
                  onPress={() => setHousehold((n) => Math.min(10, n + 1))}
                >
                  <Ionicons name="add" size={32} color={colors.riceWhite} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.subLabel, { marginTop: spacing.l }]}>Spice preference</Text>
              <View style={styles.chipRow}>
                {SPICE.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    testID={`spice-${s.key}`}
                    style={[styles.spiceChip, spice === s.key && styles.spiceChipActive]}
                    onPress={() => setSpice(s.key)}
                  >
                    <Text style={styles.spiceEmoji}>{s.emoji}</Text>
                    <Text
                      style={[
                        styles.spiceLabel,
                        spice === s.key && { color: colors.riceWhite },
                      ]}
                    >
                      {s.label}
                    </Text>
                    <Text
                      style={[
                        styles.spiceTa,
                        spice === s.key && { color: "#CDE2CF" },
                      ]}
                    >
                      {s.ta}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {step === 3 && (
            <View testID="step-favorites">
              <Text style={styles.h1}>Favorite dishes & avoids</Text>
              <Text style={styles.h1Ta}>பிடித்த உணவுகள்</Text>

              <Text style={styles.subLabel}>Pick a few dishes you love</Text>
              <View style={styles.chipsWrap}>
                {displayedDishes.map((r) => {
                  const on = favorites.includes(r.id);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      testID={`fav-${r.id}`}
                      style={[styles.dishChip, on && styles.dishChipActive]}
                      onPress={() => setFavorites((prev) => toggle(prev, r.id))}
                    >
                      <Text
                        style={[styles.dishChipTitle, on && { color: colors.riceWhite }]}
                        numberOfLines={1}
                      >
                        {r.name_en}
                      </Text>
                      <Text
                        style={[styles.dishChipTa, on && { color: "#CDE2CF" }]}
                        numberOfLines={1}
                      >
                        {r.name_ta}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                onPress={() => setShowAllDishes((v) => !v)}
                testID="fav-see-all"
                style={styles.seeAllBtn}
              >
                <Text style={styles.seeAllText}>
                  {showAllDishes ? "Show curated" : `See all ${recipes.length} dishes`}
                </Text>
              </TouchableOpacity>

              <Text style={[styles.subLabel, { marginTop: spacing.l }]}>Any avoids?</Text>
              <View style={styles.chipsWrap}>
                {ALLERGY_CHIPS.map((a) => {
                  const on = allergies.includes(a.key);
                  return (
                    <TouchableOpacity
                      key={a.key}
                      testID={`allergy-${a.key}`}
                      style={[styles.smallChip, on && styles.smallChipActive]}
                      onPress={() => setAllergies((p) => toggle(p, a.key))}
                    >
                      <Text style={[styles.smallChipText, on && { color: colors.riceWhite }]}>
                        {a.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                testID="custom-avoid-input"
                value={customAvoid}
                onChangeText={setCustomAvoid}
                style={[styles.input, { marginTop: spacing.m }]}
                placeholder="Custom avoids (comma-separated)"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          )}

          {step === 4 && (
            <View testID="step-health">
              <Text style={styles.h1}>Health (optional)</Text>
              <Text style={styles.h1Ta}>உடல்நலம்</Text>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Height (cm)</Text>
                  <TextInput
                    testID="height-input"
                    value={heightCm}
                    onChangeText={(t) => setHeightCm(t.replace(/[^0-9.]/g, ""))}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholder="165"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Weight (kg)</Text>
                  <TextInput
                    testID="weight-input"
                    value={weightKg}
                    onChangeText={(t) => setWeightKg(t.replace(/[^0-9.]/g, ""))}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholder="60"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>

              {bmi != null && bmiCategory ? (
                <View style={[styles.bmiCard, { borderColor: bmiCategory.color }]} testID="bmi-card">
                  <View>
                    <Text style={styles.bmiLabel}>Your BMI</Text>
                    <Text style={styles.bmiValue} testID="bmi-value">{bmi}</Text>
                  </View>
                  <View style={[styles.bmiTag, { backgroundColor: `${bmiCategory.color}22` }]}>
                    <Text style={[styles.bmiTagText, { color: bmiCategory.color }]}>
                      {bmiCategory.label}
                    </Text>
                  </View>
                </View>
              ) : null}

              <Text style={[styles.subLabel, { marginTop: spacing.l }]}>Sex (for calorie & protein targets)</Text>
              <View style={styles.chipsWrap}>
                {[["male", "Male"], ["female", "Female"]].map(([k, lbl]) => (
                  <TouchableOpacity
                    key={k}
                    testID={`sex-${k}`}
                    style={[styles.selChip, sex === k && styles.selChipOn]}
                    onPress={() => setSex(k)}
                  >
                    <Text style={[styles.selChipText, sex === k && styles.selChipTextOn]}>{lbl}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.subLabel, { marginTop: spacing.m }]}>Activity level</Text>
              <View style={styles.chipsWrap}>
                {[["sedentary", "Mostly sitting"], ["moderate", "Moderately active"], ["active", "Very active / gym"]].map(([k, lbl]) => (
                  <TouchableOpacity
                    key={k}
                    testID={`act-${k}`}
                    style={[styles.selChip, activity === k && styles.selChipOn]}
                    onPress={() => setActivity(k)}
                  >
                    <Text style={[styles.selChipText, activity === k && styles.selChipTextOn]}>{lbl}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.subLabel, { marginTop: spacing.l }]}>Health focus (pick any)</Text>
              <View style={styles.chipsWrap}>
                {GOAL_CHIPS.map((g) => {
                  const on = goals.includes(g.key);
                  return (
                    <TouchableOpacity
                      key={g.key}
                      testID={`goal-${g.key}`}
                      style={[styles.smallChip, on && styles.smallChipActive]}
                      onPress={() => setGoals((p) => toggle(p, g.key))}
                    >
                      <Text style={[styles.smallChipText, on && { color: colors.riceWhite }]}>
                        {g.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.disclaimer} testID="health-disclaimer">
                <Ionicons name="information-circle" size={16} color={colors.cardamom} />
                <Text style={styles.disclaimerText}>
                  Suggestions are general dietary guidance, not medical advice. Consult a doctor for medical conditions.
                </Text>
              </View>
            </View>
          )}

          {step === 5 && (
            <View testID="step-pantry">
              <Text style={styles.h1}>Add your fresh items</Text>
              <Text style={styles.h1Ta}>உங்கள் புதிய பொருட்கள்</Text>
              <Text style={styles.paragraph}>
                Staples assumed ✓ — rice, dals, tamarind, oil and spices are taken as stocked, so you only track what actually changes. Add your fresh items (vegetables, greens, curd), or tap the starter bundle below. You can edit anytime.
              </Text>

              <View style={styles.bundleCard} testID="basic-bundle-card">
                <View style={styles.bundleHeader}>
                  <View style={styles.bundleIcon}>
                    <Ionicons name="basket" size={24} color={colors.bananaLeaf} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bundleTitle}>Basic Tamil kitchen</Text>
                    <Text style={styles.bundleTitleTa}>அடிப்படை சாமான்</Text>
                  </View>
                  {bundleAdded && (
                    <Ionicons name="checkmark-circle" size={26} color={colors.bananaLeaf} />
                  )}
                </View>
                <View style={styles.bundleItems}>
                  {[
                    "Rice 5kg",
                    "Toor dal 1kg",
                    "Urad dal 0.5kg",
                    "Tamarind 0.25kg",
                    "Onion 1kg",
                    "Tomato 0.5kg",
                    "Oil 1L",
                    "Curd 0.5L",
                  ].map((t) => (
                    <View key={t} style={styles.bundlePill}>
                      <Text style={styles.bundlePillText}>{t}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  testID="bundle-add-btn"
                  onPress={addBundle}
                  disabled={bundleAdded || bundleBusy}
                  style={[
                    styles.bundleBtn,
                    (bundleAdded || bundleBusy) && styles.btnDisabled,
                  ]}
                >
                  {bundleBusy ? (
                    <ActivityIndicator color={colors.riceWhite} />
                  ) : (
                    <Text style={styles.bundleBtnText}>
                      {bundleAdded ? "Added to pantry" : "Add to pantry"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.skipHint}>
                You can skip this and add items manually from the Pantry tab.
              </Text>
            </View>
          )}

          {error ? (
            <View style={styles.errorBanner} testID="onboarding-error">
              <Ionicons name="alert-circle" size={16} color={colors.chili} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.m }]}>
        <TouchableOpacity
          testID="onboarding-next"
          disabled={!canProceed || saving}
          onPress={onNext}
          style={[styles.footerBtn, (!canProceed || saving) && styles.btnDisabled]}
        >
          {saving ? (
            <ActivityIndicator color={colors.riceWhite} />
          ) : (
            <Text style={styles.footerBtnText}>
              {step === 5 ? "Finish" : step === 4 ? "Save & continue" : "Next"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
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
    gap: spacing.m,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  progressWrap: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.turmeric,
    borderRadius: 999,
  },
  stepText: {
    color: colors.textOnPrimary,
    fontFamily: fonts.headingEn,
    fontSize: 14,
    width: 36,
    textAlign: "right",
  },
  body: { padding: spacing.l },
  h1: {
    fontFamily: fonts.headingEn,
    fontSize: 26,
    color: colors.textPrimary,
  },
  h1Ta: {
    fontFamily: fonts.bodyTa,
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.l,
  },
  paragraph: {
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.l,
  },
  subLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: spacing.s,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.m,
  },
  stackList: { gap: spacing.m },
  optionRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionRowActive: {
    borderColor: colors.bananaLeaf,
    backgroundColor: `${colors.bananaLeaf}0e`,
  },
  optionTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  optionTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.l,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBtn: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.bananaLeaf,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    fontFamily: fonts.headingBold,
    fontSize: 48,
    color: colors.textPrimary,
    minWidth: 90,
    textAlign: "center",
  },
  chipRow: { flexDirection: "row", gap: spacing.s },
  spiceChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: "center",
  },
  spiceChipActive: {
    backgroundColor: colors.bananaLeaf,
    borderColor: colors.bananaLeaf,
  },
  spiceEmoji: { fontSize: 22, marginBottom: 4 },
  spiceLabel: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  spiceTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  selChip: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selChipOn: { backgroundColor: colors.bananaLeaf, borderColor: colors.bananaLeaf },
  selChipText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  selChipTextOn: { color: colors.riceWhite },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dishChip: {
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 180,
  },
  dishChipActive: {
    backgroundColor: colors.bananaLeaf,
    borderColor: colors.bananaLeaf,
  },
  dishChipTitle: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  dishChipTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  seeAllBtn: { alignSelf: "flex-start", marginTop: spacing.s },
  seeAllText: {
    color: colors.bananaLeaf,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  smallChip: {
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallChipActive: {
    backgroundColor: colors.chili,
    borderColor: colors.chili,
  },
  smallChipText: { fontSize: 13, color: colors.textPrimary, fontWeight: "500" },
  row2: { flexDirection: "row", gap: spacing.m },
  bmiCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    ...shadow.card,
  },
  bmiLabel: { color: colors.textSecondary, fontSize: 12 },
  bmiValue: {
    fontFamily: fonts.headingEn,
    fontSize: 30,
    color: colors.textPrimary,
    marginTop: 2,
  },
  bmiTag: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill },
  bmiTagText: { fontWeight: "700", fontSize: 12 },
  disclaimer: {
    marginTop: spacing.l,
    backgroundColor: "#F4EFDF",
    padding: spacing.m,
    borderRadius: radius.m,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  disclaimerText: {
    flex: 1,
    color: colors.cardamom,
    fontSize: 12,
    lineHeight: 18,
  },
  bundleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    ...shadow.card,
  },
  bundleHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.m,
  },
  bundleIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}14`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.m,
  },
  bundleTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  bundleTitleTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bundleItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: spacing.m,
  },
  bundlePill: {
    backgroundColor: colors.surfaceSoft,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  bundlePillText: { fontSize: 11, color: colors.textPrimary },
  bundleBtn: {
    backgroundColor: colors.bananaLeaf,
    paddingVertical: 12,
    borderRadius: radius.m,
    alignItems: "center",
  },
  bundleBtnText: { color: colors.textOnPrimary, fontWeight: "600" },
  skipHint: {
    marginTop: spacing.m,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.m,
    backgroundColor: colors.riceWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
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
