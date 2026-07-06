// Batch 11: Capt. Charmer's real brain. Opens from the floating Captain.
// Every reply comes from Claude with the user's live kitchen context
// (today's plan, pantry, expiries, profile) — no hardcoded lines.
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

const CAPTAIN_IMG = require("../../assets/veeran/posters/point.png");

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What should I cook tonight?",
  "What's expiring in my pantry?",
  "Is today's plan healthy?",
];

export function CaptainChat({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
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
    } catch (e: any) {
      const m = String(e?.message ?? "");
      setMsgs([
        ...next,
        {
          role: "assistant",
          content:
            m.includes("404") || m.includes("503")
              ? "My brain comes online with the next backend update, soldier. Hold the line."
              : "Radio failure — check your connection and try again.",
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.s }]}
          onPress={(e) => e.stopPropagation()}
          testID="captain-chat"
        >
          <View style={styles.header}>
            <Image source={CAPTAIN_IMG} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Capt. Charmer</Text>
              <Text style={styles.sub}>Knows your pantry, plan & nutrition</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            {msgs.length === 0 ? (
              <View style={styles.starters}>
                <Text style={styles.startersHint}>Ask me anything about your kitchen:</Text>
                {STARTERS.map((s) => (
                  <TouchableOpacity key={s} style={styles.starterChip} onPress={() => send(s)}>
                    <Text style={styles.starterText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={msgs}
                keyExtractor={(_, i) => String(i)}
                contentContainerStyle={{ padding: spacing.m, gap: 10 }}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.bubble,
                      item.role === "user" ? styles.bubbleUser : styles.bubbleCaptain,
                    ]}
                  >
                    <Text style={item.role === "user" ? styles.bubbleUserText : styles.bubbleCaptainText}>
                      {item.content}
                    </Text>
                  </View>
                )}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              />
            )}

            {busy ? (
              <View style={styles.typing}>
                <ActivityIndicator size="small" color={colors.bananaLeaf} />
                <Text style={styles.typingText}>Captain is thinking…</Text>
              </View>
            ) : null}

            <View style={styles.inputRow}>
              <TextInput
                testID="captain-chat-input"
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask the Captain…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={600}
                onSubmitEditing={() => send()}
              />
              <TouchableOpacity
                testID="captain-chat-send"
                style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.4 }]}
                onPress={() => send()}
                disabled={!input.trim() || busy}
              >
                <Ionicons name="arrow-up" size={20} color={colors.riceWhite} />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    height: "82%",
    backgroundColor: colors.riceWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.m,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: colors.turmeric },
  title: { fontFamily: fonts.headingEn, fontSize: 18, color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  starters: { flex: 1, padding: spacing.l, gap: 10, justifyContent: "center" },
  startersHint: { fontSize: 14, color: colors.textSecondary, fontWeight: "700", marginBottom: 4, textAlign: "center" },
  starterChip: {
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: spacing.m,
    borderRadius: radius.l,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  starterText: { fontSize: 15, fontWeight: "700", color: colors.bananaLeafDark },
  bubble: { maxWidth: "84%", borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.bananaLeaf },
  bubbleCaptain: { alignSelf: "flex-start", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleUserText: { color: colors.riceWhite, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  bubbleCaptainText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  typing: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.m, paddingBottom: 6 },
  typingText: { fontSize: 12.5, color: colors.textMuted, fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: spacing.s,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 110,
    borderRadius: radius.l,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.m,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.riceWhite,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bananaLeaf,
    alignItems: "center",
    justifyContent: "center",
  },
});
