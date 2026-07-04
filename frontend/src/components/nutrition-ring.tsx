import React, { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { colors, fonts } from "@/src/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  color?: string;
  bg?: string;
  label: string;
  value: string;
  hint?: string;
  testID?: string;
  /** Stagger start (ms) so multiple rings sweep one after another. */
  delay?: number;
};

export function NutritionRing({
  progress,
  size = 96,
  strokeWidth = 10,
  color = colors.bananaLeaf,
  bg = "#E8E1CB",
  label,
  value,
  hint,
  testID,
  delay = 0,
}: Props) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Animated sweep: 0 → progress on mount and whenever progress changes.
  const anim = useSharedValue(0);
  useEffect(() => {
    let reduced = false;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        reduced = !!v;
        anim.value = reduced
          ? clamped
          : withDelay(
              delay,
              withTiming(clamped, { duration: 800, easing: Easing.out(Easing.cubic) }),
            );
      })
      .catch(() => {
        anim.value = withDelay(
          delay,
          withTiming(clamped, { duration: 800, easing: Easing.out(Easing.cubic) }),
        );
      });
  }, [clamped, delay, anim]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - anim.value),
  }));

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={bg}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.centerText}>
          <Text style={styles.centerValue} testID={testID ? `${testID}-value` : undefined}>
            {value}
          </Text>
          {hint ? <Text style={styles.centerHint}>{hint}</Text> : null}
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  centerText: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  centerValue: {
    fontFamily: fonts.headingSemi,
    fontSize: 19,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  centerHint: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    fontWeight: "700",
  },
});
