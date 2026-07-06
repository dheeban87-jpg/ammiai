// Batch 12: global crash gate. In release builds React Native's default
// behaviour for an unhandled JS error is to close the app with no message —
// exactly the "grocery page closes the whole app" symptom. This overrides
// that: ANY unhandled error (render, effect, async) shows a recovery screen
// with copyable details instead of killing the app.
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, spacing } from "@/src/theme";

type Crash = { message: string; stack: string; fatal: boolean };

let _report: ((c: Crash) => void) | null = null;

export function installCrashGuard(): void {
  const EU: any = (global as any).ErrorUtils;
  if (!EU || (installCrashGuard as any)._done) return;
  (installCrashGuard as any)._done = true;
  const prev = EU.getGlobalHandler?.();
  EU.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      _report?.({
        message: String(error?.message ?? error),
        stack: String(error?.stack ?? "").slice(0, 1600),
        fatal: !!isFatal,
      });
    } catch {
      prev?.(error, isFatal);
    }
  });
}

export function CrashGate({ children }: { children: React.ReactNode }) {
  const [crash, setCrash] = useState<Crash | null>(null);

  useEffect(() => {
    installCrashGuard();
    _report = setCrash;
    return () => {
      if (_report === setCrash) _report = null;
    };
  }, []);

  if (!crash) return <>{children}</>;

  const copy = async () => {
    await Clipboard.setStringAsync(`AmmiAI crash\n${crash.message}\n${crash.stack}`);
  };

  return (
    <View style={styles.wrap} testID="global-crash-screen">
      <Ionicons name="medkit" size={42} color={colors.turmeric} />
      <Text style={styles.title}>Caught a crash — app is safe</Text>
      <Text style={styles.sub}>
        Copy the details and send them to the developer, then continue using AmmiAI.
      </Text>
      <ScrollView style={styles.box}>
        <Text style={styles.err}>{crash.message}</Text>
        <Text style={styles.stack}>{crash.stack}</Text>
      </ScrollView>
      <TouchableOpacity style={styles.btn} onPress={copy} testID="global-crash-copy">
        <Ionicons name="copy-outline" size={16} color={colors.riceWhite} />
        <Text style={styles.btnText}>Copy crash details</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btnGhost} onPress={() => setCrash(null)}>
        <Text style={styles.btnGhostText}>Continue using the app</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.l, backgroundColor: colors.riceWhite },
  title: { fontFamily: fonts.headingEn, fontSize: 20, color: colors.textPrimary, marginTop: spacing.m, textAlign: "center" },
  sub: { fontSize: 13.5, color: colors.textSecondary, textAlign: "center", marginTop: 6, marginBottom: spacing.m, lineHeight: 19 },
  box: { maxHeight: 240, alignSelf: "stretch", backgroundColor: colors.surfaceSoft, borderRadius: radius.m, padding: spacing.m },
  err: { fontSize: 13, fontWeight: "800", color: colors.chili },
  stack: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 7, minHeight: 50,
    paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: colors.bananaLeaf, marginTop: spacing.m,
  },
  btnText: { color: colors.riceWhite, fontWeight: "800", fontSize: 15 },
  btnGhost: { minHeight: 48, justifyContent: "center", marginTop: 4 },
  btnGhostText: { color: colors.bananaLeaf, fontWeight: "700", fontSize: 14 },
});
