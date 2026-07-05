// Capt. Charmer — AmmiAI's strict diet-sergeant panda. 🐼🫡
// Floating mascot button + expandable overlay playing 3D clips per "mood",
// with a gruff line bank. Chat brain (Claude-powered) arrives in a later batch —
// this component already exposes the hook for it.
import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";

import { colors, fonts, radius, spacing } from "@/src/theme";
import { PressableScale } from "@/src/components/pressable-scale";

export type CharmerMood =
  | "idle"
  | "point"
  | "whistle"
  | "nod"
  | "wrist_tap"
  | "thumbs_up"
  | "fist_pump";

const CLIPS: Record<CharmerMood, any> = {
  idle: require("../../assets/veeran/clips/idle.mp4"),
  point: require("../../assets/veeran/clips/point.mp4"),
  whistle: require("../../assets/veeran/clips/whistle.mp4"),
  nod: require("../../assets/veeran/clips/nod.mp4"),
  wrist_tap: require("../../assets/veeran/clips/wrist_tap.mp4"),
  thumbs_up: require("../../assets/veeran/clips/thumbs_up.mp4"),
  fist_pump: require("../../assets/veeran/clips/fist_pump.mp4"),
};

const POSTER_IDLE = require("../../assets/veeran/posters/idle.png");

// Gruff line bank — behavior-shaming, never person-shaming. Rare praise hits harder.
const LINES: Record<CharmerMood, string[]> = {
  idle: [
    "Captain Charmer. Reporting for kitchen duty.",
    "A clean pantry is a strong pantry. Carry on.",
    "I'm watching the vegetables. And you.",
  ],
  point: [
    "YOU. Update your pantry. Now.",
    "That plan won't cook itself. Move!",
    "Eyes on the plan, soldier.",
  ],
  whistle: [
    "PHWEEET! Vegetables expiring on my watch? Unacceptable!",
    "Alert! Your keerai has 1 day. ONE. DAY.",
    "Nothing gets wasted in my kitchen. Cook it TODAY.",
  ],
  nod: [
    "Hmm. Cooked as planned. Acceptable.",
    "Not bad, recruit. Not bad.",
    "Discipline noted. Don't let it slip.",
  ],
  wrist_tap: [
    "It's past dinner time. Did you cook or not?",
    "The clock doesn't wait. Neither does your metabolism.",
    "9 PM. Report your meal status, soldier.",
  ],
  thumbs_up: [
    "Outstanding. A full balanced day. I'm... proud. Don't tell anyone I said that.",
    "Zero waste this week. THAT is how it's done.",
    "You earned this one. Carry on.",
  ],
  fist_pump: [
    "Real discipline needs a real plan. Premium gets you the full month. Think about it.",
    "Champions plan ahead. Weekly is good. Monthly is better.",
    "You want results? Commit. I'll be here either way.",
  ],
};

type CharmerCtx = {
  show: (mood?: CharmerMood, line?: string) => void;
};

const Ctx = createContext<CharmerCtx>({ show: () => {} });
export const useCharmer = () => useContext(Ctx);

function pick(mood: CharmerMood): string {
  const arr = LINES[mood];
  return arr[Math.floor(Math.random() * arr.length)];
}

export function CharmerProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<CharmerMood>("idle");
  const [line, setLine] = useState<string>(LINES.idle[0]);
  const badge = useRef(false);

  const player = useVideoPlayer(CLIPS[mood], (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // Switch source when mood changes while open
  React.useEffect(() => {
    player.replace(CLIPS[mood]);
    player.play();
  }, [mood, player]);

  const api = useMemo<CharmerCtx>(
    () => ({
      show: (m = "idle", customLine) => {
        setMood(m);
        setLine(customLine ?? pick(m));
        setOpen(true);
      },
    }),
    [],
  );

  return (
    <Ctx.Provider value={api}>
      {children}

      {/* Floating Captain button */}
      <PressableScale
        style={[styles.fab, { bottom: 66 + insets.bottom }]}
        onPress={() => api.show(badge.current ? "whistle" : "idle")}
        testID="charmer-fab"
      >
        <Image source={POSTER_IDLE} style={styles.fabImg} resizeMode="cover" />
      </PressableScale>

      {/* Overlay */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.videoWrap}>
              <VideoView
                player={player}
                style={styles.video}
                contentFit="cover"
                nativeControls={false}
              />
            </View>
            <Text style={styles.name}>Capt. Charmer</Text>
            <Text style={styles.line}>“{line}”</Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setOpen(false)}
                testID="charmer-dismiss"
              >
                <Text style={styles.btnGhostText}>Yes, Captain</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: spacing.l,
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.turmeric,
    backgroundColor: "#fff",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabImg: { width: "100%", height: "100%" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20,30,20,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.riceWhite ?? "#FBF8EF",
    borderRadius: radius.l ?? 20,
    padding: spacing.l,
    alignItems: "center",
  },
  videoWrap: {
    width: 220,
    height: 220,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  video: { width: "100%", height: "100%" },
  name: {
    fontFamily: fonts.headingBold,
    fontSize: 20,
    color: colors.textPrimary,
    marginTop: spacing.m,
  },
  line: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  row: { flexDirection: "row", marginTop: spacing.l },
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  btnGhost: { backgroundColor: colors.bananaLeaf },
  btnGhostText: { color: "#fff", fontWeight: "700" },
});
