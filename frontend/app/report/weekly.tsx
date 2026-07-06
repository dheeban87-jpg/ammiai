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
  // Deploy-activated extras (rendered only when present)
  actual_spend_inr?: number | null;
  estimated_spend_inr?: number | null;
  utilisation_pct?: number | null;
  top_wasted?: { name: string; inr: number }[];
  lessons?: string[];
};

type MonthlyReport = {
  year: number;
  month: number;
  days_planned: number;
  balanced_days: number;
  cooked_count: number;
  waste_count: number;
  waste_inr: number;
  consumed_inr: number;
  top_dishes?: { name: string; count: number }[];
  actual_spend_inr?: number | null;
  estimated_spend_inr?: number | null;
  utilisation_pct?: number | null;
  top_wasted?: { name: string; inr: number }[];
  lessons?: string[];
};

export default function WeeklyReport() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [r, setR] = useState<Report | null>(null);
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null);
  const [monthlyUnavailable, setMonthlyUnavailable] = useState(false);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [advice, setAdvice] = useState<string | null>(null);
  const [adviceBusy, setAdviceBusy] = useState(false);

  const getAdvice = async () => {
    setAdviceBusy(true);
    try {
      const out = await api.get<{ advice: string }>("/api/report/monthly-advice");
      setAdvice(out.advice);
    } catch {
      setToast("Captain's AI advice activates after the next backend update");
      setTimeout(() => setToast(null), 3500);
    } finally {
      setAdviceBusy(false);
    }
  };
  const shotRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Report>("/api/report/weekly");
      setR(data);
      try {
        const m = await api.get<MonthlyReport>("/api/report/monthly");
        setMonthly(m);
      } catch {
        // Monthly endpoint arrives with the next backend deploy.
        setMonthlyUnavailable(true);
      }
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
    } catch {
      // captureRef relies on findNodeHandle which is unsupported on RN Web.
      // Fall back to copying the text report + surfacing a helpful toast.
      if (Platform.OS === "web") {
        try {
          await Clipboard.setStringAsync(shareText);
        } catch {
          /* noop */
        }
        setToast("Image sharing works on your device. Text copied instead.");
        setTimeout(() => setToast(null), 3500);
      } else {
        setToast("Couldn't share image. Try again.");
        setTimeout(() => setToast(null), 2500);
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
        <Text style={styles.headerTitle}>{period === "week" ? "Weekly report" : "Monthly report"}</Text>
        <TouchableOpacity onPress={shareImage} style={styles.shareBtn} disabled={sharing} testID="report-share">
          {sharing ? <ActivityIndicator color={colors.riceWhite} /> : <Ionicons name="share-outline" size={20} color={colors.riceWhite} />}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.bananaLeaf} /></View>
      ) : r ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.periodToggle}>
            {(["week", "month"] as const).map((p) => (
              <TouchableOpacity
                key={p}
                testID={`report-period-${p}`}
                style={[styles.periodBtn, period === p && styles.periodBtnActive]}
                onPress={() => {
                  if (p === "month" && !monthly) return;
                  setPeriod(p);
                }}
                disabled={p === "month" && !monthly}
              >
                <Text style={[styles.periodText, period === p && styles.periodTextActive, p === "month" && !monthly && { opacity: 0.4 }]}>
                  {p === "week" ? "This week" : monthly ? "This month" : "Month (soon)"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {period === "month" && monthly ? (
            <View style={styles.monthWrap} testID="monthly-report">
              <View style={styles.statGridM}>
                <View style={styles.statCardM}>
                  <Text style={styles.statValueM}>{monthly.days_planned}</Text>
                  <Text style={styles.statLabelM}>days planned</Text>
                </View>
                <View style={styles.statCardM}>
                  <Text style={styles.statValueM}>{monthly.balanced_days}</Text>
                  <Text style={styles.statLabelM}>balanced days</Text>
                </View>
                <View style={styles.statCardM}>
                  <Text style={styles.statValueM}>{monthly.cooked_count}</Text>
                  <Text style={styles.statLabelM}>dishes cooked</Text>
                </View>
                <View style={styles.statCardM}>
                  <Text style={[styles.statValueM, { color: colors.chili }]}>₹{Math.round(monthly.waste_inr)}</Text>
                  <Text style={styles.statLabelM}>wasted ({monthly.waste_count})</Text>
                </View>
              </View>

              {monthly.actual_spend_inr != null ? (
                <View style={styles.spendCard}>
                  <Text style={styles.sectionLabel}>Spend</Text>
                  <View style={styles.spendRow}>
                    <Text style={styles.spendLabel}>You paid</Text>
                    <Text style={styles.spendValue}>₹{Math.round(monthly.actual_spend_inr)}</Text>
                  </View>
                  {monthly.estimated_spend_inr != null ? (
                    <View style={styles.spendRow}>
                      <Text style={styles.spendLabel}>AmmiAI estimate</Text>
                      <Text style={styles.spendMuted}>₹{Math.round(monthly.estimated_spend_inr)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {monthly.utilisation_pct != null ? (
                <View style={styles.utilCard}>
                  <Text style={styles.sectionLabel}>Kitchen utilisation</Text>
                  <View style={styles.utilBarBg}>
                    <View style={[styles.utilBarFill, { width: `${monthly.utilisation_pct}%` }]} />
                  </View>
                  <Text style={styles.utilText}>
                    {monthly.utilisation_pct}% of food value eaten · {100 - monthly.utilisation_pct}% wasted
                  </Text>
                </View>
              ) : null}

              {monthly.top_dishes && monthly.top_dishes.length > 0 ? (
                <View style={styles.listCard}>
                  <Text style={styles.sectionLabel}>Most cooked</Text>
                  {monthly.top_dishes.map((d) => (
                    <View key={d.name} style={styles.listRow}>
                      <Text style={styles.listName} numberOfLines={1}>{d.name}</Text>
                      <Text style={styles.listMeta}>×{d.count}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {monthly.top_wasted && monthly.top_wasted.length > 0 ? (
                <View style={styles.listCard}>
                  <Text style={styles.sectionLabel}>Most wasted</Text>
                  {monthly.top_wasted.map((d) => (
                    <View key={d.name} style={styles.listRow}>
                      <Text style={styles.listName} numberOfLines={1}>{d.name}</Text>
                      <Text style={[styles.listMeta, { color: colors.chili }]}>₹{Math.round(d.inr)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {monthly.lessons && monthly.lessons.length > 0 ? (
                <View style={styles.lessonsCard}>
                  <Text style={styles.sectionLabel}>Captain&apos;s lessons 🐼</Text>
                  {monthly.lessons.map((l, i) => (
                    <View key={i} style={styles.lessonRow}>
                      <Ionicons name="bulb" size={15} color={colors.turmeric} style={{ marginTop: 2 }} />
                      <Text style={styles.lessonText}>{l}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {advice ? (
                <View style={styles.adviceCard} testID="ai-advice-card">
                  <Text style={styles.sectionLabel}>Captain&apos;s AI habit analysis 🐼</Text>
                  <Text style={styles.adviceText}>{advice}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  testID="get-advice-btn"
                  style={[styles.adviceBtn, adviceBusy && { opacity: 0.6 }]}
                  onPress={getAdvice}
                  disabled={adviceBusy}
                >
                  {adviceBusy ? (
                    <ActivityIndicator color={colors.riceWhite} />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={17} color={colors.riceWhite} />
                      <Text style={styles.adviceBtnText}>Get Captain&apos;s AI habit analysis</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={[styles.captureWrap, period === "month" && { display: "none" }]}>
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

            {r.actual_spend_inr != null ? (
              <View style={styles.spendCard}>
                <Text style={styles.sectionLabel}>Spend this week</Text>
                <View style={styles.spendRow}>
                  <Text style={styles.spendLabel}>You paid</Text>
                  <Text style={styles.spendValue}>₹{Math.round(r.actual_spend_inr)}</Text>
                </View>
                {r.estimated_spend_inr != null ? (
                  <View style={styles.spendRow}>
                    <Text style={styles.spendLabel}>AmmiAI estimate</Text>
                    <Text style={styles.spendMuted}>₹{Math.round(r.estimated_spend_inr)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {r.utilisation_pct != null ? (
              <View style={styles.utilCard}>
                <Text style={styles.sectionLabel}>Kitchen utilisation</Text>
                <View style={styles.utilBarBg}>
                  <View style={[styles.utilBarFill, { width: `${r.utilisation_pct}%` }]} />
                </View>
                <Text style={styles.utilText}>
                  {r.utilisation_pct}% of food value eaten · {100 - r.utilisation_pct}% wasted
                </Text>
              </View>
            ) : null}

            {r.lessons && r.lessons.length > 0 ? (
              <View style={styles.lessonsCard}>
                <Text style={styles.sectionLabel}>Captain&apos;s lessons 🐼</Text>
                {r.lessons.map((l, i) => (
                  <View key={i} style={styles.lessonRow}>
                    <Ionicons name="bulb" size={15} color={colors.turmeric} style={{ marginTop: 2 }} />
                    <Text style={styles.lessonText}>{l}</Text>
                  </View>
                ))}
              </View>
            ) : null}

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
  periodToggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing.m,
  },
  periodBtn: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  periodBtnActive: { backgroundColor: colors.bananaLeaf },
  periodText: { fontSize: 15, fontWeight: "800", color: colors.textSecondary },
  periodTextActive: { color: colors.riceWhite },
  monthWrap: { gap: spacing.m },
  statGridM: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCardM: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    alignItems: "center",
    ...shadow.card,
  },
  statValueM: { fontFamily: fonts.headingBold, fontSize: 26, color: colors.bananaLeafDark },
  statLabelM: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted, marginTop: 2 },
  spendCard: { backgroundColor: colors.surface, borderRadius: radius.l, padding: spacing.m, ...shadow.card, marginTop: spacing.m },
  spendRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  spendLabel: { fontSize: 14.5, color: colors.textSecondary, fontWeight: "700" },
  spendValue: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.textPrimary },
  spendMuted: { fontSize: 15, color: colors.textMuted, fontWeight: "700" },
  utilCard: { backgroundColor: colors.surface, borderRadius: radius.l, padding: spacing.m, ...shadow.card, marginTop: spacing.m },
  utilBarBg: { height: 14, borderRadius: 7, backgroundColor: `${colors.chili}22`, marginTop: 8, overflow: "hidden" },
  utilBarFill: { height: 14, borderRadius: 7, backgroundColor: colors.bananaLeaf },
  utilText: { fontSize: 13.5, fontWeight: "700", color: colors.textSecondary, marginTop: 8 },
  listCard: { backgroundColor: colors.surface, borderRadius: radius.l, padding: spacing.m, ...shadow.card },
  listRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  listName: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  listMeta: { fontSize: 15, fontWeight: "800", color: colors.textSecondary },
  lessonsCard: {
    backgroundColor: `${colors.turmeric}12`,
    borderColor: `${colors.turmeric}55`,
    borderWidth: 1,
    borderRadius: radius.l,
    padding: spacing.m,
    marginTop: spacing.m,
  },
  lessonRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  lessonText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textPrimary, fontWeight: "600" },
  adviceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.turmeric,
    marginTop: spacing.m,
  },
  adviceBtnText: { color: colors.riceWhite, fontWeight: "800", fontSize: 15.5 },
  adviceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    borderWidth: 2,
    borderColor: colors.turmeric,
    marginTop: spacing.m,
    ...shadow.card,
  },
  adviceText: { fontSize: 14.5, lineHeight: 22, color: colors.textPrimary, marginTop: 6, fontWeight: "600" },
});
