import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, LogBox, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/toast";
import { AuthProvider, useAuth } from "@/src/auth-context";
import { queryClient } from "@/src/query-client";
import { setColorScheme, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

LogBox.ignoreAllLogs(true);

function RootNavigator() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const first = segments[0] as string | undefined;
    if (!user) {
      if (first !== "welcome") router.replace("/welcome");
    } else if (!user.onboarded) {
      if (first !== "onboarding") router.replace("/onboarding");
    } else if (first === "welcome" || first === "onboarding" || first === undefined) {
      router.replace("/");
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-food" options={{ presentation: "modal" }} />
      <Stack.Screen name="scan" options={{ presentation: "modal" }} />
      <Stack.Screen name="assistant" />
      <Stack.Screen name="suggestions" />
      <Stack.Screen name="barcode" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const { scheme } = useTheme();

  useEffect(() => {
    storage.getItem<string>("color_scheme", "dark").then((pref) => {
      if (pref === "light" || pref === "dark") setColorScheme(pref);
    });
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <BottomSheetModalProvider>
                <AuthProvider>
                  <ToastProvider>
                    <StatusBar style={scheme === "dark" ? "light" : "dark"} />
                    <RootNavigator />
                  </ToastProvider>
                </AuthProvider>
              </BottomSheetModalProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
});
