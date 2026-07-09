// Bulk batch: makes the pantry -> dish chain VISIBLE, and maps health focus
// to SUPPORTIVE dishes (never "curative" — food supports, doctors treat).
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { FoodAvatar } from "@/src/food-visual";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

type Dish = {
  id: string;
  name: string;
  name_ta?: string;
  category?: string;
  nutrition?: { kcal?: number; protein_g?: number; fiber_g?: number };
  readiness?: number;
  have?: string[];
  missing?: string[];
  why?: string;
};

type HealthGroup = { focus: string; guidance: string; dishes: Dish[] };

export default function WhatToCookScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<"pantry" | "health">("pantry");
  const [pantryDishes, setPantryDishes] = useState<Dish[]>([]);
  const [healthGroups, setHealthGroups] = useState<HealthGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, h] = await Promise.all([
        api.get<{ dishes: Dish[] }>("/api/dishes/from-pantry").catch(() => ({ dishes: [] })),
        api.get<{ groups: HealthGroup[] }>("/api/dishes/for-health").catch(() => ({ groups: [] })),
      ]);
      setPantryDishes(p.dishes ?? []);
      setHealthGroups(h.groups ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const readinessColor = (r: number) =>
    r >= 100 ? colors.bananaLeaf : r >= 60 ? colors.turmeric : colors.chili;

  return (
    <View style={styles.screen} testID="what-to-cook-screen">
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.riceWhite} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>What can I cook?</Text>
          <Text style={styles.headerSub}>From your pantry &amp; your health focus</Text>
        </View>
      </View>

      <View style={styles.segment}>
        {([["pantry", "From my pantry"], ["health", "For my health"]] as const).map(([k, lbl]) => (
          <TouchableOpacity
            key={k}
            testID={`cook-tab-${k}`}
            style={[styles.segBtn, tab === k && styles.segBtnOn]}
            onPress={() => setTab(k)}
          >
            <Text style={[styles.segText, tab === k && styles.segTextOn]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.bananaLeaf} size="large" />
        </View>
      ) : tab === "pantry" ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={styles.chainHint}>
            🔗 The chain: your pantry ingredients → dishes you can make now. Higher
            readiness = more ingredients already in your pantry.
          </Text>
          {pantryDishes.length === 0 ? (
            <Text style={styles.empty}>Add items to your pantry to see what you can cook.</Text>
          ) : (
            pantryDishes.map((d) => (
              <View key={d.id} style={styles.dishCard}>
                <FoodAvatar kind="dish" id={d.id} category={d.category} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dishName}>{d.name}</Text>
                  <Text style={styles.dishMeta}>
                    {d.nutrition?.kcal ?? 0} kcal · P {d.nutrition?.protein_g ?? 0}g
                    {d.missing && d.missing.length > 0
                      ? ` · needs ${d.missing.length} more`
                      : " · all in pantry ✓"}
                  </Text>
                </View>
                <View style={[styles.readyPill, { backgroundColor: `${readinessColor(d.readiness ?? 0)}22` }]}>
                  <Text style={[styles.readyText, { color: readinessColor(d.readiness ?? 0) }]}>
                    {d.readiness ?? 0}%
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
          {healthGroups.length === 0 ? (
            <Text style={styles.empty}>
              Set a health focus in Settings, and the Captain will suggest supportive dishes.
            </Text>
          ) : (
            healthGroups.map((g, gi) => (
              <View key={gi} style={styles.groupBlock}>
                <Text style={styles.groupFocus}>{g.focus}</Text>
                {g.guidance ? <Text style={styles.groupGuidance}>{g.guidance}</Text> : null}
                {g.dishes.map((d) => (
                  <View key={d.id} style={styles.dishCard}>
                    <FoodAvatar kind="dish" id={d.id} category={d.category} size={46} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dishName}>{d.name}</Text>
                      <Text style={styles.dishMeta}>
                        {d.nutrition?.kcal ?? 0} kcal · P {d.nutrition?.protein_g ?? 0}g
                        {d.nutrition?.fiber_g ? ` · fiber ${d.nutrition.fiber_g}g` : ""}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
          <Text style={styles.disclaimer}>
            These dishes SUPPORT your health focus — they are not medical treatment.
            Consult your doctor for any condition.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bananaLeafDark,
    paddingHorizontal: spacing.m,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.headingBold, fontSize: 23, color: colors.riceWhite },
  headerSub: { fontSize: 13, color: "rgba(251,248,239,0.75)", fontWeight: "700" },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSoft,
    margin: spacing.m,
    borderRadius: radius.pill,
    padding: 4,
  },
  segBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.pill, alignItems: "center" },
  segBtnOn: { backgroundColor: colors.bananaLeaf },
  segText: { fontSize: 14, fontWeight: "800", color: colors.textSecondary },
  segTextOn: { color: colors.riceWhite },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: spacing.m, gap: 10 },
  chainHint: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 19,
    backgroundColor: `${colors.bananaLeaf}12`, padding: 12, borderRadius: radius.m,
    marginBottom: 4,
  },
  empty: { fontSize: 14.5, color: colors.textMuted, textAlign: "center", paddingVertical: 40, lineHeight: 21 },
  dishCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surface, borderRadius: radius.l, padding: 12, ...shadow.card,
  },
  dishName: { fontFamily: fonts.headingEn, fontSize: 16.5, color: colors.textPrimary },
  dishMeta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  readyPill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill },
  readyText: { fontSize: 13.5, fontWeight: "800" },
  groupBlock: { marginBottom: spacing.l, gap: 10 },
  groupFocus: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.bananaLeafDark },
  groupGuidance: { fontSize: 13, color: colors.textSecondary, fontStyle: "italic", lineHeight: 19 },
  disclaimer: { fontSize: 11.5, color: colors.textMuted, textAlign: "center", marginTop: 16, lineHeight: 16 },
});
