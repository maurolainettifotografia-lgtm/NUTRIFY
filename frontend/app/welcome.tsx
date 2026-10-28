import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { AppleSignInButton } from "@/src/apple-signin";
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
  const { signInWithEmail, signInWithGoogle, signInWithApple, signingIn } = useAuth();
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [legacyPassword, setLegacyPassword] = useState(false);
  const submit = async () => {
    setError("");
    if (!email.trim() || !password || (register && !name.trim())) { setError("Preencha os campos para continuar."); return; }
    if (register || !legacyPassword) {
      if (!/^[0-9]+$/.test(password)) { setError("A senha deve conter somente números de 0 a 9."); return; }
      if (password.length !== 6) { setError(password.length < 6 ? "A senha precisa de 6 dígitos. Faltam números." : "A senha deve ter somente 6 dígitos. Remova os números extras."); return; }
    }
    try { await signInWithEmail(email.trim(), password, register ? name.trim() : undefined); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível entrar. Tente novamente."); }
  };

  return (
    <KeyboardAwareScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
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

        <View style={styles.form}>
          {register && <TextInput testID="auth-name" accessibilityLabel="Seu nome" placeholder="Seu nome" placeholderTextColor={colors.muted} value={name} onChangeText={setName} autoComplete="name" maxLength={80} style={styles.input} />}
          <TextInput testID="auth-email" accessibilityLabel="E-mail" placeholder="E-mail" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} style={styles.input} />
          <TextInput testID="auth-password" accessibilityLabel="Senha" placeholder={legacyPassword && !register ? "Sua senha anterior" : "Senha (6 dígitos numéricos)"} keyboardType={legacyPassword && !register ? "default" : "number-pad"} placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} secureTextEntry autoComplete={register ? "new-password" : "current-password"} maxLength={128} onSubmitEditing={submit} style={styles.input} />
          {!register && <Pressable testID="legacy-password" onPress={() => { setLegacyPassword(!legacyPassword); setError(""); }}><Text style={styles.switchText}>{legacyPassword ? "Usar senha de 6 dígitos" : "Minha conta tem uma senha anterior"}</Text></Pressable>}
          {!!error && <Text testID="auth-error" accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Button testID="email-submit" label={register ? "Criar minha conta" : "Entrar"} onPress={submit} loading={signingIn} />
          <Pressable testID="toggle-register" disabled={signingIn} onPress={() => { setRegister(!register); setError(""); }}><Text style={styles.switchText}>{register ? "Já tenho conta. Entrar" : "Primeira vez? Crie sua conta"}</Text></Pressable>
        </View>

        {process.env.EXPO_PUBLIC_ENABLE_EMERGENT_AUTH === "true" && <Button
          testID="google-signin-button"
          label="Entrar com Google"
          icon="logo-google"
          loading={signingIn}
          onPress={signInWithGoogle}
          style={{ marginTop: spacing.md }}
        />}

        {process.env.EXPO_PUBLIC_ENABLE_APPLE_AUTH === "true" && <AppleSignInButton onPress={signInWithApple} disabled={signingIn} />}

        <Text style={styles.disclaimer}>
          Ao continuar, você confirma ter 18 anos ou mais e declara ter lido a{" "}
          <Text testID="privacy-link" style={styles.link} onPress={() => router.push("/privacy")}>
            Política de Privacidade
          </Text>
          . As estimativas nutricionais não substituem orientação profissional.
        </Text>
        <Text style={styles.copyright}>{COPYRIGHT}</Text>
      </View>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  form: { gap: spacing.sm, marginTop: spacing.lg },
  input: { color: colors.onSurface, backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 50, fontSize: 16 },
  error: { color: colors.error, fontSize: 13 },
  switchText: { color: colors.brandPrimary, textAlign: "center", padding: spacing.sm, fontWeight: "600" },
  link: { textDecorationLine: "underline", fontWeight: "700" },
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
  bottom: { marginTop: "auto", paddingHorizontal: spacing.xl, paddingTop: spacing.xl, width: "100%", maxWidth: 560, alignSelf: "center" },
  headline: { color: colors.onSurface, fontSize: 32, fontWeight: "800", lineHeight: 38 },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 15, marginTop: spacing.md, lineHeight: 22 },
  disclaimer: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: spacing.lg, lineHeight: 16 },
  copyright: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: spacing.md, opacity: 0.7 },
}));
