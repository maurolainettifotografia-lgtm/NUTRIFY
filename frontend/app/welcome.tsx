import React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Button } from "@/src/components/primitives";
import { useAuth } from "@/src/auth-context";
import { COPYRIGHT, SIGNATURE } from "@/src/constants";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwxfHxhdGhsZXRlJTIwdHJhaW5pbmclMjBkYXJrJTIwYWVzdGhldGljfGVufDB8fHx8MTc5MjA3MTU3NXww&ixlib=rb-4.1.0&q=85";

export default function Welcome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, signingIn } = useAuth();

  return (
    <View style={styles.container}>
      <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" transition={300} />
      <LinearGradient
        colors={["rgba(13,15,18,0.2)", "rgba(13,15,18,0.75)", "#0D0F12"]}
        locations={[0, 0.55, 1]}
        style={styles.scrim}
      />

      <View style={[styles.top, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <Ionicons name="leaf" size={22} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.logoText}>NUTRIFY</Text>
        </View>
        <Text style={styles.signature}>{SIGNATURE}</Text>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.headline}>Sua nutrição,{"\n"}com inteligência.</Text>
        <Text style={styles.subtitle}>
          Controle calorias, macros, hidratação e evolução — tudo em um só lugar.
        </Text>

        <Button
          testID="google-signin-button"
          label="Entrar com Google"
          icon="logo-google"
          loading={signingIn}
          onPress={signInWithGoogle}
          style={{ marginTop: spacing.xl }}
        />

        <Text style={styles.disclaimer}>
          Ao continuar você concorda com nossos termos. As estimativas nutricionais não substituem orientação profissional.
        </Text>
        <Text style={styles.copyright}>{COPYRIGHT}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { position: "absolute", left: 0, right: 0, top: 0, height: "72%" },
  scrim: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  top: { paddingHorizontal: spacing.xl, alignItems: "flex-start" },
  logoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: colors.onSurface, fontSize: 26, fontWeight: "800", letterSpacing: 2 },
  signature: { color: colors.muted, fontSize: 14, marginTop: spacing.xs, fontStyle: "italic", marginLeft: 2 },
  bottom: { marginTop: "auto", paddingHorizontal: spacing.xl },
  headline: { color: colors.onSurface, fontSize: 32, fontWeight: "800", lineHeight: 38 },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 15, marginTop: spacing.md, lineHeight: 22 },
  disclaimer: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: spacing.lg, lineHeight: 16 },
  copyright: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: spacing.md, opacity: 0.7 },
}));
