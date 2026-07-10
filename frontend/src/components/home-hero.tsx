// Home hero — the "Dr. Charmer's office" experience.
// Rest: office background + seated panda (back turned). Tap: crossfades to the
// facing talking-loop video and opens chat. This is the home-merged-with-chat
// feel, built from pre-rendered assets (no real-time 3D).
import React, { useState } from "react";
import {
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

import { CaptainChat } from "@/src/components/captain-chat";
import { colors, fonts, radius, spacing } from "@/src/theme";

const OFFICE_BG = require("@/assets/veeran/home/office_bg.png");
const SEATED = require("@/assets/veeran/home/charmer_seated.png");
const TALKING = require("@/assets/veeran/home/charmer_talking.mp4");

export function HomeHero() {
  const [awake, setAwake] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const player = useVideoPlayer(TALKING, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const wake = () => {
    setAwake(true);
    player.play();
    // Small beat so the panda "turns" before chat slides up
    setTimeout(() => setChatOpen(true), 650);
  };

  return (
    <View style={styles.wrap}>
      <ImageBackground source={OFFICE_BG} style={styles.bg} imageStyle={styles.bgImg}>
        {!awake ? (
          <Pressable style={styles.tapZone} onPress={wake} testID="home-tap-charmer">
            <Image source={SEATED} style={styles.seated} resizeMode="contain" />
            <View style={styles.tapHintWrap}>
              <Text style={styles.tapHint}>Tap Dr. Charmer to consult</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable style={styles.tapZone} onPress={() => setChatOpen(true)} testID="home-charmer-awake">
            <VideoView
              player={player}
              style={styles.video}
              contentFit="contain"
              nativeControls={false}
            />
          </Pressable>
        )}
      </ImageBackground>

      <CaptainChat
        visible={chatOpen}
        onClose={() => {
          setChatOpen(false);
          // panda goes back to resting after chat closes
          setTimeout(() => setAwake(false), 300);
          player.pause();
        }}
        initialMessage=""
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", aspectRatio: 0.72, backgroundColor: colors.riceWhite },
  bg: { flex: 1, justifyContent: "flex-end" },
  bgImg: { borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  tapZone: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  seated: { width: "82%", height: "82%" },
  video: { width: "94%", height: "90%" },
  tapHintWrap: {
    position: "absolute",
    bottom: 18,
    alignSelf: "center",
    backgroundColor: "rgba(30,74,44,0.9)",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  tapHint: { color: colors.riceWhite, fontFamily: fonts.headingEn, fontSize: 14 },
});
