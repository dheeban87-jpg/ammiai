import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { useAuth } from "@/src/auth-context";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

export default function DevMenu() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile, logout, resetOnboarding } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const doReset = async () => {
    setBusy("reset");
    try {
      await resetOnboarding();
      router.replace("/onboarding");
    } finally {
      setBusy(null);
    }
  };

  const doLogout = async () => {
    setBusy("logout");
    try {
      await logout();
      router.replace("/sign-in");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.screen} testID="dev-menu-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.s }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textOnPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Dev menu</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Signed in</Text>
          <Text style={styles.cardValue}>
            {user?.name} · {user?.email || user?.phone}
          </Text>
          <Text style={styles.cardSub}>
            User ID: {user?.user_id} · provider: {user?.auth_provider}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Profile</Text>
          <Text style={styles.cardValue}>
            {profile?.diet ?? "—"} · house {profile?.household_size ?? "—"} · spice{" "}
            {profile?.spice_level ?? "—"}
          </Text>
          <Text style={styles.cardSub}>
            Favorites: {profile?.favorites?.length ?? 0} · Avoids:{" "}
            {(profile?.allergies?.length ?? 0) + (profile?.custom_avoid?.length ?? 0)}
          </Text>
          {profile?.health?.bmi ? (
            <Text style={styles.cardSub}>BMI: {profile.health.bmi}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          testID="dev-reset-onboarding"
          style={styles.actionRow}
          onPress={() =>
            Alert.alert(
              "Reset onboarding?",
              "This clears your profile and pantry so you can run onboarding again.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Reset", style: "destructive", onPress: doReset },
              ],
            )
          }
          disabled={busy != null}
        >
          <Ionicons name="refresh" size={22} color={colors.turmeric} />
          <View style={{ flex: 1, marginLeft: spacing.m }}>
            <Text style={styles.actionTitle}>Reset onboarding</Text>
            <Text style={styles.actionHint}>Clears profile + pantry</Text>
          </View>
          {busy === "reset" ? (
            <ActivityIndicator color={colors.turmeric} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          testID="dev-logout"
          style={styles.actionRow}
          onPress={() =>
            Alert.alert("Log out?", "You'll need to sign in again.", [
              { text: "Cancel", style: "cancel" },
              { text: "Log out", style: "destructive", onPress: doLogout },
            ])
          }
          disabled={busy != null}
        >
          <Ionicons name="log-out-outline" size={22} color={colors.chili} />
          <View style={{ flex: 1, marginLeft: spacing.m }}>
            <Text style={styles.actionTitle}>Log out</Text>
            <Text style={styles.actionHint}>Clears session</Text>
          </View>
          {busy === "logout" ? (
            <ActivityIndicator color={colors.chili} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Long-press the AmmiAI header on Home to open this menu.
        </Text>
      </ScrollView>
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
  body: { padding: spacing.m, gap: spacing.m },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.m,
    ...shadow.card,
  },
  cardTitle: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.textSecondary,
    fontWeight: "700",
  },
  cardValue: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  cardSub: { marginTop: 4, fontSize: 12, color: colors.textMuted },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.m,
    borderRadius: radius.m,
    ...shadow.card,
  },
  actionTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  actionHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  footerNote: {
    marginTop: spacing.l,
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 12,
  },
});
