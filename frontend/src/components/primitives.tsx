import React from "react";
import { ActivityIndicator, Pressable, Text, View, ViewStyle } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  testID,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: any;
  testID?: string;
  style?: ViewStyle;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const bg =
    variant === "primary"
      ? styles.primary
      : variant === "secondary"
        ? styles.secondary
        : styles.ghost;
  const textColor =
    variant === "primary" ? colors.onBrandPrimary : variant === "secondary" ? colors.onSurfaceTertiary : colors.brandPrimary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.btn, bg, (disabled || loading) && styles.disabled, pressed && styles.pressed, style]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.btnRow}>
          {icon ? <Ionicons name={icon} size={18} color={textColor} /> : null}
          <Text style={[styles.btnText, { color: textColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  const styles = useStyles();
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function IconButton({ icon, onPress, testID, size = 22, color }: { icon: any; onPress?: () => void; testID?: string; size?: number; color?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={10} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
      <Ionicons name={icon} size={size} color={color ?? colors.onSurface} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  btn: {
    borderRadius: radius.pill,
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  btnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnText: { fontSize: 16, fontWeight: "700" },
  primary: { backgroundColor: colors.brandPrimary },
  secondary: { backgroundColor: colors.surfaceTertiary },
  ghost: { backgroundColor: "transparent" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
}));
