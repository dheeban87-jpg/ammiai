// IntroGate — company logo animation → (first run) welcome → app.
// Rendered as a full-screen overlay ON TOP of the app tree, so the app
// warm-starts (fonts, auth, first API fetches) behind it at ~0 extra cost.
//
// Owner-tunable constants:
//   INTRO_SOUND      — logo plays muted by default; flip to true for audio.
//   INTRO_EVERY_OPEN — logo plays on every cold start; flip to false to make
//                      the whole intro first-run-only (no refactor needed).
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radius, spacing } from "@/src/theme";

const INTRO_SOUND = true; // owner wants the logo's sound design; flip to false to mute
const INTRO_EVERY_OPEN = true;
const SEEN_KEY = "intro_seen_v1";
const COMPANY_CREDIT = "Crafted by Amazedge — Crafted to Fit";
const CAPTAIN_LINE =
  "Reporting for duty, soldier — let's cook smart and eat well. 🐼🫡";

const LOGO_SRC = require("../../assets/intro/intro_logo.mp4");
const WELCOME_SRC = require("../../assets/intro/intro_subtle.mp4");

// Only run once per process (a cold start = new process). This is what keeps
// the intro OFF on hot resume (background → foreground never remounts root).
let INTRO_SHOWN_THIS_PROCESS = false;

type Phase = "logo" | "welcome" | "done";

export function IntroGate() {
  const insets = useSafeAreaInsets();
  const alreadyShown = INTRO_SHOWN_THIS_PROCESS;
  if (!alreadyShown) INTRO_SHOWN_THIS_PROCESS = true;

  const [phase, setPhase] = useState<Phase>(alreadyShown ? "done" : "logo");
  const [showSkip, setShowSkip] = useState(false);
  const firstRunRef = useRef<boolean>(false);
  const advancedRef = useRef(false);

  const logoPlayer = useVideoPlayer(LOGO_SRC, (p) => {
    p.loop = false;
    p.muted = !INTRO_SOUND;
    p.play();
  });
  const welcomePlayer = useVideoPlayer(WELCOME_SRC, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const finish = useCallback(() => {
    setPhase("done");
    try {
      logoPlayer.pause();
      welcomePlayer.pause();
    } catch {
      /* player already released */
    }
  }, [logoPlayer, welcomePlayer]);

  // Advance from the logo: first run → welcome, otherwise straight to the app.
  const advanceFromLogo = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    if (firstRunRef.current) {
      setPhase("welcome");
    } else {
      finish();
    }
  }, [finish]);

  const completeWelcome = useCallback(() => {
    AsyncStorage.setItem(SEEN_KEY, "1").catch(() => {});
    finish();
  }, [finish]);

  // Figure out first-run + honour INTRO_EVERY_OPEN=false.
  useEffect(() => {
    if (phase === "done") return;
    let cancelled = false;
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => {
        if (cancelled) return;
        firstRunRef.current = v == null;
        // If the owner made the intro first-run-only and it's been seen,
        // don't show the logo at all.
        if (!INTRO_EVERY_OPEN && v != null) finish();
      })
      .catch(() => {
        // Storage failure shouldn't trap the user behind the intro.
        firstRunRef.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [phase, finish]);

  // Skip button fades in after 800ms; safety timer auto-advances the ~3s logo
  // if the "ended" event never fires (broken asset / codec).
  useEffect(() => {
    if (phase !== "logo") return;
    const skipT = setTimeout(() => setShowSkip(true), 800);
    const maxT = setTimeout(() => advanceFromLogo(), 5000);
    return () => {
      clearTimeout(skipT);
      clearTimeout(maxT);
    };
  }, [phase, advanceFromLogo]);

  // Logo playback events: end → advance; error → fail open to the app.
  useEffect(() => {
    if (phase !== "logo") return;
    const subs: { remove: () => void }[] = [];
    try {
      subs.push(logoPlayer.addListener("playToEnd", () => advanceFromLogo()));
      subs.push(
        logoPlayer.addListener("statusChange", ({ status }: any) => {
          if (status === "error") advanceFromLogo();
        }),
      );
    } catch {
      // If listeners can't attach, the 5s safety timer still advances.
    }
    return () => subs.forEach((s) => s.remove());
  }, [phase, logoPlayer, advanceFromLogo]);

  // Start the welcome loop when we reach it; fail open on error.
  useEffect(() => {
    if (phase !== "welcome") return;
    try {
      welcomePlayer.play();
    } catch {
      completeWelcome();
    }
    let sub: { remove: () => void } | null = null;
    try {
      sub = welcomePlayer.addListener("statusChange", ({ status }: any) => {
        if (status === "error") completeWelcome();
      });
    } catch {
      /* noop */
    }
    return () => sub?.remove();
  }, [phase, welcomePlayer, completeWelcome]);

  // Android back = skip the current step.
  useEffect(() => {
    if (phase === "done") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (phase === "logo") advanceFromLogo();
      else if (phase === "welcome") completeWelcome();
      return true; // swallow the back press while the intro is up
    });
    return () => sub.remove();
  }, [phase, advanceFromLogo, completeWelcome]);

  if (phase === "done") return null;

  return (
    <View style={styles.fill} pointerEvents="auto" testID="intro-gate">
      {phase === "logo" ? (
        <View style={styles.logoScreen}>
          <VideoView
            player={logoPlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
          {showSkip ? (
            <Pressable
              onPress={advanceFromLogo}
              style={[styles.skipBtn, { top: insets.top + spacing.s }]}
              hitSlop={12}
              testID="intro-skip"
            >
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.welcomeScreen} testID="intro-welcome">
          <VideoView
            player={welcomePlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
          {/* Bottom scrim carries the copy + CTA over the video */}
          <View style={styles.scrim} />
          <View style={[styles.welcomeContent, { paddingBottom: insets.bottom + spacing.l }]}>
            <Text style={styles.captainLine}>{CAPTAIN_LINE}</Text>
            <Pressable
              style={styles.getStarted}
              onPress={completeWelcome}
              testID="intro-get-started"
            >
              <Text style={styles.getStartedText}>Get started</Text>
            </Pressable>
            <Text style={styles.credit}>{COMPANY_CREDIT}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  logoScreen: { flex: 1, backgroundColor: "#ECECEC" },
  skipBtn: {
    position: "absolute",
    right: spacing.m,
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  skipText: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  welcomeScreen: { flex: 1, backgroundColor: colors.bananaLeafDark },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "42%",
    backgroundColor: "rgba(10,20,12,0.42)",
  },
  welcomeContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.l,
    alignItems: "center",
  },
  captainLine: {
    color: "#FBF8EF",
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
    fontWeight: "600",
    marginBottom: spacing.l,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  getStarted: {
    backgroundColor: colors.bananaLeaf,
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    alignSelf: "stretch",
    alignItems: "center",
    ...({
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 5,
    } as const),
  },
  getStartedText: {
    color: "#FBF8EF",
    fontFamily: fonts.headingEn,
    fontSize: 18,
  },
  credit: {
    color: "rgba(251,248,239,0.9)",
    fontSize: 12.5,
    marginTop: spacing.m,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
