// Handles the ammiai://auth-callback deep link after Emergent Google Auth.
// On Android, if openAuthSessionAsync doesn't intercept the redirect (some
// OEMs / cold launches), the OS deep-links into the app with the session_id
// on the hash or query. This route parses it, hands it to the auth context,
// then routes home.
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { colors, fonts, radius, spacing } from "@/src/theme";

function extractSessionId(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // Try hash first (Emergent auth uses fragment), then query.
    const hash = parsed.hash.replace(/^#/, "");
    const search = parsed.search.replace(/^\?/, "");
    const q = new URLSearchParams(hash || search);
    return q.get("session_id");
  } catch {
    return null;
  }
}

export default function AuthCallback() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const { processGoogleSessionId, status } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;

    const run = async () => {
      // 1) Try params from expo-router (works if params are on the query)
      let sid: string | null = params?.session_id ?? null;
      // 2) Otherwise pull the initial URL and parse hash/query manually.
      if (!sid) {
        const initial = await Linking.getInitialURL();
        sid = extractSessionId(initial);
      }
      if (!sid) {
        setError("No session id found in callback URL.");
        return;
      }
      try {
        done.current = true;
        await processGoogleSessionId(sid);
        // Auth state flips to `authed`; root layout will redirect.
        router.replace("/");
      } catch (e: any) {
        setError(e?.message ?? "Google sign-in failed to complete.");
      }
    };
    run();
  }, [params?.session_id, processGoogleSessionId, router]);

  // If somehow auth context already flipped to authed, just go home.
  useEffect(() => {
    if (status === "authed") router.replace("/");
  }, [status, router]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 80 }]} testID="auth-callback-screen">
      <View style={styles.logoWrap}>
        <Ionicons name="leaf" size={38} color={colors.bananaLeaf} />
      </View>
      <Text style={styles.brand}>AmmiAI</Text>
      {error ? (
        <>
          <Text style={styles.title}>Sign-in couldn&apos;t complete</Text>
          <Text style={styles.body}>{error}</Text>
          <TouchableOpacity
            testID="auth-callback-retry"
            style={styles.btn}
            onPress={() => router.replace("/sign-in")}
          >
            <Text style={styles.btnText}>Back to sign in</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.bananaLeaf} style={{ marginTop: spacing.xl }} />
          <Text style={styles.title}>Signing you in…</Text>
          <Text style={styles.body}>Just a moment while we complete Google sign-in.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.riceWhite,
    alignItems: "center",
    paddingHorizontal: spacing.l,
  },
  logoWrap: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.m,
  },
  brand: {
    color: colors.textPrimary,
    fontFamily: fonts.headingEn,
    fontSize: 34,
    lineHeight: 38,
  },
  title: {
    marginTop: spacing.xl,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    marginTop: spacing.s,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    marginTop: spacing.xl,
    backgroundColor: colors.bananaLeaf,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.m,
  },
  btnText: { color: colors.textOnPrimary, fontWeight: "600" },
});
