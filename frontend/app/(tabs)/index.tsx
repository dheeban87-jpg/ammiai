import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader } from "@/src/components/app-header";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

type Stats = {
  ingredients: number;
  recipes: number;
  meal_rule_docs: number;
  recipe_categories: Record<string, number>;
};

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

const CATEGORY_LABELS: Record<string, string> = {
  kuzhambu: "Kuzhambu",
  poriyal: "Poriyal",
  kootu: "Kootu",
  rasam: "Rasam",
  tiffin: "Tiffin",
  variety_rice: "Variety Rice",
  nonveg: "Non-Veg",
  accompaniment: "Accompaniment",
};

export default function HomeScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/stats`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Stats;
        if (alive) setStats(data);
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Failed to load");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.screen} testID="home-screen">
      <AppHeader title="AmmiAI" subtitleTa="வணக்கம், சமையல் தொடங்கலாம்" />
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.welcome} testID="home-welcome">
          Welcome to AmmiAI
        </Text>
        <Text style={styles.welcomeTa} testID="home-welcome-ta">
          உங்கள் தமிழ் சமையலறை உதவியாளர்
        </Text>

        <Text style={styles.sectionLabel}>Data loaded</Text>

        {error ? (
          <View style={[styles.card, styles.errorCard]} testID="home-error">
            <Ionicons
              name="alert-circle"
              size={22}
              color={colors.chili}
              style={{ marginRight: spacing.s }}
            />
            <Text style={styles.errorText}>Couldn&apos;t reach backend: {error}</Text>
          </View>
        ) : !stats ? (
          <View style={styles.card} testID="home-loading">
            <ActivityIndicator color={colors.bananaLeaf} />
            <Text style={styles.loadingText}>Loading kitchen data…</Text>
          </View>
        ) : (
          <>
            <View style={styles.counterRow}>
              <CounterCard
                testID="counter-ingredients"
                icon="leaf"
                value={stats.ingredients}
                label="Ingredients"
                sublabel="பொருட்கள்"
                tone="green"
              />
              <CounterCard
                testID="counter-recipes"
                icon="restaurant"
                value={stats.recipes}
                label="Recipes"
                sublabel="ரெசிபிகள்"
                tone="turmeric"
              />
            </View>

            <View style={styles.counterRow}>
              <CounterCard
                testID="counter-rules"
                icon="book"
                value={stats.meal_rule_docs}
                label="Meal Rules"
                sublabel="உணவு விதிகள்"
                tone="green"
              />
              <CounterCard
                testID="counter-categories"
                icon="grid"
                value={Object.keys(stats.recipe_categories).length}
                label="Categories"
                sublabel="வகைகள்"
                tone="turmeric"
              />
            </View>

            <Text style={styles.sectionLabel}>Recipe categories</Text>
            <View style={styles.categoryCard} testID="category-breakdown">
              {Object.entries(stats.recipe_categories)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count], idx, arr) => (
                  <View
                    key={cat}
                    style={[
                      styles.categoryRow,
                      idx === arr.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    testID={`category-row-${cat}`}
                  >
                    <Text style={styles.categoryName}>
                      {CATEGORY_LABELS[cat] ?? cat}
                    </Text>
                    <Text style={styles.categoryCount}>{count}</Text>
                  </View>
                ))}
            </View>
          </>
        )}

        <View style={styles.footerHint}>
          <Ionicons
            name="sparkles"
            size={16}
            color={colors.turmeric}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.footerHintText}>
            Slice 1 ready · shell + data loaded
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function CounterCard({
  icon,
  value,
  label,
  sublabel,
  tone,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  sublabel: string;
  tone: "green" | "turmeric";
  testID?: string;
}) {
  const accent = tone === "green" ? colors.bananaLeaf : colors.turmeric;
  return (
    <View style={styles.counterCard} testID={testID}>
      <View style={[styles.counterIconWrap, { backgroundColor: `${accent}18` }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
      <Text style={styles.counterSub}>{sublabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.riceWhite,
  },
  scrollBody: {
    padding: spacing.m,
    paddingBottom: spacing.xl,
  },
  welcome: {
    fontFamily: fonts.headingEn,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: spacing.s,
  },
  welcomeTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontFamily: fonts.headingEn,
    fontSize: 14,
    letterSpacing: 0.4,
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginTop: spacing.l,
    marginBottom: spacing.s,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    ...shadow.card,
  },
  loadingText: {
    marginLeft: spacing.s,
    color: colors.textSecondary,
  },
  errorCard: {
    borderWidth: 1,
    borderColor: `${colors.chili}55`,
    backgroundColor: "#FBECE4",
  },
  errorText: {
    color: colors.chili,
    flex: 1,
    fontSize: 13,
  },
  counterRow: {
    flexDirection: "row",
    gap: spacing.m,
    marginBottom: spacing.m,
  },
  counterCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    ...shadow.card,
  },
  counterIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.s,
  },
  counterValue: {
    fontFamily: fonts.headingEn,
    fontSize: 30,
    lineHeight: 34,
    color: colors.textPrimary,
  },
  counterLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: 2,
  },
  counterSub: {
    fontFamily: fonts.bodyTa,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    paddingHorizontal: spacing.m,
    ...shadow.card,
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  categoryName: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  categoryCount: {
    fontFamily: fonts.headingEn,
    fontSize: 16,
    color: colors.bananaLeaf,
  },
  footerHint: {
    marginTop: spacing.l,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  footerHintText: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
