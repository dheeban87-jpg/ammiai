// Batch 11: turns silent crashes into readable, copyable reports.
// Wraps each tab screen so one broken screen can never close the whole app.
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, spacing } from "@/src/theme";

type State = { error: Error | null; info: string };

export class ScreenErrorBoundary extends React.Component<
  { name: string; children: React.ReactNode },
  State
> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info: info?.componentStack ?? "" });
  }

  copy = async () => {
    const { error, info } = this.state;
    await Clipboard.setStringAsync(
      `AmmiAI crash in ${this.props.name}\n${error?.message}\n${error?.stack ?? ""}\n${info}`,
    );
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap} testID={`crash-${this.props.name}`}>
        <Ionicons name="construct" size={40} color={colors.turmeric} />
        <Text style={styles.title}>This screen hit a problem</Text>
        <Text style={styles.sub}>
          The rest of AmmiAI still works. Copy the details below and send them to the developer.
        </Text>
        <ScrollView style={styles.box}>
          <Text style={styles.err}>{String(this.state.error?.message)}</Text>
          <Text style={styles.stack}>{String(this.state.error?.stack ?? "").slice(0, 600)}</Text>
          {this.state.info ? (
            <>
              <Text style={[styles.err, { marginTop: 8 }]}>Component trail:</Text>
              <Text style={styles.stack}>{this.state.info.slice(0, 700)}</Text>
            </>
          ) : null}
        </ScrollView>
        <TouchableOpacity style={styles.btn} onPress={this.copy} testID="crash-copy-btn">
          <Ionicons name="copy-outline" size={16} color={colors.riceWhite} />
          <Text style={styles.btnText}>Copy crash details</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnGhost}
          onPress={() => this.setState({ error: null, info: "" })}
        >
          <Text style={styles.btnGhostText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.l, backgroundColor: colors.riceWhite },
  title: { fontFamily: fonts.headingEn, fontSize: 20, color: colors.textPrimary, marginTop: spacing.m },
  sub: { fontSize: 13.5, color: colors.textSecondary, textAlign: "center", marginTop: 6, marginBottom: spacing.m, lineHeight: 19 },
  box: { maxHeight: 220, alignSelf: "stretch", backgroundColor: colors.surfaceSoft, borderRadius: radius.m, padding: spacing.m },
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
