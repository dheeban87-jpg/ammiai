import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import {
  fireTest,
  NotifPrefs,
  requestPermissionsIfNeeded,
  scheduleAll,
} from "@/src/notifications";

const PRIVACY_URL = "https://ammiai.app/privacy";

type Premium = {
  is_premium: boolean;
  plan?: string | null;
  expires_at?: string | null;
  quota: {
    pantry_used: number;
    pantry_max: number | null;
    plan_generations_used: number;
    plan_generations_max: number | null;
  };
  free_limits: { pantry_max: number; plan_generations_per_month: number };
};

function confirmWeb(title: string, body: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === "web") {
      resolve(window.confirm(`${title}\n\n${body}`));
    } else resolve(true);
  });
}

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile, saveProfile, resetOnboarding, logout } = useAuth();
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [premium, setPremium] = useState<Premium | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState(profile?.name ?? user?.name ?? "");
  const [household, setHousehold] = useState<number>(profile?.household_size ?? 2);
  const [spice, setSpice] = useState<string>(profile?.spice_level ?? "medium");
  const [goals, setGoals] = useState<string[]>(profile?.health?.goals ?? []);

  const load = useCallback(async () => {
    try {
      const [p, prem] = await Promise.all([
        api.get<NotifPrefs>("/api/settings/notifications"),
        api.get<Premium>("/api/premium/status"),
      ]);
      setPrefs(p);
      setPremium(prem);
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // Refresh on focus so a fresh premium purchase reflects here immediately.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const updatePref = async (patch: Partial<NotifPrefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await api.put("/api/settings/notifications", patch);
      const granted = await requestPermissionsIfNeeded();
      if (granted || Platform.OS === "web") await scheduleAll(next);
    } catch {
      /* noop */
    }
  };

  const saveProfilePatch = async () => {
    setSaving(true);
    try {
      await saveProfile({
        name: name.trim(),
        household_size: household,
        spice_level: spice as any,
        health: { ...(profile?.health ?? { goals: [] }), goals },
      });
    } finally {
      setSaving(false);
    }
  };

  const openPaywall = () => router.push("/paywall");

  const deleteAccount = async () => {
    const ok = await confirmWeb(
      "Delete account?",
      "This permanently removes your profile, pantry, plans, and all data. This cannot be undone.",
    );
    if (!ok) return;
    setBusy("delete");
    try {
      await api.del("/api/account");
      await logout();
      router.replace("/sign-in");
    } finally {
      setBusy(null);
    }
  };

  const doLogout = async () => {
    setBusy("logout");
    await logout();
    router.replace("/sign-in");
  };

  const doReset = async () => {
    setBusy("reset");
    try {
      await resetOnboarding();
      router.replace("/onboarding");
    } finally {
      setBusy(null);
    }
  };

  const openReport = () => router.push("/report/weekly");

  return (
    <View style={styles.screen} testID="settings-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.s }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textOnPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* Premium banner */}
        {premium ? (
          <Pressable
            onPress={premium.is_premium ? undefined : openPaywall}
            style={[
              styles.premiumCard,
              premium.is_premium && styles.premiumCardActive,
            ]}
            testID="premium-card"
          >
            <Ionicons
              name={premium.is_premium ? "star" : "star-outline"}
              size={22}
              color={premium.is_premium ? colors.turmeric : colors.bananaLeaf}
            />
            <View style={{ flex: 1, marginLeft: spacing.m }}>
              <Text style={styles.premiumTitle}>
                {premium.is_premium ? "Premium active" : "Upgrade to Premium"}
              </Text>
              <Text style={styles.premiumSub}>
                {premium.is_premium
                  ? `${premium.plan} · unlimited pantry & plans`
                  : `${premium.quota.pantry_used}/${premium.quota.pantry_max} pantry · ${premium.quota.plan_generations_used}/${premium.quota.plan_generations_max} plans this month`}
              </Text>
            </View>
            {!premium.is_premium && (
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            )}
          </Pressable>
        ) : null}

        {/* Weekly report shortcut */}
        <TouchableOpacity onPress={openReport} style={styles.actionRow} testID="settings-report">
          <Ionicons name="stats-chart-outline" size={22} color={colors.turmeric} />
          <View style={{ flex: 1, marginLeft: spacing.m }}>
            <Text style={styles.actionTitle}>Weekly report</Text>
            <Text style={styles.actionHint}>Money saved · waste · balance · badges</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Language — Batch 9 */}
        <Text style={styles.sectionLabel}>{t("settings.language")}</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t("settings.language.hint")}</Text>
          <View style={styles.langRow} testID="settings-language-toggle">
            {(["en", "ta"] as const).map((l) => (
              <TouchableOpacity
                key={l}
                testID={`settings-lang-${l}`}
                onPress={() => setLang(l)}
                style={[styles.langBtn, lang === l && styles.langBtnActive]}
              >
                <Text style={[styles.langBtnText, lang === l && styles.langBtnTextActive]}>
                  {l === "en" ? t("settings.language.en") : t("settings.language.ta")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Profile */}
        <Text style={styles.sectionLabel}>Profile</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            testID="settings-name"
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.rowStepper}>
            <Text style={styles.fieldLabel}>Household size</Text>
            <View style={styles.stepper}>
              <TouchableOpacity onPress={() => setHousehold((n) => Math.max(1, n - 1))} style={styles.sBtn} testID="settings-household-dec">
                <Ionicons name="remove" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.sVal} testID="settings-household">{household}</Text>
              <TouchableOpacity onPress={() => setHousehold((n) => Math.min(10, n + 1))} style={styles.sBtn} testID="settings-household-inc">
                <Ionicons name="add" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.fieldLabel, { marginTop: spacing.m }]}>Spice level</Text>
          <View style={styles.chipRow}>
            {(["mild", "medium", "hot"] as const).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setSpice(s)}
                style={[styles.chip, spice === s && styles.chipActive]}
                testID={`settings-spice-${s}`}
              >
                <Text style={[styles.chipText, spice === s && { color: colors.riceWhite }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldLabel, { marginTop: spacing.m }]}>Goals</Text>
          <View style={styles.chipRow}>
            {["weight_loss", "diabetic_friendly", "bp_friendly", "high_protein", "balanced"].map((g) => {
              const on = goals.includes(g);
              return (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGoals((prev) => (on ? prev.filter((x) => x !== g) : [...prev, g]))}
                  style={[styles.chip, on && styles.chipActive]}
                  testID={`settings-goal-${g}`}
                >
                  <Text style={[styles.chipText, on && { color: colors.riceWhite }]}>{g.replace(/_/g, " ")}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            onPress={saveProfilePatch}
            disabled={saving}
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            testID="settings-save-profile"
          >
            {saving ? <ActivityIndicator color={colors.riceWhite} /> : <Text style={styles.primaryText}>Save profile</Text>}
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        {!prefs ? (
          <View style={styles.card}><ActivityIndicator color={colors.bananaLeaf} /></View>
        ) : (
          <View style={styles.card}>
            <NotifRow
              testID="notif-pantry"
              label="Daily pantry alert"
              hint={`8 am · yellow/red items`}
              value={prefs.pantry_alert_enabled}
              onChange={(v) => updatePref({ pantry_alert_enabled: v })}
              onTest={() => fireTest("pantry")}
            />
            <NotifRow
              testID="notif-meal"
              label="Meal-time reminders"
              hint={`${prefs.breakfast_time} · ${prefs.lunch_time} · ${prefs.dinner_time}`}
              value={prefs.meal_reminders_enabled}
              onChange={(v) => updatePref({ meal_reminders_enabled: v })}
              onTest={() => fireTest("meal")}
            />
            <NotifRow
              testID="notif-cook"
              label="Nightly cook check"
              hint={`${prefs.cook_check_time} · "Did you cook tonight's plan?"`}
              value={prefs.cook_check_enabled}
              onChange={(v) => updatePref({ cook_check_enabled: v })}
              onTest={() => fireTest("cook")}
            />
            <NotifRow
              testID="notif-weekly"
              label="Weekly report"
              hint={`Sun · ${prefs.weekly_report_time}`}
              value={prefs.weekly_report_enabled}
              onChange={(v) => updatePref({ weekly_report_enabled: v })}
              onTest={() => fireTest("weekly")}
              last
            />
            {Platform.OS === "web" ? (
              <Text style={styles.notifHint}>
                Scheduled notifications only fire on a real Android/iOS build. Use &quot;Test&quot; buttons here to preview.
              </Text>
            ) : null}
          </View>
        )}

        {/* Legal + account */}
        <Text style={styles.sectionLabel}>About</Text>
        <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)} style={styles.actionRow} testID="settings-privacy">
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.bananaLeaf} />
          <View style={{ flex: 1, marginLeft: spacing.m }}>
            <Text style={styles.actionTitle}>Privacy policy</Text>
            <Text style={styles.actionHint}>{PRIVACY_URL}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="settings-reset-onboarding"
          style={styles.actionRow}
          onPress={async () => {
            const ok = await confirmWeb("Reset onboarding?", "Clears profile + pantry.");
            if (ok) doReset();
          }}
        >
          <Ionicons name="refresh-outline" size={20} color={colors.turmeric} />
          <View style={{ flex: 1, marginLeft: spacing.m }}>
            <Text style={styles.actionTitle}>Reset onboarding</Text>
            <Text style={styles.actionHint}>Clears profile + pantry, keeps account</Text>
          </View>
          {busy === "reset" ? <ActivityIndicator color={colors.turmeric} /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
        </TouchableOpacity>

        <TouchableOpacity
          testID="settings-logout"
          style={styles.actionRow}
          onPress={async () => {
            const ok = await confirmWeb("Log out?", "You'll need to sign in again.");
            if (ok) doLogout();
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
          <View style={{ flex: 1, marginLeft: spacing.m }}>
            <Text style={styles.actionTitle}>Log out</Text>
          </View>
          {busy === "logout" ? <ActivityIndicator /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
        </TouchableOpacity>

        <TouchableOpacity
          testID="settings-delete-account"
          style={[styles.actionRow, styles.dangerRow]}
          onPress={deleteAccount}
        >
          <Ionicons name="trash-outline" size={20} color={colors.chili} />
          <View style={{ flex: 1, marginLeft: spacing.m }}>
            <Text style={[styles.actionTitle, { color: colors.chili }]}>Delete account</Text>
            <Text style={styles.actionHint}>Permanently removes all your data</Text>
          </View>
          {busy === "delete" ? <ActivityIndicator color={colors.chili} /> : <Ionicons name="chevron-forward" size={18} color={colors.chili} />}
        </TouchableOpacity>

        <Text style={styles.tinyFooter}>AmmiAI · v1.0 · Made with 🌿</Text>
      </ScrollView>
    </View>
  );
}

function NotifRow({
  label,
  hint,
  value,
  onChange,
  onTest,
  testID,
  last,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  onTest: () => void;
  testID: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.notifRow, last && { borderBottomWidth: 0 }]} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={styles.notifLabel}>{label}</Text>
        <Text style={styles.notifHintInline}>{hint}</Text>
      </View>
      <TouchableOpacity
        onPress={onTest}
        style={styles.testBtn}
        testID={`${testID}-test`}
        hitSlop={8}
      >
        <Text style={styles.testBtnText}>Test</Text>
      </TouchableOpacity>
      <Switch
        testID={`${testID}-switch`}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.bananaLeaf, false: colors.border }}
        thumbColor={colors.riceWhite}
      />
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
    flex: 1,
    textAlign: "center",
    fontFamily: fonts.headingEn,
    fontSize: 22,
    color: colors.textOnPrimary,
  },
  body: { padding: spacing.m },
  premiumCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: `${colors.bananaLeaf}44`,
    ...shadow.card,
    marginBottom: spacing.m,
  },
  premiumCardActive: {
    backgroundColor: `${colors.turmeric}12`,
    borderColor: colors.turmeric,
  },
  premiumTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  premiumSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sectionLabel: {
    fontFamily: fonts.headingEn,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginTop: spacing.l,
    marginBottom: spacing.s,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    ...shadow.card,
    marginBottom: spacing.s,
  },
  fieldLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    padding: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.riceWhite,
    marginBottom: spacing.m,
  },
  rowStepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  sBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sVal: { fontFamily: fonts.headingEn, fontSize: 20, minWidth: 30, textAlign: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.bananaLeaf, borderColor: colors.bananaLeaf },
  chipText: { fontSize: 12, color: colors.textPrimary, fontWeight: "600", textTransform: "capitalize" },
  primaryBtn: {
    marginTop: spacing.m,
    backgroundColor: colors.bananaLeaf,
    paddingVertical: 12,
    borderRadius: radius.m,
    alignItems: "center",
  },
  primaryText: { color: colors.riceWhite, fontWeight: "700" },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  notifLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  notifHintInline: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  notifHint: {
    marginTop: spacing.s,
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  testBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: `${colors.turmeric}22`,
    marginRight: 8,
  },
  testBtnText: { color: colors.turmeric, fontSize: 11, fontWeight: "800" },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.m,
    borderRadius: radius.m,
    ...shadow.card,
    marginBottom: spacing.s,
  },
  actionTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  actionHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  dangerRow: { backgroundColor: "#FBECE4", borderWidth: 1, borderColor: `${colors.chili}55` },
  tinyFooter: {
    textAlign: "center",
    marginTop: spacing.l,
    color: colors.textMuted,
    fontSize: 11,
  },
  langRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  langBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.m,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  langBtnActive: {
    borderColor: colors.bananaLeaf,
    backgroundColor: `${colors.bananaLeaf}12`,
  },
  langBtnText: { fontSize: 15, fontWeight: "700", color: colors.textSecondary },
  langBtnTextActive: { color: colors.bananaLeaf },
});
