import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader } from "@/src/components/app-header";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Props = {
  screenTestID: string;
  headerTitle: string;
  headerSubtitleTa: string;
  iconName: keyof typeof Ionicons.glyphMap;
  emptyTitle: string;
  emptyTitleTa: string;
  emptyBody: string;
};

export function EmptyScreen({
  screenTestID,
  headerTitle,
  headerSubtitleTa,
  iconName,
  emptyTitle,
  emptyTitleTa,
  emptyBody,
}: Props) {
  return (
    <View style={styles.screen} testID={screenTestID}>
      <AppHeader title={headerTitle} subtitleTa={headerSubtitleTa} />
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name={iconName} size={40} color={colors.bananaLeaf} />
        </View>
        <Text style={styles.title}>{emptyTitle}</Text>
        <Text style={styles.titleTa}>{emptyTitleTa}</Text>
        <Text style={styles.body_}>{emptyBody}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.riceWhite,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.l,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: `${colors.bananaLeaf}14`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.l,
  },
  title: {
    fontFamily: fonts.headingEn,
    fontSize: 22,
    color: colors.textPrimary,
  },
  titleTa: {
    fontFamily: fonts.bodyTa,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  body_: {
    marginTop: spacing.m,
    textAlign: "center",
    color: colors.textMuted,
    lineHeight: 20,
    maxWidth: 280,
  },
});
