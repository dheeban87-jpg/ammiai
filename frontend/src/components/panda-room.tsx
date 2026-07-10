// The Panda Room — Dr. Charmer's banana-leaf office. Live data panels float on
// the left wall (Today's Balance rings + pantry/expiring/waste cards). Panda
// seated (rest) -> tap -> talking video + TTS. Chat embedded at the bottom.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";
import * as Speech from "expo-speech";

import { api } from "@/src/api";
import { NutritionRing } from "@/src/components/nutrition-ring";
import { colors, fonts, radius, shadow } from "@/src/theme";

const ROOM_BG = require("@/assets/veeran/home/room_bg.png");
const SEATED = require("@/assets/veeran/home/charmer_seated.png");
const TALKING = require("@/assets/veeran/home/room_talking.mp4");

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What should I cook tonight?",
  "What's expiring in my pantry?",
  "Is today's plan healthy?",
];

type Balance = {
  kcal: number; kcalTarget: number;
  protein: number; proteinTarget: number;
  fiber: number; fiberTarget: number;
};

export function PandaRoom({ name }: { name?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [awake, setAwake] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ttsOn, setTtsOn] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const greeted = useRef(false);

  const [balance, setBalance] = useState<Balance | null>(null);
  const [pantryCount, setPantryCount] = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);
  const [wasteInr, setWasteInr] = useState(0);
  const [expItem, setExpItem] = useState<{ name: string; days: number } | null>(null);

  const panelFade = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(TALKING, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get<any>("/api/plan/today");
        setBalance({
          kcal: Math.round(p?.day_totals?.kcal ?? 0),
          kcalTarget: Math.round(p?.day_targets?.kcal ?? 1660),
          protein: Math.round(p?.day_totals?.protein_g ?? 0),
          proteinTarget: Math.round(p?.day_targets?.protein_g ?? 46),
          fiber: Math.round(p?.day_totals?.fiber_g ?? 0),
          fiberTarget: Math.round(p?.day_targets?.fiber_g ?? 25),
        });
      } catch {}
      try {
        const rows = await api.get<any[]>("/api/pantry");
        const list = rows ?? [];
        setPantryCount(list.length);
        const exp = list.filter((r) => (r.days_left ?? 99) <= 2);
        setExpiringCount(exp.length);
        if (exp.length > 0) {
          const soonest = exp.sort((a, b) => (a.days_left ?? 99) - (b.days_left ?? 99))[0];
          setExpItem({ name: soonest.ingredient_name ?? soonest.name ?? "item", days: soonest.days_left ?? 0 });
        }
      } catch {}
      try {
        const w = await api.get<any>("/api/waste-log");
        setWasteInr(Math.round(w?.total_estimated_inr ?? 0));
      } catch {}
      Animated.timing(panelFade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    })();
  }, [panelFade]);

  const speak = useCallback(
    (text: string) => {
      if (!ttsOn || !text) return;
      Speech.stop();
      const clean = text.replace(/[*_#`>]/g, "").replace(/\s+/g, " ").slice(0, 400);
      Speech.speak(clean, { rate: 0.98, pitch: 1.0 });
    },
    [ttsOn],
  );

  const wake = () => {
    setAwake(true);
    player.play();
    if (!greeted.current) {
      greeted.current = true;
      const hour = new Date().getHours();
      const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      const greeting = `${part}${name ? ", " + name : ""}, soldier. Reporting for duty. What did we eat today?`;
      setMsgs([{ role: "assistant", content: greeting }]);
      speak(greeting);
    }
  };

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    if (!awake) wake();
    setInput("");
    const next: Msg[] = [...msgs, { role: "user", content: message }];
    setMsgs(next);
    setBusy(true);
    try {
      const resp = await api.post<{ reply: string }>("/api/captain/chat", {
        message,
        history: msgs.slice(-8),
      });
      setMsgs([...next, { role: "assistant", content: resp.reply }]);
      speak(resp.reply);
    } catch (e: any) {
      const m = String(e?.message ?? "");
      const fallback =
        m.includes("404") || m.includes("503")
          ? "My brain comes online with the next backend update, soldier. Hold the line."
          : "Radio failure — check your connection and try again.";
      setMsgs([...next, { role: "assistant", content: fallback }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return (
    <View style={styles.room}>
      <ImageBackground source={ROOM_BG} style={styles.bg} imageStyle={styles.bgImg}>
        <Animated.View style={[styles.wallPanels, { top: insets.top + 6, opacity: panelFade }]}>
          {balance ? (
            <TouchableOpacity activeOpacity={0.9} onPress={() => router.push("/plan")} style={styles.balanceCard}>
              <View style={styles.balanceHead}>
                <Text style={styles.balanceTitle}>Today's Balance</Text>
                <Text style={styles.seeLink}>See plan →</Text>
              </View>
              <View style={styles.ringRow}>
                <NutritionRing progress={balance.kcal / Math.max(1, balance.kcalTarget)} size={72} strokeWidth={8} color={colors.bananaLeaf} label="Calories" value={`${balance.kcal}`} hint={`/ ${balance.kcalTarget}`} />
                <NutritionRing progress={balance.protein / Math.max(1, balance.proteinTarget)} size={72} strokeWidth={8} color={colors.chili} label="Protein" value={`${balance.protein}g`} hint={`/ ${balance.proteinTarget}`} />
                <NutritionRing progress={balance.fiber / Math.max(1, balance.fiberTarget)} size={72} strokeWidth={8} color={colors.turmeric} label="Fiber" value={`${balance.fiber}g`} hint={`/ ${balance.fiberTarget}`} />
              </View>
            </TouchableOpacity>
          ) : null}

          <View style={styles.miniRow}>
            <TouchableOpacity style={styles.miniCard} onPress={() => router.push("/pantry")}>
              <Ionicons name="cube-outline" size={18} color={colors.bananaLeafDark} />
              <Text style={styles.miniNum}>{pantryCount}</Text>
              <Text style={styles.miniLabel}>Pantry items</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.miniCard} onPress={() => router.push("/pantry")}>
              <Ionicons name="alarm-outline" size={18} color={colors.turmeric} />
              <Text style={styles.miniNum}>{expiringCount}</Text>
              <Text style={styles.miniLabel}>Expiring soon</Text>
            </TouchableOpacity>
            <View style={styles.miniCard}>
              <Ionicons name="trash-outline" size={18} color={colors.chili} />
              <Text style={styles.miniNum}>₹{wasteInr}</Text>
              <Text style={styles.miniLabel}>Waste so far</Text>
            </View>
          </View>

          {expItem ? (
            <TouchableOpacity style={styles.expiringCard} onPress={() => router.push("/pantry")}>
              <Ionicons name="leaf" size={20} color={colors.bananaLeaf} />
              <View style={{ flex: 1 }}>
                <Text style={styles.expiringName} numberOfLines={1}>{expItem.name}</Text>
                <Text style={styles.expiringSub}>Use within {expItem.days}d</Text>
              </View>
              <Text style={styles.expiringTag}>{expItem.days <= 0 ? "today" : `${expItem.days}d`}</Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>

        <Pressable style={styles.pandaZone} onPress={awake ? undefined : wake} testID="panda-room">
          {!awake ? (
            <>
              <Image source={SEATED} style={styles.panda} resizeMode="contain" />
              <View style={styles.tapHint}>
                <Text style={styles.tapHintText}>Tap Dr. Charmer to consult</Text>
              </View>
            </>
          ) : (
            <VideoView player={player} style={styles.pandaVideo} contentFit="cover" nativeControls={false} />
          )}
        </Pressable>
      </ImageBackground>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.chatDock}>
        {awake && msgs.length > 0 ? (
          <ScrollView ref={scrollRef} style={styles.msgScroll} contentContainerStyle={{ padding: 12, gap: 8 }} keyboardShouldPersistTaps="handled">
            {msgs.map((m, i) => (
              <View key={i} style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.pandaBubble]}>
                <Text style={[styles.bubbleText, m.role === "user" && { color: colors.riceWhite }]}>{m.content}</Text>
              </View>
            ))}
            {busy ? <ActivityIndicator color={colors.bananaLeaf} style={{ marginTop: 4 }} /> : null}
          </ScrollView>
        ) : (
          <View style={styles.starters}>
            {STARTERS.map((s) => (
              <TouchableOpacity key={s} style={styles.starterChip} onPress={() => send(s)}>
                <Text style={styles.starterText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.inputRow}>
          <TouchableOpacity onPress={() => setTtsOn((v) => !v)} style={styles.ttsBtn} hitSlop={8}>
            <Ionicons name={ttsOn ? "volume-high" : "volume-mute"} size={22} color={colors.bananaLeaf} />
          </TouchableOpacity>
          <TextInput style={styles.input} placeholder="Ask the Captain…" placeholderTextColor={colors.textMuted} value={input} onChangeText={setInput} onSubmitEditing={() => send()} returnKeyType="send" />
          <TouchableOpacity style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.5 }]} onPress={() => send()} disabled={!input.trim() || busy}>
            <Ionicons name="arrow-up" size={22} color={colors.riceWhite} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  room: { flex: 1, backgroundColor: colors.riceWhite },
  bg: { flex: 1, justifyContent: "flex-end" },
  bgImg: {},
  wallPanels: { position: "absolute", left: 10, right: 10, gap: 8 },
  balanceCard: { backgroundColor: "rgba(255,255,255,0.93)", borderRadius: radius.l, padding: 12, ...shadow.card },
  balanceHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  balanceTitle: { fontFamily: fonts.headingEn, fontSize: 14, color: colors.textPrimary, textTransform: "uppercase", letterSpacing: 0.3 },
  seeLink: { fontSize: 12.5, fontWeight: "800", color: colors.bananaLeaf },
  ringRow: { flexDirection: "row", justifyContent: "space-around" },
  miniRow: { flexDirection: "row", gap: 8 },
  miniCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.93)", borderRadius: radius.m, padding: 10, alignItems: "flex-start", ...shadow.card },
  miniNum: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.textPrimary, marginTop: 2 },
  miniLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
  expiringCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.93)", borderRadius: radius.m, padding: 11, ...shadow.card },
  expiringName: { fontSize: 14.5, fontWeight: "800", color: colors.textPrimary },
  expiringSub: { fontSize: 12, color: colors.textMuted },
  expiringTag: { fontSize: 12.5, fontWeight: "800", color: colors.chili },
  pandaZone: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  panda: { width: "88%", height: "70%" },
  pandaVideo: { width: "100%", height: "78%" },
  tapHint: { position: "absolute", bottom: 14, alignSelf: "center", backgroundColor: "rgba(30,74,44,0.92)", paddingHorizontal: 18, paddingVertical: 9, borderRadius: radius.pill },
  tapHintText: { color: colors.riceWhite, fontFamily: fonts.headingEn, fontSize: 14 },
  chatDock: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, ...shadow.card, maxHeight: "44%" },
  msgScroll: { maxHeight: 240 },
  bubble: { maxWidth: "86%", borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.bananaLeaf },
  pandaBubble: { alignSelf: "flex-start", backgroundColor: colors.surfaceSoft },
  bubbleText: { fontSize: 14.5, lineHeight: 20, color: colors.textPrimary },
  starters: { padding: 12, gap: 8 },
  starterChip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.surface },
  starterText: { fontSize: 14.5, fontWeight: "700", color: colors.bananaLeafDark },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  ttsBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 46, borderRadius: radius.pill, backgroundColor: colors.surfaceSoft, paddingHorizontal: 16, fontSize: 15, color: colors.textPrimary },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.bananaLeaf, alignItems: "center", justifyContent: "center" },
});
