// S4 — Health Connect card. Availability → DPDP consent → read permission →
// today's steps + active kcal. Fails soft to manual logging everywhere. The
// DPDP consent gate is REQUIRED before any Health Connect read is requested.
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import {
  healthConnectAvailable,
  hasHealthPermissions,
  readTodayActivity,
  requestHealthPermissions,
} from "@/src/health-connect";

const CONSENT_KEY = "dpdp_health_consent_v1";

type Phase = "checking" | "unavailable" | "needs_consent" | "ready" | "denied";

export function HealthConnectCard({ onActiveKcal }: { onActiveKcal?: (kcal: number) => void }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("checking");
  const [steps, setSteps] = useState(0);
  const [activeKcal, setActiveKcal] = useState(0);
  const [consentVisible, setConsentVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const syncToday = useCallback(async () => {
    const data = await readTodayActivity();
    if (!data) return;
    setSteps(data.steps);
    setActiveKcal(data.active_kcal);
    onActiveKcal?.(data.active_kcal);
    // Store the daily aggregate (best-effort; never blocks the UI).
    api.post("/api/activity/health-sync", { steps: data.steps, active_kcal: data.active_kcal }).catch(() => {});
  }, [onActiveKcal]);

  const evaluate = useCallback(async () => {
    if (!(await healthConnectAvailable())) {
      setPhase("unavailable");
      return;
    }
    const consented = (await AsyncStorage.getItem(CONSENT_KEY)) === "1";
    if (consented && (await hasHealthPermissions())) {
      setPhase("ready");
      syncToday();
    } else {
      setPhase("needs_consent");
    }
  }, [syncToday]);

  useFocusEffect(
    useCallback(() => {
      evaluate();
    }, [evaluate]),
  );

  const grantAfterConsent = useCallback(async () => {
    setConsentVisible(false);
    setBusy(true);
    try {
      await AsyncStorage.setItem(CONSENT_KEY, "1");
      const granted = await requestHealthPermissions();
      if (granted) {
        setPhase("ready");
        await syncToday();
      } else {
        setPhase("denied");
      }
    } finally {
      setBusy(false);
    }
  }, [syncToday]);

  if (phase === "checking") return null;

  // Unavailable / denied → a quiet one-liner; the manual habit row is the fallback.
  if (phase === "unavailable" || phase === "denied") {
    return (
      <View style={styles.hint} testID="hc-fallback">
        <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
        <Text style={styles.hintText}>
          {phase === "unavailable" ? t("hc.unavailable") : t("hc.denied")}
        </Text>
      </View>
    );
  }

  if (phase === "ready") {
    return (
      <View style={styles.readyCard} testID="hc-ready">
        <View style={styles.readyStat}>
          <Ionicons name="footsteps" size={18} color={colors.bananaLeaf} />
          <Text style={styles.readyVal}>{steps.toLocaleString()}</Text>
          <Text style={styles.readyLbl}>{t("hc.steps")}</Text>
        </View>
        <View style={styles.readyDivider} />
        <View style={styles.readyStat}>
          <Ionicons name="flame" size={18} color={colors.turmeric} />
          <Text style={styles.readyVal}>~{activeKcal}</Text>
          <Text style={styles.readyLbl}>{t("hc.active_kcal")}</Text>
        </View>
      </View>
    );
  }

  // needs_consent
  return (
    <>
      <TouchableOpacity
        style={styles.connectCard}
        onPress={() => setConsentVisible(true)}
        testID="hc-connect"
        activeOpacity={0.9}
        disabled={busy}
      >
        <View style={styles.connectIcon}>
          {busy ? <ActivityIndicator color={colors.riceWhite} /> : <Ionicons name="watch" size={20} color={colors.riceWhite} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.connectTitle}>{t("hc.title")}</Text>
          <Text style={styles.connectSub}>{t("hc.sub")}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.bananaLeaf} />
      </TouchableOpacity>

      <Modal visible={consentVisible} transparent animationType="slide" onRequestClose={() => setConsentVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setConsentVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t("hc.consent_title")}</Text>
            <Text style={styles.sheetBody}>{t("hc.consent_body")}</Text>
            <TouchableOpacity style={styles.agreeBtn} onPress={grantAfterConsent} testID="hc-consent-agree">
              <Text style={styles.agreeText}>{t("hc.consent_agree")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={() => setConsentVisible(false)} testID="hc-consent-skip">
              <Text style={styles.skipText}>{t("hc.consent_skip")}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.s },
  hintText: { fontSize: 12, color: colors.textMuted, flex: 1 },
  connectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.m,
    backgroundColor: `${colors.bananaLeaf}0D`,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: `${colors.bananaLeaf}26`,
    padding: spacing.m,
    marginTop: spacing.s,
  },
  connectIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.bananaLeaf,
    alignItems: "center",
    justifyContent: "center",
  },
  connectTitle: { fontFamily: fonts.headingEn, fontSize: 14.5, color: colors.bananaLeafDark },
  connectSub: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  readyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: spacing.m,
    marginTop: spacing.s,
    ...shadow.card,
  },
  readyStat: { flex: 1, alignItems: "center", gap: 2 },
  readyDivider: { width: 1, height: 34, backgroundColor: colors.border },
  readyVal: { fontFamily: fonts.headingEn, fontSize: 19, color: colors.textPrimary },
  readyLbl: { fontSize: 11, color: colors.textMuted },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: radius.pill, backgroundColor: colors.border, marginBottom: spacing.m },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.l,
    paddingBottom: spacing.xl,
  },
  sheetTitle: { fontFamily: fonts.headingEn, fontSize: 18, color: colors.textPrimary, marginBottom: spacing.s },
  sheetBody: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.l },
  agreeBtn: { backgroundColor: colors.bananaLeaf, borderRadius: radius.m, paddingVertical: 14, alignItems: "center" },
  agreeText: { color: colors.riceWhite, fontWeight: "800", fontSize: 15 },
  skipBtn: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  skipText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
});
