import { useEffect, useMemo, useReducer } from "react";
import { Appearance, StyleSheet } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#0D0F12",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1A1D23",
  onSurfaceSecondary: "#F8FAFC",
  surfaceTertiary: "#252932",
  onSurfaceTertiary: "#E2E8F0",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0D0F12",

  brand: "#B8F34B",
  onBrand: "#000000",
  brandPrimary: "#B8F34B",
  onBrandPrimary: "#000000",
  brandSecondary: "#9AD532",
  onBrandSecondary: "#000000",
  brandTertiary: "rgba(184, 243, 75, 0.12)",
  onBrandTertiary: "#B8F34B",

  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#000000",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#4B5563",
  onInfo: "#FFFFFF",

  border: "#2E333D",
  borderStrong: "#3C4350",
  divider: "#232730",
  muted: "#9CA3AF",
};

const light: typeof dark = {
  surface: "#FFFFFF",
  onSurface: "#0D0F12",
  surfaceSecondary: "#F4F6F8",
  onSurfaceSecondary: "#111827",
  surfaceTertiary: "#E9EDF1",
  onSurfaceTertiary: "#1F2937",
  surfaceInverse: "#0D0F12",
  onSurfaceInverse: "#FFFFFF",

  brand: "#5B8A14",
  onBrand: "#FFFFFF",
  brandPrimary: "#4E7A10",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#6FA318",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "rgba(78, 122, 16, 0.10)",
  onBrandTertiary: "#3D6109",

  success: "#15803D",
  onSuccess: "#FFFFFF",
  warning: "#B45309",
  onWarning: "#FFFFFF",
  error: "#DC2626",
  onError: "#FFFFFF",
  info: "#4B5563",
  onInfo: "#FFFFFF",

  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  divider: "#EEF2F6",
  muted: "#64748B",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

// App-level scheme override. Dark-first: the app stays dark regardless of the
// device setting, and only switches when the user explicitly toggles. A tiny
// subscription makes every useTheme() consumer re-render on change.
let currentScheme: ColorScheme = defaultScheme;
const schemeListeners = new Set<() => void>();

export function setColorScheme(scheme: ColorScheme | null) {
  currentScheme = scheme ?? defaultScheme;
  Appearance.setColorScheme?.(scheme ?? "unspecified");
  schemeListeners.forEach((l) => l());
}

export function getColorScheme(): ColorScheme {
  return currentScheme;
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    schemeListeners.add(force);
    return () => {
      schemeListeners.delete(force);
    };
  }, []);
  const scheme = currentScheme;
  return { scheme, colors: themes[scheme] ?? themes.dark ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 } as const;
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;
