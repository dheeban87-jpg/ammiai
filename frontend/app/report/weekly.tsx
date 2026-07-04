import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";

import { api } from "@/src/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

type Report = {
  start_date: string;
  end_date: string;
  waste_count: number;
  waste_inr: number;
  consumed_inr: number;
  money_saved_inr: number;
  cooked_count: number;
  diet_balance_score: number;
  balanced_meals: number;
  total_meals: number;
  current_streak: number;
  longest_streak: number;
  badges: { key: string; label: string; icon: string }[];
};

export default function WeeklyReport() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [r, setR] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const shotRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Report>("/api/report/weekly");
      setR(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
  }, [load]));

  const shareText = r
    ? `📊 AmmiAI Weekly Report (${r.start_date} → ${r.end_date})
✨ ${r.cooked_count} meals cooked
💰 ₹${Math.round(r.money_saved_inr)} saved (₹${Math.round(r.consumed_inr)} consumed − ₹${Math.round(r.waste_inr)} waste)
🥗 Diet balance: ${r.diet_balance_score}/100 (${r.balanced_meals}/${r.total_meals} balanced meals)
🔥 Current streak: ${r.current_streak} days
${r.badges.length ? "🏅 " + r.badges.map((b) => b.label).join(" · ") : ""}
Made with AmmiAI 🌿`
    : "";

  const shareImage = async () => {
    if (!r) return;
    setSharing(true);
    try {
      const uri = await captureRef(shotRef, {
        format: "png",
        quality: 0.95,
        result: Platform.OS === "web" ? "data-uri" : "tmpfile",
      });
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = uri as string;
        link.download = `AmmiAI-report-${r.end_date}.png`;
        link.click();
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share your weekly report",
        });
      }
    } finally {
      setSharing(false);
    }
  };

  const copyText = async () => {
    await Clipboard.setStringAsync(shareText);
    setToast("Report text copied");
    setTimeout(() => setToast(null), 2500);
  };

  const shareWhatsapp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    if (Platform.OS === "web") window.open(url, "_blank");
  };

  return (
    <View style={styles.screen} testID="report-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.s }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textOnPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Weekly report</Text>
        <TouchableOpacity onPress={shareImage} style={styles.shareBtn} disabled={sharing} testID="report-share">
          {sharing ? <ActivityIndicator color={colors.riceWhite} /> : <Ionicons name="share-outline" size={20} color={colors.riceWhite} />}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.bananaLeaf} /></View>
      ) : r ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={styles.captureWrap}>
            <View style={styles.exportHeader}>
              <View>
                <Text style={styles.exportBrand}>AmmiAI</Text>
                <Text style={styles.exportBrandTa}>வாராந்திர அறிக்கை</Text>
              </View>
              <View>
                <Text style={styles.exportDate}>{r.start_date}</Text>
                <Text style={styles.exportDate}>→ {r.end_date}</Text>
              </View>
            </View>

            <View style={styles.heroStat}>
              <Text style={styles.heroValue}>₹{Math.round(r.money_saved_inr)}</Text>
              <Text style={styles.heroLabel}>Money saved this week</Text>
              <Text style={styles.heroDetail}>
                ₹{Math.round(r.consumed_inr)} consumed − ₹{Math.round(r.waste_inr)} waste
              </Text>
            </View>

            <View style={styles.gridRow}>
              <StatCard color={colors.bananaLeaf} icon="restaurant" value={r.cooked_count} label="Meals cooked" />
              <StatCard color={colors.chili} icon="trash-bin-outline" value={r.waste_count} label="Items wasted" />
            </View>
            <View style={styles.gridRow}>
              <StatCard color={colors.turmeric} icon="fitness" value={`${r.diet_balance_score}/100`} label="Diet balance" />
              <StatCard color="#7A20CB" icon="flame" value={r.current_streak} label="Streak (days)" />
            </View>

            <Text style={styles.sectionLabel}>Badges</Text>
            {r.badges.length ? (
              <View style={styles.badgesRow}>
                {r.badges.map((b) => (
                  <View key={b.key} style={styles.badge} testID={`badge-${b.key}`}>
                    <Ionicons name={b.icon as any} size={14} color={colors.bananaLeaf} />
                    <Text style={styles.badgeText}>{b.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.badgeEmpty}>
                <Text style={styles.badgeEmptyText}>
                  Cook more, waste less to unlock badges next week 🌿
                </Text>
              </View>
            )}

            <View style={styles.exportFooter}>
              <Text style={styles.exportTagline}>Made with AmmiAI · Tamil kitchen manager</Text>
            </View>
          </ViewShot>

          <View style={styles.actionRow}>
            <TouchableOpacity onPress={copyText} style={styles.actionBtn} testID="report-copy">
              <Ionicons name="copy-outline" size={16} color={colors.bananaLeaf} />
              <Text style={styles.actionText}>Copy text</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={shareWhatsapp} style={styles.actionBtn} testID="report-whatsapp">
              <Ionicons name="logo-whatsapp" size={16} color={colors.bananaLeaf} />
              <Text style={styles.actionText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={shareImage} style={[styles.actionBtn, { backgroundColor: colors.bananaLeaf }]} testID="report-share-image">
              <Ionicons name="image-outline" size={16} color={colors.riceWhite} />
              <Text style={[styles.actionText, { color: colors.riceWhite }]}>Share image</Text>
            </TouchableOpacity>
          </View>

          {toast ? (
            <View style={styles.toast} testID="report-toast">
              <Ionicons name="checkmark-circle" size={16} color={colors.bananaLeaf} />
              <Text style={styles.toastText}>{toast}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.center}><Text style={{ color: colors.textMuted }}>No report yet</Text></View>
      )}
    </View>
  );
}

function StatCard({
  color, icon, value, label,
}: { color: string; icon: keyof typeof Ionicons.glyphMap; value: string | number; label: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
    flex: 1, textAlign: "center",
    fontFamily: fonts.headingEn, fontSize: 22, color: colors.textOnPrimary,
  },
  shareBtn: {
    width: 34, height: 34, borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.m },
  captureWrap: {
    backgroundColor: colors.riceWhite,
    borderRadius: radius.l,
    padding: spacing.m,
    ...shadow.card,
  },
  exportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing.s,
    borderBottomWidth: 2,
    borderBottomColor: colors.bananaLeafDark,
    marginBottom: spacing.m,
  },
  exportBrand: { fontFamily: fonts.headingEn, fontSize: 22, color: colors.bananaLeafDark, lineHeight: 24 },
  exportBrandTa: { fontFamily: fonts.bodyTa, fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  exportDate: { fontSize: 12, color: colors.textMuted, textAlign: "right" },
  heroStat: {
    backgroundColor: colors.bananaLeafDark,
    borderRadius: radius.l,
    padding: spacing.l,
    alignItems: "center",
    marginBottom: spacing.m,
  },
  heroValue: {
    fontFamily: fonts.headingEn, fontSize: 46, color: colors.turmeric, lineHeight: 50,
  },
  heroLabel: { color: colors.riceWhite, fontWeight: "700", fontSize: 14, marginTop: 4 },
  heroDetail: { color: "#CDE2CF", fontSize: 12, marginTop: 4 },
  gridRow: { flexDirection: "row", gap: spacing.s, marginBottom: spacing.s },
  statCard: {
    flex: 1, backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    borderLeftWidth: 4,
  },
  statValue: { fontFamily: fonts.headingEn, fontSize: 24, marginTop: 4 },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  sectionLabel: {
    fontFamily: fonts.headingEn, fontSize: 12,
    letterSpacing: 0.6, color: colors.textSecondary,
    textTransform: "uppercase",
    marginTop: spacing.m, marginBottom: spacing.s,
  },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: `${colors.bananaLeaf}14`,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, color: colors.bananaLeaf, fontWeight: "700" },
  badgeEmpty: {
    padding: spacing.m, backgroundColor: colors.surface, borderRadius: radius.m,
    borderWidth: 1, borderColor: colors.border,
  },
  badgeEmptyText: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  exportFooter: { marginTop: spacing.m, paddingTop: spacing.s, borderTopWidth: 1, borderTopColor: colors.border },
  exportTagline: { fontSize: 10, color: colors.textMuted, textAlign: "center" },
  actionRow: { flexDirection: "row", gap: spacing.s, marginTop: spacing.m },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    padding: 12, borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}12`,
  },
  actionText: { color: colors.bananaLeaf, fontWeight: "700", fontSize: 12 },
  toast: {
    marginTop: spacing.m, backgroundColor: colors.surface,
    padding: spacing.m, borderRadius: radius.m,
    flexDirection: "row", alignItems: "center", gap: 8, ...shadow.card,
  },
  toastText: { color: colors.textPrimary, fontSize: 13 },
});
