import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { makeStyles, useTheme } from "@/src/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function CalorieRing({
  consumed,
  target,
  size = 200,
  strokeWidth = 16,
}: {
  consumed: number;
  target: number;
  size?: number;
  strokeWidth?: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const remaining = Math.max(0, Math.round(target - consumed));

  useEffect(() => {
    progress.value = withTiming(pct, { duration: 900 });
  }, [pct, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const over = consumed > target;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surfaceTertiary} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={over ? colors.warning : colors.brandPrimary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={styles.bigNumber} testID="calorie-remaining">{remaining}</Text>
        <Text style={styles.label}>kcal restantes</Text>
        <Text style={styles.sub}>
          {Math.round(consumed)} / {Math.round(target)}
        </Text>
      </View>
    </View>
  );
}

export function MacroBar({
  label,
  consumed,
  target,
  color,
  unit = "g",
}: {
  label: string;
  consumed: number;
  target: number;
  color: string;
  unit?: string;
}) {
  const styles = useStyles();
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(pct, { duration: 800 });
  }, [pct, width]);
  const animatedStyle = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View style={styles.macroWrap}>
      <View style={styles.macroHeader}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>
          {Math.round(consumed)}
          <Text style={styles.macroTarget}>
            {" "}
            / {Math.round(target)}
            {unit}
          </Text>
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, animatedStyle]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  center: { position: "absolute", alignItems: "center" },
  bigNumber: { color: colors.onSurface, fontSize: 40, fontWeight: "800" },
  label: { color: colors.muted, fontSize: 13, marginTop: 2 },
  sub: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 6, fontWeight: "600" },
  macroWrap: { gap: 6 },
  macroHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  macroLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  macroValue: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  macroTarget: { color: colors.muted, fontSize: 12, fontWeight: "500" },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  fill: { height: 8, borderRadius: 999 },
}));
