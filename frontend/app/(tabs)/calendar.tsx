import React, { useCallback, useMemo, useRef, useState } from "react";
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

import { AppHeader } from "@/src/components/app-header";
import { api } from "@/src/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import type { Meal } from "@/src/components/meal-card";

type Plan = {
  date: string;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
  day_totals?: { kcal: number };
};

type MonthResp = {
  year: number;
  month: number;
  days_in_month: number;
  plans: Record<string, Plan>;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MEAL_ICON: Record<Meal["key"], keyof typeof Ionicons.glyphMap> = {
  breakfast: "sunny",
  lunch: "restaurant",
  dinner: "moon",
};

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function firstDishName(meal?: Meal): string {
  if (!meal) return "";
  const it = meal.items.find((i) => !i.static);
  return it?.name_en ?? "";
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<MonthResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [monthSpend, setMonthSpend] = useState<number | null>(null);
  const shotRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<MonthResp>(`/api/plan/month?year=${year}&month=${month}`);
      setData(r);
      // Estimated spend for the whole visible month (best-effort; ignore failure)
      const daysIn = new Date(year, month, 0).getDate();
      const start = isoDate(year, month, 1);
      const end = isoDate(year, month, daysIn);
      try {
        const g = await api.get<{ total_estimated_inr: number }>(
          `/api/grocery/list?start_date=${start}&end_date=${end}`,
        );
        setMonthSpend(g.total_estimated_inr);
      } catch {
        setMonthSpend(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load month");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const cells = useMemo(() => {
    if (!data) return [] as { date: string | null; day: number | null }[];
    // First-of-month weekday (Sunday=0). Pad from Sunday.
    const first = new Date(data.year, data.month - 1, 1);
    const leadingBlanks = first.getDay();
    const arr: { date: string | null; day: number | null }[] = [];
    for (let i = 0; i < leadingBlanks; i++) arr.push({ date: null, day: null });
    for (let d = 1; d <= data.days_in_month; d++) {
      arr.push({ date: isoDate(data.year, data.month, d), day: d });
    }
    // trailing to fill to full weeks
    while (arr.length % 7 !== 0) arr.push({ date: null, day: null });
    return arr;
  }, [data]);

  const todayIso = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const balancedDays = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.plans).filter((p: any) =>
      p.breakfast?.chip === "balanced" && p.lunch?.chip === "balanced" && p.dinner?.chip === "balanced",
    ).length;
  }, [data]);

  const planForDate = (date: string): Plan | undefined => data?.plans[date];

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else setMonth(month + 1);
  };

  const planDay = async (date: string) => {
    setBusy(date);
    setError(null);
    try {
      await api.post("/api/plan/generate", { date, seed: Date.now() % 1_000_000, force: true });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't plan day");
    } finally {
      setBusy(null);
    }
  };

  const planRestOfMonth = async () => {
    if (!data) return;
    // Find first empty day (>= today if current month, else first of month)
    const startDay =
      data.year === today.getFullYear() && data.month === today.getMonth() + 1
        ? today.getDate()
        : 1;
    const start = isoDate(data.year, data.month, startDay);
    const end = isoDate(data.year, data.month, data.days_in_month);
    setBusy("month");
    setError(null);
    try {
      await api.post("/api/plan/bulk-generate", {
        start_date: start,
        end_date: end,
        only_empty: true,
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't fill month");
    } finally {
      setBusy(null);
    }
  };

  const shareImage = async () => {
    setSharing(true);
    try {
      // captureRef returns a base64 data URI on web, tmp file uri on native.
      const uri = await captureRef(shotRef, {
        format: "png",
        quality: 0.95,
        result: Platform.OS === "web" ? "data-uri" : "tmpfile",
      });
      if (Platform.OS === "web") {
        // Trigger a download
        const link = document.createElement("a");
        link.href = uri as string;
        link.download = `AmmiAI-${data?.year}-${String(data?.month).padStart(2, "0")}.png`;
        link.click();
      } else {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: "image/png",
            dialogTitle: "Share your AmmiAI meal plan",
          });
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Couldn't share");
    } finally {
      setSharing(false);
    }
  };

  const emptyDaysCount = useMemo(() => {
    if (!data) return 0;
    let cnt = 0;
    for (let d = 1; d <= data.days_in_month; d++) {
      const iso = isoDate(data.year, data.month, d);
      if (iso < todayIso) continue; // don't count past days
      if (!data.plans[iso]) cnt++;
    }
    return cnt;
  }, [data, todayIso]);

  return (
    <View style={styles.screen} testID="calendar-screen">
      <AppHeader
        title="Calendar"
        subtitleTa="வாராந்திர அட்டவணை"
        right={
          <TouchableOpacity
            testID="calendar-share-btn"
            onPress={shareImage}
            style={styles.headerBtn}
            disabled={sharing}
            hitSlop={10}
          >
            {sharing ? (
              <ActivityIndicator color={colors.riceWhite} />
            ) : (
              <Ionicons name="share-outline" size={20} color={colors.riceWhite} />
            )}
          </TouchableOpacity>
        }
      />

      {/* Month switcher */}
      <View style={styles.monthBar} testID="month-bar">
        <TouchableOpacity onPress={prevMonth} style={styles.monthBtn} testID="month-prev" hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.bananaLeafDark} />
        </TouchableOpacity>
        <View>
          <Text style={styles.monthName} testID="month-name">
            {MONTH_NAMES[month - 1]} {year}
          </Text>
          <Text style={styles.monthStats}>
            {data
              ? `${Object.keys(data.plans).length}/${data.days_in_month} days planned`
              : "…"}
          </Text>
        </View>
        <TouchableOpacity onPress={nextMonth} style={styles.monthBtn} testID="month-next" hitSlop={10}>
          <Ionicons name="chevron-forward" size={22} color={colors.bananaLeafDark} />
        </TouchableOpacity>
      </View>

      {data ? (
        <View style={styles.statsStrip} testID="month-stats-strip">
          <View style={styles.statPill}>
            <Ionicons name="calendar" size={15} color={colors.bananaLeaf} />
            <Text style={styles.statPillValue}>{Object.keys(data.plans).length}/{data.days_in_month}</Text>
            <Text style={styles.statPillLabel}>planned</Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="checkmark-circle" size={15} color={colors.bananaLeaf} />
            <Text style={styles.statPillValue}>{balancedDays}</Text>
            <Text style={styles.statPillLabel}>balanced</Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="wallet" size={15} color={colors.chili} />
            <Text style={[styles.statPillValue, { color: colors.chili }]}>
              {monthSpend != null ? `₹${Math.round(monthSpend)}` : "—"}
            </Text>
            <Text style={styles.statPillLabel}>est. spend</Text>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.bananaLeaf} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + 96 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <ViewShot
            ref={shotRef}
            options={{ format: "png", quality: 0.95 }}
            style={styles.captureWrap}
          >
            <View style={styles.exportHeader}>
              <View>
                <Text style={styles.exportBrand}>AmmiAI</Text>
                <Text style={styles.exportBrandTa}>தமிழ் சமையலறை</Text>
              </View>
              <View>
                <Text style={styles.exportMonth}>{MONTH_NAMES[month - 1]}</Text>
                <Text style={styles.exportYear}>{year}</Text>
              </View>
            </View>

            {/* Weekday header */}
            <View style={styles.weekRow}>
              {WEEKDAYS.map((d, i) => (
                <View key={i} style={styles.weekHead}>
                  <Text style={styles.weekHeadText}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Grid */}
            <View style={styles.grid}>
              {cells.map((c, idx) => {
                if (!c.date) {
                  return <View key={`b-${idx}`} style={styles.cellBlank} />;
                }
                const plan = planForDate(c.date);
                const isToday = c.date === todayIso;
                const isPast = c.date < todayIso;
                return (
                  <TouchableOpacity
                    key={c.date}
                    onPress={() => {
                      if (!c.date) return; // blank leading/trailing cell
                      if (plan) {
                        router.push(`/plan/day/${c.date}`);
                      } else {
                        planDay(c.date);
                      }
                    }}
                    activeOpacity={0.85}
                    style={[
                      styles.cell,
                      isToday && styles.cellToday,
                      isPast && !plan && styles.cellPast,
                      !plan && styles.cellEmpty,
                    ]}
                    testID={`cell-${c.date}`}
                    disabled={busy === c.date}
                  >
                    <View style={styles.cellHeader}>
                      <Text
                        style={[
                          styles.cellDay,
                          isToday && { color: colors.bananaLeafDark },
                        ]}
                      >
                        {c.day}
                      </Text>
                      {isToday ? <View style={styles.todayDot} /> : null}
                    </View>
                    {busy === c.date ? (
                      <ActivityIndicator size="small" color={colors.bananaLeaf} />
                    ) : plan ? (
                      <View style={styles.cellMeals}>
                        {(["breakfast", "lunch", "dinner"] as const).map((mk) => {
                          const nm = firstDishName((plan as any)[mk]);
                          return (
                            <View key={mk} style={styles.cellMealRow}>
                              <Ionicons
                                name={MEAL_ICON[mk]}
                                size={9}
                                color={colors.bananaLeafSoft}
                              />
                              <Text style={styles.cellMealText} numberOfLines={1}>
                                {nm || "—"}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={styles.cellEmptyIcon}>
                        <Ionicons name="add" size={16} color={colors.textMuted} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.exportFooter}>
              <View style={styles.exportLegend}>
                <View style={styles.legendItem}>
                  <Ionicons name="sunny" size={11} color={colors.bananaLeafSoft} />
                  <Text style={styles.legendText}>Breakfast</Text>
                </View>
                <View style={styles.legendItem}>
                  <Ionicons name="restaurant" size={11} color={colors.bananaLeafSoft} />
                  <Text style={styles.legendText}>Lunch</Text>
                </View>
                <View style={styles.legendItem}>
                  <Ionicons name="moon" size={11} color={colors.bananaLeafSoft} />
                  <Text style={styles.legendText}>Dinner</Text>
                </View>
              </View>
              <Text style={styles.exportTagline}>Made with AmmiAI · Tamil kitchen manager</Text>
            </View>
          </ViewShot>

          {emptyDaysCount > 0 ? (
            <TouchableOpacity
              testID="plan-rest-month"
              style={styles.fillCta}
              onPress={planRestOfMonth}
              disabled={busy === "month"}
            >
              {busy === "month" ? (
                <ActivityIndicator color={colors.riceWhite} />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color={colors.riceWhite} />
                  <Text style={styles.fillCtaText}>
                    Plan rest of month ({emptyDaysCount} days)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.doneBanner} testID="calendar-done">
              <Ionicons name="checkmark-circle" size={18} color={colors.bananaLeaf} />
              <Text style={styles.doneText}>All days planned for this month</Text>
            </View>
          )}

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={colors.chili} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable onPress={shareImage} style={styles.shareRow} testID="share-image-row" disabled={sharing}>
            <Ionicons name="download-outline" size={16} color={colors.bananaLeaf} />
            <Text style={styles.shareText}>
              {sharing ? "Preparing image…" : Platform.OS === "web" ? "Download as image" : "Share as image"}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.riceWhite },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    backgroundColor: colors.riceWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  monthBtn: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
  },
  monthName: {
    fontFamily: fonts.headingEn,
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: "center",
  },
  monthStats: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
  statsStrip: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    backgroundColor: colors.riceWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 4,
    minHeight: 44,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSoft,
  },
  statPillValue: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  statPillLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
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
    alignItems: "flex-end",
    marginBottom: spacing.m,
    paddingBottom: spacing.s,
    borderBottomWidth: 2,
    borderBottomColor: colors.bananaLeafDark,
  },
  exportBrand: {
    fontFamily: fonts.headingEn,
    fontSize: 22,
    color: colors.bananaLeafDark,
    lineHeight: 24,
  },
  exportBrandTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  exportMonth: {
    fontFamily: fonts.headingEn,
    fontSize: 20,
    color: colors.turmeric,
    textAlign: "right",
  },
  exportYear: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "right",
    marginTop: 2,
  },
  weekRow: { flexDirection: "row" },
  weekHead: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  weekHeadText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.62,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cellBlank: {
    width: `${100 / 7}%`,
    aspectRatio: 0.62,
  },
  cellEmpty: {
    backgroundColor: colors.surfaceSoft,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  cellPast: { opacity: 0.6 },
  cellToday: {
    backgroundColor: `${colors.turmeric}22`,
    borderColor: colors.turmeric,
    borderWidth: 2,
  },
  cellHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cellDay: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.turmeric,
  },
  cellMeals: { flex: 1, justifyContent: "center", marginTop: 3 },
  cellMealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 2,
  },
  cellMealText: {
    fontSize: 10,
    color: colors.textSecondary,
    flex: 1,
  },
  cellEmptyIcon: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  exportFooter: {
    marginTop: spacing.m,
    paddingTop: spacing.s,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  exportLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginBottom: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendText: { fontSize: 9, color: colors.textMuted, fontWeight: "600" },
  exportTagline: {
    fontSize: 9,
    color: colors.textMuted,
    textAlign: "center",
  },
  fillCta: {
    marginTop: spacing.m,
    backgroundColor: colors.bananaLeaf,
    padding: spacing.m,
    borderRadius: radius.m,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  fillCtaText: { color: colors.textOnPrimary, fontWeight: "700", fontSize: 14 },
  doneBanner: {
    marginTop: spacing.m,
    backgroundColor: `${colors.bananaLeaf}12`,
    padding: spacing.m,
    borderRadius: radius.m,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  doneText: { color: colors.bananaLeaf, fontWeight: "600" },
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
  shareRow: {
    marginTop: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: spacing.m,
    borderRadius: radius.m,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  shareText: { color: colors.bananaLeaf, fontWeight: "700" },
});
