import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { dishEmoji } from "@/src/food-emoji";
import { FoodAvatar } from "@/src/food-visual";
import { useCharmer } from "@/src/components/capt-charmer";
import { HomeHero } from "@/src/components/home-hero";
import { useFocusEffect, useRouter } from "expo-router";

import { AppHeader } from "@/src/components/app-header";
import { NutritionRing } from "@/src/components/nutrition-ring";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import { iconFor } from "@/src/ingredient-icons";
import type { PantryItem } from "@/src/types";

type Plan = {
  date: string;
  day_totals: { kcal: number; protein_g: number; fiber_g: number };
  day_targets: { kcal: number; protein_g: number; fiber_g: number };
  rings: { kcal: number; protein_g: number; fiber_g: number };
};

type Dish = {
  id: string;
  name_en: string;
  name_ta?: string;
  category: string;
  nutrition?: { kcal?: number; protein_g?: number };
  pantry_ratio?: number;
  pantry_have?: number;
  pantry_required?: number;
  expiring_hits?: string[];
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [waste, setWaste] = useState<{ total_estimated_inr: number } | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [rescue, setRescue] = useState<Dish[] | null>(null);
  const [cookNow, setCookNow] = useState<Dish[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pantry, wasteResp, planResp, rescueResp, cookResp] = await Promise.all([
        api.get<PantryItem[]>("/api/pantry"),
        api.get<{ total_estimated_inr: number }>("/api/waste-log"),
        api.get<Plan>("/api/plan/today"),
        api.get<{ items: Dish[] }>("/api/rescue-dishes"),
        api.get<{ items: Dish[] }>("/api/cook-now"),
      ]);
      setItems(pantry);
      setWaste(wasteResp);
      setPlan(planResp);
      setRescue(rescueResp.items);
      setCookNow(cookResp.items);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const greeting = new Date().getHours();
  const timeLabel =
    greeting < 12 ? "Good morning" : greeting < 17 ? "Good afternoon" : "Good evening";
  const timeEmoji = greeting < 12 ? "🌅" : greeting < 17 ? "☀️" : "🌙";
  const name = user?.name?.split(" ")[0] ?? "there";

  const charmer = useCharmer();
  const charmerNagged = React.useRef(false);
  const expiring = (items ?? []).filter(
    (i) => i.freshness === "red" || i.freshness === "yellow",
  );

  return (
    <View style={styles.screen} testID="home-screen">
      <AppHeader
        title="AmmiAI"
        subtitleTa="உங்கள் தமிழ் சமையலறை உதவியாளர்"
        onLongPress={() => router.push("/settings")}
        right={
          <TouchableOpacity
            testID="home-dev-menu"
            onPress={() => router.push("/settings")}
            style={styles.iconBtn}
            hitSlop={10}
          >
            <Ionicons name="settings-outline" size={20} color={colors.riceWhite} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Dr. Charmer's office — tap to consult */}
        <HomeHero />

        <Text style={styles.welcome} testID="home-welcome">
          {timeLabel} {timeEmoji}{"\n"}{name}
        </Text>


        {/* Balance rings (from today's plan) */}
        {plan ? (
          <View style={styles.ringsCard} testID="home-rings">
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Today&apos;s balance</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/plan")} testID="home-see-plan">
                <Text style={styles.linkText}>See plan →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.ringsRow}>
              <NutritionRing delay={0}
                testID="home-ring-kcal"
                size={82}
                strokeWidth={9}
                progress={plan.rings.kcal}
                color={colors.bananaLeaf}
                label="Calories"
                value={`${Math.round(plan.day_totals.kcal)}`}
                hint={`/ ${Math.round(plan.day_targets.kcal)}`}
              />
              <NutritionRing delay={140}
                testID="home-ring-protein"
                size={82}
                strokeWidth={9}
                progress={plan.rings.protein_g}
                color={colors.chili}
                label="Protein"
                value={`${Math.round(plan.day_totals.protein_g)}g`}
                hint={`/ ${Math.round(plan.day_targets.protein_g)}g`}
              />
              <NutritionRing delay={280}
                testID="home-ring-fiber"
                size={82}
                strokeWidth={9}
                progress={plan.rings.fiber_g}
                color={colors.turmeric}
                label="Fiber"
                value={`${Math.round(plan.day_totals.fiber_g)}g`}
                hint={`/ ${Math.round(plan.day_targets.fiber_g)}g`}
              />
            </View>
          </View>
        ) : null}

        {/* Stat pills */}
        <View style={styles.pillsRow}>
          <View style={styles.pillCard}>
            <Ionicons name="cube-outline" size={16} color={colors.bananaLeaf} />
            <Text style={styles.pillValue}>{items?.length ?? "—"}</Text>
            <Text style={styles.pillLabel}>Pantry items</Text>
          </View>
          <View style={styles.pillCard}>
            <Ionicons name="alarm" size={16} color={colors.turmeric} />
            <Text style={[styles.pillValue, { color: colors.turmeric }]}>
              {expiring.length}
            </Text>
            <Text style={styles.pillLabel}>Expiring soon</Text>
          </View>
          <View style={styles.pillCard}>
            <Ionicons name="trash-bin-outline" size={16} color={colors.chili} />
            <Text style={[styles.pillValue, { color: colors.chili }]}>
              ₹{waste?.total_estimated_inr?.toFixed(0) ?? "0"}
            </Text>
            <Text style={styles.pillLabel}>Waste so far</Text>
          </View>
        </View>

        {/* Expiring rescue */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Expiring soon</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/pantry")} testID="see-all-expiring">
            <Text style={styles.linkText}>See pantry →</Text>
          </TouchableOpacity>
        </View>

        {items === null && !error ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.bananaLeaf} />
          </View>
        ) : expiring.length === 0 ? (
          <View style={styles.emptyCard} testID="home-no-expiring">
            <Ionicons name="checkmark-circle" size={22} color={colors.bananaLeaf} />
            <Text style={styles.emptyCardText}>
              {items && items.length > 0
                ? "Nothing expiring — your pantry looks fresh."
                : "Add items to your pantry to see freshness alerts."}
            </Text>
          </View>
        ) : (
          <>
            {expiring.slice(0, 3).map((item) => (
              <View
                key={item.id}
                style={[
                  styles.expRow,
                  { borderLeftColor: item.freshness === "red" ? colors.chili : colors.turmeric },
                ]}
                testID={`home-expiring-${item.id}`}
              >
                <MaterialCommunityIcons
                  name={iconFor(item.ingredient_id, item.category)}
                  size={22}
                  color={colors.bananaLeaf}
                />
                <View style={{ flex: 1, marginLeft: spacing.m }}>
                  <Text style={styles.expTitle}>{item.ingredient_name}</Text>
                  <Text style={styles.expSub}>
                    {item.qty} {item.unit} · {item.storage}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.expDays,
                    { color: item.freshness === "red" ? colors.chili : colors.turmeric },
                  ]}
                >
                  {item.days_left != null && item.days_left <= 0
                    ? "expired"
                    : `${item.days_left ?? "?"}d`}
                </Text>
              </View>
            ))}

            {/* Rescue dishes (recipes that use expiring items) */}
            {rescue && rescue.length > 0 ? (
              <View style={styles.rescueCard} testID="rescue-card">
                <View style={styles.rescueHeader}>
                  <Ionicons name="sparkles" size={16} color={colors.turmeric} />
                  <Text style={styles.rescueTitle}>Rescue dishes</Text>
                </View>
                <Text style={styles.rescueHint}>
                  Cook these to use expiring items before they spoil.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rescueScroll}>
                  {rescue.slice(0, 6).map((r) => (
                    <View key={r.id} style={styles.dishChipCard} testID={`rescue-${r.id}`}>
                      <Text style={styles.dishChipTitle} numberOfLines={1}>{r.name_en}</Text>
                      {r.name_ta && r.name_ta !== r.name_en ? (
                        <Text style={styles.dishChipTa} numberOfLines={1}>{r.name_ta}</Text>
                      ) : null}
                      <View style={styles.dishChipMeta}>
                        <Text style={styles.dishChipMetaText}>
                          uses {r.expiring_hits?.length ?? 0} expiring
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        )}

        {/* Cook now — zero shopping */}
        {cookNow && cookNow.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Cook now from your kitchen</Text>
            </View>
            <Text style={styles.sectionSub}>
              Zero shopping — you have every ingredient.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rescueScroll}>
              {cookNow.map((r) => (
                <View key={r.id} style={[styles.dishChipCard, styles.cookCard]} testID={`cook-${r.id}`}>
                  <View style={styles.zeroTag}>
                    <Text style={styles.zeroTagText}>0 shopping</Text>
                  </View>
                  <FoodAvatar kind="dish" id={r.id} category={r.category} size={44} style={{ marginTop: 6, marginBottom: 2 }} />
                  <Text style={styles.dishChipTitle} numberOfLines={1}>{r.name_en}</Text>
                  {r.name_ta && r.name_ta !== r.name_en ? (
                    <Text style={styles.dishChipTa} numberOfLines={1}>{r.name_ta}</Text>
                  ) : null}
                  <Text style={styles.dishChipMetaText}>
                    {r.nutrition?.kcal ?? "—"} kcal · {r.category}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Profile summary */}
        {profile ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Your kitchen</Text>
            </View>
            <View style={styles.profileCard} testID="home-profile-card">
              <ProfileRow
                icon="restaurant-outline"
                label="Diet"
                value={
                  profile.diet === "veg"
                    ? "Vegetarian"
                    : profile.diet === "nonveg"
                      ? "Non-veg"
                      : profile.diet === "eggetarian"
                        ? "Eggetarian"
                        : "—"
                }
              />
              <ProfileRow
                icon="people-outline"
                label="Household"
                value={`${profile.household_size ?? "—"} people`}
              />
              <ProfileRow
                icon="flame-outline"
                label="Spice"
                value={profile.spice_level ?? "—"}
              />
              {profile.favorites?.length ? (
                <ProfileRow
                  icon="heart-outline"
                  label="Favorites"
                  value={`${profile.favorites.length} dishes`}
                />
              ) : null}
            </View>
          </>
        ) : null}

        <View style={styles.footerHint}>
          <Ionicons name="sparkles" size={16} color={colors.turmeric} style={{ marginRight: 6 }} />
          <Text style={styles.footerHintText}>Slice 2 · plan engine online</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.profileRow}>
      <Ionicons name={icon} size={18} color={colors.bananaLeaf} />
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
  body: { padding: spacing.m, paddingBottom: spacing.xl },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  welcome: {
    fontFamily: fonts.headingBold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.textPrimary,
    marginTop: spacing.s,
  },
  welcomeTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  ringsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    marginTop: spacing.l,
    ...shadow.card,
  },
  ringsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: spacing.s,
  },
  pillsRow: { flexDirection: "row", gap: spacing.s, marginTop: spacing.m },
  pillCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    alignItems: "flex-start",
    ...shadow.card,
  },
  pillValue: {
    fontFamily: fonts.headingEn,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: 6,
  },
  pillLabel: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.l,
    marginBottom: spacing.s,
  },
  sectionLabel: {
    fontFamily: fonts.headingEn,
    fontSize: 14,
    letterSpacing: 0.4,
    color: colors.textSecondary,
    textTransform: "uppercase",
  },
  sectionSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.s,
  },
  linkText: { fontSize: 13.5, color: colors.bananaLeaf, fontWeight: "700" },
  center: { alignItems: "center", padding: spacing.l },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s,
    ...shadow.card,
  },
  emptyCardText: { color: colors.textSecondary, flex: 1, fontSize: 13 },
  expRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    marginBottom: 8,
    borderLeftWidth: 4,
    ...shadow.card,
  },
  expTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  expSub: { fontSize: 13.5, color: colors.textMuted, marginTop: 2 },
  expDays: { fontSize: 13, fontWeight: "700" },
  rescueCard: {
    backgroundColor: `${colors.turmeric}10`,
    borderRadius: radius.l,
    padding: spacing.m,
    marginTop: spacing.s,
    borderWidth: 1,
    borderColor: `${colors.turmeric}44`,
  },
  rescueHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  rescueTitle: { fontWeight: "700", color: colors.turmeric, fontSize: 13 },
  rescueHint: { color: colors.textSecondary, fontSize: 13.5, marginVertical: 6 },
  rescueScroll: { gap: 8, paddingVertical: 4 },
  dishChipCard: {
    width: 160,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    ...shadow.card,
  },
  cookCard: {
    borderWidth: 1,
    borderColor: `${colors.bananaLeaf}44`,
  },
  zeroTag: {
    alignSelf: "flex-start",
    backgroundColor: colors.bananaLeaf,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    marginBottom: 6,
  },
  zeroTagText: { color: colors.riceWhite, fontSize: 10, fontWeight: "700" },
  dishChipTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  cookEmoji: { fontSize: 30, marginTop: 6, marginBottom: 2 },
  dishChipTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  dishChipMeta: { marginTop: 6 },
  dishChipMetaText: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    ...shadow.card,
  },
  profileRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  profileLabel: { flex: 1, marginLeft: spacing.m, color: colors.textSecondary, fontSize: 13 },
  profileValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    textTransform: "capitalize",
  },
  footerHint: {
    marginTop: spacing.l,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  footerHintText: { fontSize: 13, color: colors.textMuted },
});
