import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, spacing } from "@/src/theme";

type Props = {
  title: string;
  subtitleTa?: string;
  right?: React.ReactNode;
  onLongPress?: () => void;
};

export function AppHeader({ title, subtitleTa, right, onLongPress }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + spacing.s, minHeight: insets.top + 88 },
      ]}
      testID="app-header"
    >
      <View style={styles.headerRow}>
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={800}
          style={styles.headerTextWrap}
          testID="app-header-touchable"
        >
          <Text style={styles.title} testID="app-header-title">
            {title}
          </Text>
          {subtitleTa ? (
            <Text style={styles.subtitleTa} testID="app-header-subtitle-ta">
              {subtitleTa}
            </Text>
          ) : null}
        </Pressable>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.bananaLeafDark,
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.m,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTextWrap: {
    flex: 1,
  },
  headerRight: {
    marginLeft: spacing.m,
  },
  title: {
    color: colors.textOnPrimary,
    fontFamily: fonts.headingBold,
    fontSize: 30,
    lineHeight: 36,
  },
  subtitleTa: {
    color: "#CDE2CF",
    fontFamily: fonts.bodyTa,
    fontSize: 16,
    marginTop: 2,
  },
});
