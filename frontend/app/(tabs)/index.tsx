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
import { PandaRoom } from "@/src/components/panda-room";
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
      <PandaRoom name={name} />
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
