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
import { useFocusEffect, useRouter } from "expo-router";

import { AppHeader } from "@/src/components/app-header";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import { iconFor } from "@/src/ingredient-icons";
import type { PantryItem } from "@/src/types";

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [waste, setWaste] = useState<{ total_estimated_inr: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pantry, wasteResp] = await Promise.all([
        api.get<PantryItem[]>("/api/pantry"),
        api.get<{ total_estimated_inr: number }>("/api/waste-log"),
      ]);
      setItems(pantry);
      setWaste(wasteResp);
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
  const name = user?.name?.split(" ")[0] ?? "there";

  const expiring = (items ?? []).filter(
    (i) => i.freshness === "red" || i.freshness === "yellow",
  );

  return (
    <View style={styles.screen} testID="home-screen">
      <AppHeader
        title="AmmiAI"
        subtitleTa={`${timeLabel}, ${name}`}
        onLongPress={() => router.push("/dev-menu")}
        right={
          <TouchableOpacity
            testID="home-dev-menu"
            onPress={() => router.push("/dev-menu")}
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
        <Text style={styles.welcome} testID="home-welcome">
          {timeLabel}, {name}
        </Text>
        <Text style={styles.welcomeTa} testID="home-welcome-ta">
          உங்கள் தமிழ் சமையலறை உதவியாளர்
        </Text>

        {/* Quick stat pills */}
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

        {/* Expiring highlight */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Expiring soon</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/pantry")} testID="see-all-expiring">
            <Text style={styles.linkText}>See all</Text>
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
          expiring.slice(0, 5).map((item) => (
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
          ))
        )}

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
          <Ionicons
            name="sparkles"
            size={16}
            color={colors.turmeric}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.footerHintText}>
            Slice 1 ready · onboarding + pantry
          </Text>
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
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  welcome: {
    fontFamily: fonts.headingEn,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: spacing.s,
  },
  welcomeTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pillsRow: {
    flexDirection: "row",
    gap: spacing.s,
    marginTop: spacing.l,
  },
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
  pillLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
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
  linkText: {
    fontSize: 12,
    color: colors.bananaLeaf,
    fontWeight: "700",
  },
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
  expSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  expDays: { fontSize: 13, fontWeight: "700" },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    ...shadow.card,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  profileLabel: {
    flex: 1,
    marginLeft: spacing.m,
    color: colors.textSecondary,
    fontSize: 13,
  },
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
  footerHintText: { fontSize: 12, color: colors.textMuted },
});
