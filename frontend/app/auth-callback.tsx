// Handles the ammiai://auth-callback deep link after Emergent Google Auth.
//
// APK-specific: when Android intent-filters the redirect back into the app,
// the URL can arrive via several channels — Linking.getInitialURL() on cold
// start, or Linking.addEventListener("url", …) if the app is already alive,
// or (rarely) as query params on the expo-router route. This screen listens
// to ALL THREE and uses a defensive string-based parser (see
// src/utils/parse-callback.ts) that survives `ammiai:///path` triple-slash
// deliveries and #fragment credentials.
//
// Loud console.log lines (prefix `[auth-callback]`) are intentional so
// `adb logcat -s ReactNativeJS` on the standalone APK reveals exactly what
// URL landed and where the parse succeeded.
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { clearBufferedUrl, getBufferedUrl, onBufferedUrl } from "@/src/url-buffer";
import { parseAuthCallbackUrl, redactCallbackUrl } from "@/src/utils/parse-callback";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function AuthCallback() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ session_id?: string; code?: string; token?: string }>();
  const { processGoogleSessionId, status } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [diagUrl, setDiagUrl] = useState<string | null>(null);
  const [rawParts, setRawParts] = useState<{ q: string; f: string } | null>(null);
  const done = useRef(false);

  const attempt = useCallback(
    async (source: string, url: string | null | undefined, sidFromRouter?: string | null) => {
      if (done.current) return;
      const parsed = parseAuthCallbackUrl(url);
      const sid = sidFromRouter || parsed.sessionId;
      // Loud, redacted log for adb logcat.
      console.log(
        `[auth-callback] source=${source} url=${redactCallbackUrl(url)} ` +
          `parsed_key=${parsed.found_key} sid=${sid ? sid.slice(0, 4) + "…" : "<null>"}`,
      );
      setDiagUrl(redactCallbackUrl(url));
      setRawParts({ q: parsed.raw_query, f: parsed.raw_fragment });
      if (!sid) return;
      done.current = true;
      try {
        await processGoogleSessionId(sid);
        clearBufferedUrl();
        router.replace("/");
      } catch (e: any) {
        console.error("[auth-callback] processGoogleSessionId failed:", e?.message);
        setError(e?.message ?? "Google sign-in failed to complete.");
        done.current = false;
      }
    },
    [processGoogleSessionId, router],
  );

  // 0a) PRIMARY FIX: the boot-time URL buffer. The redirect URL that
  //     navigated us here was captured by src/url-buffer.ts at app boot,
  //     before this screen existed — so the race that produced <null> is gone.
  useEffect(() => {
    const buffered = getBufferedUrl();
    if (buffered) attempt("boot_buffer", buffered);
    const unsub = onBufferedUrl((url) => attempt("boot_buffer_live", url));
    return unsub;
  }, [attempt]);

  // 0b) expo-linking's useURL() replays the most recent URL to late mounters.
  const hookUrl = Linking.useURL();
  useEffect(() => {
    if (hookUrl) attempt("use_url_hook", hookUrl);
  }, [hookUrl, attempt]);

  // 1) Try expo-router params (session_id could ride the query).
  useEffect(() => {
    const sid = params?.session_id || params?.code || params?.token || null;
    if (sid) attempt("router_params", `?session_id=${sid}`, sid);
  }, [params?.session_id, params?.code, params?.token, attempt]);

  // 2) Cold-start URL (app was closed when the intent fired).
  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => {
        console.log(`[auth-callback] getInitialURL → ${redactCallbackUrl(url)}`);
        attempt("initial_url", url);
      })
      .catch((err) => console.warn("[auth-callback] getInitialURL error:", err?.message));
  }, [attempt]);

  // 3) Warm-start URL (app was alive; intent-filter delivered a URL to us).
  useEffect(() => {
    const sub = Linking.addEventListener("url", (evt) => {
      console.log(`[auth-callback] Linking event → ${redactCallbackUrl(evt.url)}`);
      attempt("linking_event", evt.url);
    });
    return () => sub.remove();
  }, [attempt]);

  // 4) If none of the above yields a session_id after ~2s, surface a clear
  //    error state instead of hanging on the spinner forever.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!done.current && !error) {
        setError(
          "No session id found in callback URL.\n" +
            "The redirect from Google didn't include the credentials Android expected.\n" +
            "Please try again, or use phone sign-in instead.",
        );
      }
    }, 3500);
    return () => clearTimeout(t);
  }, [error]);

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
          {diagUrl ? (
            <View style={styles.diag} testID="auth-callback-diag">
              <Text style={styles.diagLabel}>Callback URL received</Text>
              <Text style={styles.diagValue} numberOfLines={4} selectable>
                {diagUrl}
              </Text>
              {rawParts && (rawParts.q || rawParts.f) ? (
                <Text style={styles.diagValue} selectable>
                  query=&quot;{rawParts.q || "<empty>"}&quot;{"\n"}
                  fragment=&quot;{rawParts.f || "<empty>"}&quot;
                </Text>
              ) : null}
            </View>
          ) : null}
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
  diag: {
    marginTop: spacing.l,
    padding: spacing.m,
    borderRadius: radius.m,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "stretch",
  },
  diagLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  diagValue: {
    color: colors.textPrimary,
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 16,
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
