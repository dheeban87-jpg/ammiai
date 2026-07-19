import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCharmer } from "@/src/components/capt-charmer";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/app-header";
import { HealthConnectCard } from "@/src/components/health-connect-card";

// Kill switch for the Health Connect card. Off until the on-device crash is
// reproduced and fixed — see the note at its render site.
const HEALTH_CONNECT_ENABLED = false;
import { NutritionRing } from "@/src/components/nutrition-ring";
import { PressableScale } from "@/src/components/pressable-scale";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useCachedQuery } from "@/src/hooks/use-cached-query";
import { useI18n } from "@/src/i18n";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import type { PantryItem } from "@/src/types";

type Plan = {
  date: string;
  day_totals: { kcal: number; protein_g: number; fiber_g: number };
  day_targets: { kcal: number; protein_g: number; fiber_g: number };
  rings: { kcal: number; protein_g: number; fiber_g: number };
};

type HabitItem = {
  habit: string;
  label: string;
  icon: string;
  needs_duration: boolean;
  done: boolean;
  minutes: number | null;
  kcal_est: number;
  streak: number;
};

type HabitsResp = {
  habits: HabitItem[];
  total_kcal: number;
  streaks: Record<string, number>;
  weight_kg: number | null;
  weight_missing: boolean;
};

type PathLine = { icon: string; tone: "good" | "info"; text: string };

type PathResp = {
  has_target: boolean;
  weight_kg: number | null;
  target_weight_kg: number | null;
  pace_kg_per_week: number | null;
  projected_loss_30d_kg: number | null;
  eta_label: string | null;
  adherence_pct: number;
  burnt_week_kcal: number;
  best_streak: number;
  lines: PathLine[];
  footer: string;
};

const DURATIONS = [15, 30, 45, 60];

// A not-yet-deployed backend (deploy lag) should hide the feature, not error.
const isSoft404 = (e: any) =>
  e?.status === 404 || e?.status === 503 || e?.status === 0;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useI18n();
  const charmer = useCharmer();

  // R1: cache-first — plan + pantry paint instantly from AsyncStorage.
  const planQ = useCachedQuery<Plan>(
    "home.plan",
    useCallback(() => api.get<Plan>("/api/plan/today"), []),
  );
  const pantryQ = useCachedQuery<PantryItem[]>(
    "pantry",
    useCallback(() => api.get<PantryItem[]>("/api/pantry"), []),
  );
  const plan = planQ.data;
  const items = pantryQ.data;

  const [habits, setHabits] = useState<HabitsResp | null>(null);
  const [habitsLive, setHabitsLive] = useState(true);
  const [path, setPath] = useState<PathResp | null>(null);
  const [pathLive, setPathLive] = useState(true);
  const [premium, setPremium] = useState<{ is_premium: boolean; plan?: string } | null>(null);
  const [hcKcal, setHcKcal] = useState(0); // S4: active kcal from Health Connect

  const [pendingHabit, setPendingHabit] = useState<HabitItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const loadHabits = useCallback(async () => {
    try {
      const r = await api.get<HabitsResp>("/api/habits/today");
      setHabits(r);
      setHabitsLive(true);
    } catch (e: any) {
      if (isSoft404(e)) setHabitsLive(false);
    }
  }, []);

  const loadPath = useCallback(async () => {
    try {
      const r = await api.get<PathResp>("/api/insights/path");
      setPath(r);
      setPathLive(true);
    } catch (e: any) {
      if (isSoft404(e)) setPathLive(false);
    }
  }, []);

  const loadPremium = useCallback(async () => {
    try {
      const r = await api.get<{ is_premium: boolean; plan?: string }>("/api/premium/status");
      setPremium(r);
    } catch {
      /* leave badge hidden */
    }
  }, []);

  // Secondary data (already degrades gracefully); refresh on focus.
  useFocusEffect(
    useCallback(() => {
      loadHabits();
      loadPath();
      loadPremium();
    }, [loadHabits, loadPath, loadPremium]),
  );

  const coreStale = planQ.stale || pantryQ.stale;
  const coreUpdating = (planQ.updating || pantryQ.updating) && (planQ.hasData || pantryQ.hasData);

  // ---- Habit interactions (optimistic, syncs in background) ----
  const applyOptimistic = (habit: string, patch: Partial<HabitItem>) =>
    setHabits((prev) =>
      prev
        ? { ...prev, habits: prev.habits.map((x) => (x.habit === habit ? { ...x, ...patch } : x)) }
        : prev,
    );

  const logHabit = useCallback(
    async (h: HabitItem, minutes?: number) => {
      setPendingHabit(null);
      applyOptimistic(h.habit, { done: true, minutes: minutes ?? h.minutes });
      try {
        const r = await api.post<{
          kcal_est: number;
          streak: number;
          milestone: boolean;
        }>("/api/habits/log", { habit: h.habit, minutes });
        if (r.milestone) {
          charmer.show(
            "fist_pump",
            t("home.milestone", { n: r.streak, habit: h.label.toLowerCase() }),
          );
        } else {
          showToast(r.kcal_est ? t("home.toast_kcal", { k: r.kcal_est }) : t("home.toast_logged"));
        }
        loadHabits();
        loadPath();
      } catch (e: any) {
        applyOptimistic(h.habit, { done: false });
        showToast(t("home.couldnt_log"));
      }
    },
    [charmer, showToast, loadHabits, loadPath, t],
  );

  const unlogHabit = useCallback(
    async (h: HabitItem) => {
      applyOptimistic(h.habit, { done: false, kcal_est: 0 });
      try {
        await api.del(`/api/habits/log?habit=${encodeURIComponent(h.habit)}`);
        loadHabits();
        loadPath();
      } catch {
        loadHabits();
      }
    },
    [loadHabits, loadPath],
  );

  const onHabitPress = useCallback(
    (h: HabitItem) => {
      if (h.done) {
        unlogHabit(h);
      } else if (h.needs_duration) {
        setPendingHabit(h);
      } else {
        logHabit(h);
      }
    },
    [logHabit, unlogHabit],
  );

  // ---- Derived ----
  const hour = new Date().getHours();
  const timeLabel =
    hour < 12
      ? t("home.greet_morning")
      : hour < 17
        ? t("home.greet_afternoon")
        : t("home.greet_evening");
  const name = user?.name?.split(" ")[0] ?? "soldier";
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const topStreak = habits
    ? Math.max(0, ...habits.habits.map((h) => (h.done ? h.streak : 0)))
    : 0;

  const expiring = (items ?? []).filter(
    (i) => i.freshness === "red" || i.freshness === "yellow",
  );

  // S4: manual habit kcal + Health Connect active kcal both feed "burnt today".
  const burnt = (habits?.total_kcal ?? 0) + hcKcal;
  const net =
    plan != null
      ? Math.round(plan.day_totals.kcal - plan.day_targets.kcal - burnt)
      : null;
  const goalDelta =
    path?.weight_kg != null && path?.target_weight_kg != null
      ? Math.round((path.weight_kg - path.target_weight_kg) * 10) / 10
      : null;

  return (
    <View style={styles.screen} testID="home-screen">
      <AppHeader
        title="AmmiAI"
        subtitleTa="உங்கள் தமிழ் சமையலறை உதவியாளர்"
        onLongPress={() => router.push("/settings")}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {premium?.is_premium ? (
              <View style={styles.premiumPill} testID="home-premium-badge">
                <Ionicons name="star" size={12} color={colors.bananaLeafDark} />
                <Text style={styles.premiumPillText}>{t("home.premium_badge")}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              testID="home-dev-menu"
              onPress={() => router.push("/settings")}
              style={styles.iconBtn}
              hitSlop={10}
            >
              <Ionicons name="settings-outline" size={20} color={colors.riceWhite} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* A1 — greeting strip */}
        <View style={styles.greetRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetHi} testID="home-greeting">
              {timeLabel}, {name}
            </Text>
            <Text style={styles.greetDate}>
              {dateLabel}
              {coreUpdating ? ` · ${t("home.updating")}` : ""}
            </Text>
          </View>
          {topStreak >= 2 ? (
            <View style={styles.streakChip} testID="home-streak">
              <Text style={styles.streakEmoji}>🔥</Text>
              <Text style={styles.streakText}>{t("home.streak", { n: topStreak })}</Text>
            </View>
          ) : null}
        </View>

        {coreStale ? (
          <View style={styles.staleBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color="#9A6A05" />
            <Text style={styles.staleText}>{t("home.stale")}</Text>
          </View>
        ) : null}

        {/* A2 — Today's progress hero */}
        <PressableScale
          style={styles.hero}
          onPress={() => router.push("/(tabs)/plan")}
          testID="home-hero"
        >
          <View style={styles.heroHead}>
            <Text style={styles.heroTitle}>{t("home.today_progress")}</Text>
            <Text style={styles.heroLink}>{t("home.see_plan")}</Text>
          </View>

          {plan ? (
            <View style={styles.ringsRow}>
              <NutritionRing
                delay={0}
                size={78}
                strokeWidth={9}
                progress={plan.rings.kcal}
                color={colors.bananaLeaf}
                label={t("home.ring_calories")}
                value={`${Math.round(plan.day_totals.kcal)}`}
                hint={`/ ${Math.round(plan.day_targets.kcal)}`}
              />
              <NutritionRing
                delay={120}
                size={78}
                strokeWidth={9}
                progress={plan.rings.protein_g}
                color={colors.chili}
                label={t("home.ring_protein")}
                value={`${Math.round(plan.day_totals.protein_g)}g`}
                hint={`/ ${Math.round(plan.day_targets.protein_g)}g`}
              />
              <NutritionRing
                delay={240}
                size={78}
                strokeWidth={9}
                progress={plan.rings.fiber_g}
                color={colors.turmeric}
                label={t("home.ring_fiber")}
                value={`${Math.round(plan.day_totals.fiber_g)}g`}
                hint={`/ ${Math.round(plan.day_targets.fiber_g)}g`}
              />
            </View>
          ) : (
            <View style={styles.center}>
              <ActivityIndicator color={colors.bananaLeaf} />
            </View>
          )}

          {/* hero stat strip */}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Ionicons name="flame" size={15} color={colors.turmeric} />
              <Text style={styles.heroStatVal}>~{burnt}</Text>
              <Text style={styles.heroStatLbl}>{t("home.burnt_today")}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              {net != null ? (
                <>
                  <Ionicons
                    name={net <= 0 ? "arrow-down" : "arrow-up"}
                    size={15}
                    color={net <= 0 ? colors.bananaLeaf : colors.chili}
                  />
                  <Text
                    style={[
                      styles.heroStatVal,
                      { color: net <= 0 ? colors.bananaLeaf : colors.chili },
                    ]}
                  >
                    {net > 0 ? `+${net}` : net}
                  </Text>
                </>
              ) : (
                <Text style={styles.heroStatVal}>—</Text>
              )}
              <Text style={styles.heroStatLbl}>{t("home.net_kcal")}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            {goalDelta != null ? (
              <View style={styles.heroStat}>
                <Ionicons name="flag" size={15} color={colors.bananaLeaf} />
                <Text style={styles.heroStatVal}>{Math.abs(goalDelta)}kg</Text>
                <Text style={styles.heroStatLbl}>{t("home.to_goal")}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.heroStat}
                onPress={() => router.push("/settings")}
              >
                <Ionicons name="flag-outline" size={15} color={colors.textMuted} />
                <Text style={[styles.heroStatVal, { fontSize: 13, color: colors.bananaLeaf }]}>
                  {t("home.set_goal")}
                </Text>
                <Text style={styles.heroStatLbl}>{t("home.weight_target")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </PressableScale>

        {/* S4 — Health Connect auto-activity. HIDDEN (owner, 2026-07-19):
            tapping "Captain wants to track" hard-crashes the app on device,
            even after the manifest <queries> fix. Rather than ship a crash we
            show nothing; the manual habit row below already covers activity.
            Flip back on only after it's verified on a real device. */}
        {HEALTH_CONNECT_ENABLED ? <HealthConnectCard onActiveKcal={setHcKcal} /> : null}

        {/* A3 — Habit builder row */}
        {habitsLive && habits ? (
          <View style={styles.habitBlock}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{t("home.habits_title")}</Text>
              <Text style={styles.sectionHint}>{t("home.habits_hint")}</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.habitScroll}
            >
              {habits.habits.map((h) => (
                <HabitButton
                  key={h.habit}
                  habit={h}
                  onPress={() => onHabitPress(h)}
                  onLongPress={() => h.done && unlogHabit(h)}
                />
              ))}
            </ScrollView>
            {habits.weight_missing ? (
              <TouchableOpacity
                style={styles.weightHint}
                onPress={() => router.push("/settings")}
              >
                <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                <Text style={styles.weightHintText}>{t("home.weight_hint")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* A4 — Your path */}
        {pathLive && path && path.lines.length > 0 ? (
          <View style={styles.pathCard} testID="home-path">
            <View style={styles.pathHead}>
              <Ionicons name="trail-sign" size={16} color={colors.bananaLeaf} />
              <Text style={styles.pathTitle}>{t("home.path_title")}</Text>
            </View>
            {path.lines.map((ln, i) => (
              <View key={i} style={styles.pathLine}>
                <Ionicons
                  name={(ln.icon as any) ?? "ellipse"}
                  size={16}
                  color={ln.tone === "good" ? colors.bananaLeaf : colors.turmeric}
                  style={{ marginTop: 1 }}
                />
                <Text style={styles.pathLineText}>{ln.text}</Text>
              </View>
            ))}
            {!path.has_target ? (
              <TouchableOpacity
                style={styles.pathCta}
                onPress={() => router.push("/settings")}
              >
                <Text style={styles.pathCtaText}>{t("home.path_cta")}</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.pathFooter}>{path.footer}</Text>
          </View>
        ) : null}

        {/* A6 — compact utility rows */}
        <UtilityRow
          icon="alarm"
          tint={colors.turmeric}
          title={
            expiring.length > 0
              ? t("home.expiring", { n: expiring.length })
              : t("home.fresh")
          }
          sub={expiring.length > 0 ? t("home.expiring_sub") : t("home.fresh_sub")}
          onPress={() => router.push("/(tabs)/pantry")}
        />
        <UtilityRow
          icon="restaurant"
          tint={colors.bananaLeaf}
          title={t("home.cook_title")}
          sub={t("home.cook_sub")}
          onPress={() => router.push("/cook")}
        />

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Duration picker sheet */}
      <Modal
        visible={pendingHabit != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingHabit(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPendingHabit(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t("home.duration_q")}</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={styles.durationChip}
                  onPress={() => pendingHabit && logHabit(pendingHabit, m)}
                  testID={`duration-${m}`}
                >
                  <Text style={styles.durationChipText}>{m}</Text>
                  <Text style={styles.durationChipUnit}>min</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.sheetNote}>{t("home.est_disclaimer")}</Text>
          </Pressable>
        </Pressable>
      </Modal>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 84 }]} testID="home-toast">
          <Ionicons name="checkmark-circle" size={18} color={colors.riceWhite} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

function HabitButton({
  habit,
  onPress,
  onLongPress,
}: {
  habit: HabitItem;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const done = habit.done;
  return (
    <PressableScale
      style={styles.habitItem}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      testID={`habit-${habit.habit}`}
    >
      <View style={[styles.habitCircle, done && styles.habitCircleDone]}>
        <Ionicons
          name={(habit.icon as any) ?? "ellipse"}
          size={24}
          color={done ? colors.riceWhite : colors.bananaLeaf}
        />
        {done ? (
          <View style={styles.habitCheck}>
            <Ionicons name="checkmark" size={11} color={colors.bananaLeaf} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.habitLabel, done && { color: colors.bananaLeaf, fontWeight: "700" }]} numberOfLines={1}>
        {habit.label}
      </Text>
      {done && habit.streak >= 2 ? (
        <Text style={styles.habitStreak}>{habit.streak}d 🔥</Text>
      ) : (
        <Text style={styles.habitStreakGhost}> </Text>
      )}
    </PressableScale>
  );
}

function UtilityRow({
  icon,
  tint,
  title,
  sub,
  onPress,
}: {
  icon: any;
  tint: string;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <PressableScale style={styles.utilRow} onPress={onPress}>
      <View style={[styles.utilIcon, { backgroundColor: `${tint}1A` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.utilTitle}>{title}</Text>
        <Text style={styles.utilSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </PressableScale>
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
  premiumPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.turmeric,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  premiumPillText: {
    color: colors.bananaLeafDark,
    fontSize: 12,
    fontWeight: "800",
  },

  // Greeting
  greetRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.s },
  greetHi: {
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  greetDate: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  streakChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: `${colors.turmeric}1F`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  streakEmoji: { fontSize: 13 },
  streakText: { fontSize: 12.5, fontWeight: "800", color: "#9A6A05" },

  staleBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${colors.turmeric}1F`,
    borderRadius: radius.m,
    padding: spacing.m,
    marginTop: spacing.m,
  },
  staleText: { color: "#9A6A05", flex: 1, fontSize: 12.5 },

  // Hero
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    marginTop: spacing.m,
    ...shadow.card,
  },
  heroHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.s,
  },
  heroTitle: { fontFamily: fonts.headingEn, fontSize: 16, color: colors.textPrimary },
  heroLink: { fontSize: 13, color: colors.bananaLeaf, fontWeight: "700" },
  ringsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: spacing.xs,
  },
  center: { alignItems: "center", paddingVertical: spacing.l },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.m,
    paddingTop: spacing.m,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  heroStat: { flex: 1, alignItems: "center", gap: 2 },
  heroStatDivider: { width: 1, height: 34, backgroundColor: colors.border },
  heroStatVal: {
    fontFamily: fonts.headingEn,
    fontSize: 18,
    color: colors.textPrimary,
  },
  heroStatLbl: { fontSize: 11, color: colors.textMuted },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
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
  sectionHint: { fontSize: 12, color: colors.textMuted },

  // Habit row
  habitBlock: {},
  habitScroll: { gap: spacing.s, paddingVertical: 2, paddingRight: spacing.m },
  habitItem: { alignItems: "center", width: 66 },
  habitCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: `${colors.bananaLeaf}55`,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  habitCircleDone: {
    backgroundColor: colors.bananaLeaf,
    borderColor: colors.bananaLeaf,
  },
  habitCheck: {
    position: "absolute",
    right: -2,
    top: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.riceWhite,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bananaLeaf,
  },
  habitLabel: {
    fontSize: 11.5,
    color: colors.textSecondary,
    marginTop: 5,
    textAlign: "center",
  },
  habitStreak: { fontSize: 10.5, color: colors.turmeric, fontWeight: "800", marginTop: 1 },
  habitStreakGhost: { fontSize: 10.5, marginTop: 1 },
  weightHint: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.s },
  weightHintText: { fontSize: 12, color: colors.textMuted, flex: 1 },

  // Path card
  pathCard: {
    backgroundColor: `${colors.bananaLeaf}0D`,
    borderRadius: radius.l,
    padding: spacing.m,
    marginTop: spacing.l,
    borderWidth: 1,
    borderColor: `${colors.bananaLeaf}26`,
  },
  pathHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.s },
  pathTitle: { fontFamily: fonts.headingEn, fontSize: 15, color: colors.bananaLeaf },
  pathLine: { flexDirection: "row", gap: 8, marginBottom: 8 },
  pathLineText: { flex: 1, fontSize: 13.5, color: colors.textPrimary, lineHeight: 19 },
  pathCta: { marginTop: 2, marginBottom: 6 },
  pathCtaText: { color: colors.bananaLeaf, fontWeight: "700", fontSize: 13.5 },
  pathFooter: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    fontStyle: "italic",
  },

  // Utility rows
  utilRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.m,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    marginTop: spacing.s,
    ...shadow.card,
  },
  utilIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  utilTitle: { fontSize: 14.5, fontWeight: "700", color: colors.textPrimary },
  utilSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },

  // Duration sheet
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.l,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.m,
  },
  sheetTitle: {
    fontFamily: fonts.headingEn,
    fontSize: 17,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.l,
  },
  durationRow: { flexDirection: "row", gap: spacing.s, justifyContent: "space-between" },
  durationChip: {
    flex: 1,
    backgroundColor: `${colors.bananaLeaf}12`,
    borderRadius: radius.m,
    paddingVertical: spacing.m,
    alignItems: "center",
    borderWidth: 1,
    borderColor: `${colors.bananaLeaf}26`,
  },
  durationChipText: {
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.bananaLeaf,
  },
  durationChipUnit: { fontSize: 11, color: colors.textMuted },
  sheetNote: {
    fontSize: 11.5,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.l,
    fontStyle: "italic",
  },

  // Toast
  toast: {
    position: "absolute",
    left: spacing.m,
    right: spacing.m,
    backgroundColor: colors.bananaLeaf,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.m,
    paddingVertical: 12,
    ...shadow.card,
  },
  toastText: { color: colors.riceWhite, flex: 1, fontSize: 13.5, fontWeight: "700" },
});
