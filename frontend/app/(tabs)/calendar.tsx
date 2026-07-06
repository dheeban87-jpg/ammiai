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
import { FoodAvatar } from "@/src/food-visual";
import { useI18n } from "@/src/i18n";
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

function firstDish(meal?: Meal): { id: string; name: string; category?: string } | null {
  if (!meal) return null;
  const it = meal.items.find((i) => !i.static);
  if (!it) return null;
  return { id: it.id, name: it.name_en, category: (it as any).category };
}

/** Tight cell name: drop the "(...)" suffix so more fits. */
function shortName(name?: string | null): string {
  if (!name) return "";
  return name.split(" (")[0];
}

export default function CalendarScreen() {
  const { t } = useI18n();
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
  const [viewMode, setViewMode] = useState<"week" | "month">("week");

  // Current week (Sun..Sat) containing today, as ISO dates within this view.
  const weekDates = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() - base.getDay()); // back to Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return {
        iso: isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()),
        day: d.getDate(),
        wd: i,
      };
    });
  }, []);
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
      // Let React paint the capture-only branded header before snapshotting.
      await new Promise((r) => setTimeout(r, 150));
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
        title={t("calendar.title")}
        subtitleTa={t("calendar.subtitle")}
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
            {sharing ? (
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
            ) : null}

            {/* Week / Month toggle */}
            {!sharing ? (
              <View style={styles.viewToggle}>
                {(["week", "month"] as const).map((vm) => (
                  <TouchableOpacity
                    key={vm}
                    testID={`calendar-view-${vm}`}
                    onPress={() => setViewMode(vm)}
                    style={[styles.viewToggleBtn, viewMode === vm && styles.viewToggleBtnActive]}
                  >
                    <Text style={[styles.viewToggleText, viewMode === vm && styles.viewToggleTextActive]}>
                      {vm === "week" ? "This week" : "Month"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {viewMode === "week" && !sharing ? (
              <View style={styles.weekList}>
                {weekDates.map((w) => {
                  const plan = planForDate(w.iso);
                  const isToday = w.iso === todayIso;
                  const bf = plan ? firstDish((plan as any).breakfast) : null;
                  const lu = plan ? firstDish((plan as any).lunch) : null;
                  const dn = plan ? firstDish((plan as any).dinner) : null;
                  return (
                    <TouchableOpacity
                      key={w.iso}
                      testID={`week-card-${w.iso}`}
                      style={[styles.weekCard, isToday && styles.weekCardToday]}
                      activeOpacity={0.85}
                      disabled={busy === w.iso}
                      onPress={() => {
                        if (plan) router.push(`/plan/day/${w.iso}`);
                        else planDay(w.iso);
                      }}
                    >
                      <View style={[styles.weekDateBadge, w.wd === 0 && { backgroundColor: "#F6DBD2" }, w.wd === 6 && { backgroundColor: "#D6E2F2" }]}>
                        <Text style={[styles.weekDateNum, w.wd === 0 && { color: colors.chili }]}>{w.day}</Text>
                        <Text style={styles.weekDateWd}>{WEEKDAYS[w.wd]}</Text>
                      </View>
                      {busy === w.iso ? (
                        <ActivityIndicator color={colors.bananaLeaf} style={{ flex: 1 }} />
                      ) : plan ? (
                        <View style={styles.weekMealsCol}>
                          {([["sunny", bf], ["restaurant", lu], ["moon", dn]] as const).map(([icon, dish], i) => (
                            <View key={i} style={styles.weekMealLine}>
                              <Ionicons name={icon as any} size={13} color={colors.bananaLeafSoft} style={{ width: 18 }} />
                              {dish ? (
                                <FoodAvatar kind="dish" id={dish.id} category={dish.category} size={30} style={{ marginRight: 8 }} />
                              ) : (
                                <View style={{ width: 38 }} />
                              )}
                              <Text style={styles.weekMealName} numberOfLines={1}>
                                {shortName(dish?.name) || "—"}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.weekEmptyCol}>
                          <Ionicons name="add-circle-outline" size={22} color={colors.bananaLeaf} />
                          <Text style={styles.weekEmptyText}>Tap to plan this day</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {/* Weekday header */}
            {viewMode === "month" || sharing ? (
            <>
            <View style={styles.weekRow}>
              {WEEKDAYS.map((d, i) => (
                <View
                  key={i}
                  style={[
                    styles.weekHead,
                    i === 0 ? styles.weekHeadSun : i === 6 ? styles.weekHeadSat : styles.weekHeadWk,
                  ]}
                >
                  <Text style={[styles.weekHeadText, i === 0 && { color: colors.chili }]}>{d}</Text>
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
                          new Date(c.date + "T00:00:00").getDay() === 0 && { color: colors.chili },
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
                      (() => {
                        const bf = firstDish((plan as any).breakfast);
                        const lu = firstDish((plan as any).lunch);
                        const dn = firstDish((plan as any).dinner);
                        const imgA = bf ?? lu ?? dn;
                        const imgB = lu && imgA?.id !== lu.id ? lu : dn && imgA?.id !== dn.id ? dn : null;
                        return (
                          <View style={styles.cellMeals}>
                            <Text style={styles.cellMealText} numberOfLines={2}>
                              {shortName(bf?.name) || "—"}
                            </Text>
                            <View style={styles.cellImgRow}>
                              {imgA ? (
                                <FoodAvatar kind="dish" id={imgA.id} category={imgA.category} size={28} />
                              ) : null}
                              {imgB ? (
                                <FoodAvatar kind="dish" id={imgB.id} category={imgB.category} size={28} />
                              ) : null}
                            </View>
                            <Text style={styles.cellMealText} numberOfLines={2}>
                              {shortName(lu?.name) || "—"}
                            </Text>
                            <Text style={[styles.cellMealText, styles.cellMealDinner]} numberOfLines={2}>
                              {shortName(dn?.name) || "—"}
                            </Text>
                          </View>
                        );
                      })()
                    ) : (
                      <View style={styles.cellEmptyIcon}>
                        <Ionicons name="add" size={18} color={colors.textMuted} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            </>
            ) : null}

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
              {sharing ? (
                <Text style={styles.exportTagline}>Made with AmmiAI · Tamil kitchen manager</Text>
              ) : null}
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
  monthName: { fontFamily: fonts.headingBold, fontSize: 26, color: colors.textPrimary, textAlign: "center" },
  monthStats: { fontSize: 14.5, fontWeight: "700", color: colors.textMuted, textAlign: "center", marginTop: 2 },
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
  statPillValue: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  statPillLabel: { fontSize: 12.5, color: colors.textMuted, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: 0 },
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
  viewToggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.pill,
    padding: 4,
    marginHorizontal: spacing.m,
    marginBottom: spacing.m,
  },
  viewToggleBtn: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  viewToggleBtnActive: { backgroundColor: colors.bananaLeaf },
  viewToggleText: { fontSize: 15, fontWeight: "800", color: colors.textSecondary },
  viewToggleTextActive: { color: colors.riceWhite },
  weekList: { paddingHorizontal: spacing.m, gap: 10 },
  weekCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    gap: spacing.m,
    ...shadow.card,
  },
  weekCardToday: { borderWidth: 2, borderColor: colors.turmeric },
  weekDateBadge: {
    width: 56,
    height: 64,
    borderRadius: radius.m,
    backgroundColor: "#DCE9D2",
    alignItems: "center",
    justifyContent: "center",
  },
  weekDateNum: { fontFamily: fonts.headingBold, fontSize: 25, color: colors.textPrimary, lineHeight: 29 },
  weekDateWd: { fontSize: 13.5, fontWeight: "800", color: colors.textSecondary },
  weekMealsCol: { flex: 1, gap: 6 },
  weekMealLine: { flexDirection: "row", alignItems: "center" },
  weekMealName: { flex: 1, fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  weekEmptyCol: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 8 },
  weekEmptyText: { fontSize: 15, fontWeight: "700", color: colors.bananaLeaf },
  weekRow: { flexDirection: "row" },
  weekHead: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#C9C3AE",
  },
  weekHeadSun: { backgroundColor: "#F6DBD2" },
  weekHeadWk: { backgroundColor: "#DCE9D2" },
  weekHeadSat: { backgroundColor: "#D6E2F2" },
  weekHeadText: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: 0.4,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    minHeight: 168,
    padding: 3,
    borderWidth: 1,
    borderColor: "#C9C3AE",
    backgroundColor: colors.surface,
  },
  cellBlank: {
    width: `${100 / 7}%`,
    minHeight: 168,
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
    fontSize: 18.5,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.turmeric,
  },
  cellMeals: { flex: 1, justifyContent: "space-evenly", alignItems: "center", marginTop: 2 },
  cellMealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 2,
  },
  cellMealText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
  },
  cellMealDinner: { color: colors.textSecondary, fontWeight: "700" },
  cellImgRow: {
    flexDirection: "row",
    gap: 3,
    marginVertical: 2,
    justifyContent: "center",
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
  legendText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
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
