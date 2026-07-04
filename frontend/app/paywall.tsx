import React, { useEffect, useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

type Premium = {
  is_premium: boolean;
  plan?: string | null;
  quota?: {
    pantry_used: number;
    pantry_max: number | null;
    plan_generations_used: number;
    plan_generations_max: number | null;
  };
  free_limits: { pantry_max: number; plan_generations_per_month: number };
};

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
  { icon: "cube", title: "Unlimited pantry", sub: "Track every ingredient, no cap." },
  { icon: "restaurant", title: "Unlimited plan generations", sub: "Regenerate as often as you like." },
  { icon: "calendar", title: "Calendar export themes", sub: "Beautiful shareable images in multiple styles." },
  { icon: "heart", title: "Support the app", sub: "Keep AmmiAI ad-free and independent." },
];

export default function Paywall() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selected, setSelected] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<Premium | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setState(await api.get<Premium>("/api/premium/status"));
      } catch {
        /* noop */
      }
    })();
  }, []);

  const purchase = async () => {
    setBusy(true);
    try {
      await api.post("/api/premium/purchase", { plan: selected, receipt: "MOCK" });
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const p = await api.get<Premium>("/api/premium/status");
      setState(p);
      if (p.is_premium) router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen} testID="paywall-screen">
      <LinearGradient
        colors={[colors.bananaLeafDark, colors.bananaLeaf]}
        style={[styles.hero, { paddingTop: insets.top + spacing.m }]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.closeBtn}
          testID="paywall-close"
        >
          <Ionicons name="close" size={22} color={colors.riceWhite} />
        </Pressable>
        <View style={styles.heroIcon}>
          <Ionicons name="star" size={30} color={colors.turmeric} />
        </View>
        <Text style={styles.heroTitle}>AmmiAI Premium</Text>
        <Text style={styles.heroSub}>வரம்பற்ற சமையல் தோழி</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        <View style={styles.card}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name={b.icon} size={18} color={colors.bananaLeaf} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitSub}>{b.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.plansRow}>
          <PlanBox
            testID="plan-monthly"
            title="Monthly"
            price="₹99"
            period="/ month"
            active={selected === "monthly"}
            onPress={() => setSelected("monthly")}
          />
          <PlanBox
            testID="plan-yearly"
            title="Yearly"
            price="₹699"
            period="/ year"
            badge="Save 41%"
            active={selected === "yearly"}
            onPress={() => setSelected("yearly")}
          />
        </View>

        {state && !state.is_premium && state.quota ? (
          <View style={styles.quotaCard}>
            <Text style={styles.quotaTitle}>Your current usage</Text>
            <Text style={styles.quotaLine}>
              Pantry: {state.quota.pantry_used}/{state.quota.pantry_max ?? "∞"}
            </Text>
            <Text style={styles.quotaLine}>
              Plan generations this month: {state.quota.plan_generations_used}/
              {state.quota.plan_generations_max ?? "∞"}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={purchase}
          disabled={busy}
          style={[styles.cta, busy && { opacity: 0.6 }]}
          testID="paywall-purchase"
        >
          {busy ? (
            <ActivityIndicator color={colors.riceWhite} />
          ) : (
            <Text style={styles.ctaText}>
              Start Premium — {selected === "yearly" ? "₹699 / year" : "₹99 / month"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={restore} style={styles.restore} testID="paywall-restore">
          <Text style={styles.restoreText}>Restore purchase</Text>
        </TouchableOpacity>

        <Text style={styles.finePrint}>
          Billing via Google Play. This preview MOCKS the purchase — real IAP wires
          on your first Android build. Cancel anytime in Play Store &gt; Subscriptions.
        </Text>
      </ScrollView>
    </View>
  );
}

function PlanBox({
  title,
  price,
  period,
  active,
  onPress,
  testID,
  badge,
}: {
  title: string;
  price: string;
  period: string;
  active: boolean;
  onPress: () => void;
  testID: string;
  badge?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.planBox, active && styles.planBoxActive]}
      testID={testID}
    >
      {badge ? (
        <View style={styles.planBadge}>
          <Text style={styles.planBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={[styles.planTitle, active && { color: colors.riceWhite }]}>{title}</Text>
      <Text style={[styles.planPrice, active && { color: colors.riceWhite }]}>{price}</Text>
      <Text style={[styles.planPeriod, active && { color: "#CDE2CF" }]}>{period}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
  hero: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.xl,
    alignItems: "center",
  },
  closeBtn: { position: "absolute", top: 12, right: 16, padding: 8 },
  heroIcon: {
    width: 70,
    height: 70,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.s,
    marginTop: spacing.m,
  },
  heroTitle: {
    fontFamily: fonts.headingEn,
    fontSize: 30,
    color: colors.riceWhite,
  },
  heroSub: {
    fontFamily: fonts.bodyTa,
    fontSize: 14,
    color: "#CDE2CF",
    marginTop: 4,
  },
  body: { padding: spacing.m },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    ...shadow.card,
    marginBottom: spacing.m,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}14`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.m,
  },
  benefitTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  benefitSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  plansRow: { flexDirection: "row", gap: spacing.s, marginBottom: spacing.m },
  planBox: {
    flex: 1,
    padding: spacing.m,
    borderRadius: radius.l,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  planBoxActive: {
    backgroundColor: colors.bananaLeaf,
    borderColor: colors.bananaLeaf,
  },
  planBadge: {
    position: "absolute",
    top: -10,
    backgroundColor: colors.turmeric,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  planBadgeText: { color: "#111", fontWeight: "800", fontSize: 10 },
  planTitle: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, marginBottom: 6 },
  planPrice: { fontFamily: fonts.headingEn, fontSize: 30, color: colors.textPrimary },
  planPeriod: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  quotaCard: {
    backgroundColor: `${colors.turmeric}12`,
    borderRadius: radius.m,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  quotaTitle: { fontSize: 12, fontWeight: "700", color: colors.turmeric, marginBottom: 4 },
  quotaLine: { fontSize: 12, color: colors.textPrimary, marginTop: 2 },
  cta: {
    backgroundColor: colors.bananaLeaf,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: "center",
    ...shadow.card,
  },
  ctaText: { color: colors.riceWhite, fontWeight: "800", fontSize: 15 },
  restore: { alignItems: "center", paddingVertical: 12, marginTop: spacing.s },
  restoreText: { color: colors.bananaLeaf, fontWeight: "700" },
  finePrint: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.m,
    lineHeight: 16,
  },
});
