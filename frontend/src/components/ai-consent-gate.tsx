import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { apiFetch } from "@/src/api";
import { Button } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { useConsent } from "@/src/hooks";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Mostra o conteudo so depois que a pessoa aceita o uso de IA (foto e chat enviam dados a terceiros). */
export function AiConsentGate({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const consent = useConsent();

  const accept = useMutation({
    mutationFn: () => apiFetch("/account/consent", { method: "PUT", body: { ai_processing: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["consent"] }),
    onError: () => toast.show("Não foi possível salvar. Tente novamente.", "error"),
  });

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (consent.isLoading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  if (consent.data?.ai_processing) return <>{children}</>;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]} testID="ai-consent-gate">
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="sparkles" size={32} color={colors.onBrandTertiary} />
        </View>
        <Text style={styles.title}>Usar a inteligência artificial</Text>
        <Text style={styles.text}>
          Para reconhecer alimentos em fotos, sugerir refeições e conversar com a Nutri, o Nutrify envia suas fotos, mensagens e dados necessários
          (como objetivo, metas e o que você comeu no dia) a provedores de IA, que podem processar esses dados fora do Brasil.
        </Text>
        <Text style={styles.text}>
          É opcional. Você pode desativar quando quiser em Perfil &gt; Privacidade. Os resultados da IA são estimativas e não substituem um nutricionista.
        </Text>
        <Pressable testID="ai-consent-privacy" onPress={() => router.push("/privacy")} hitSlop={8}>
          <Text style={styles.link}>Ler a Política de Privacidade</Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Button testID="ai-consent-accept" label="Aceito e quero usar a IA" onPress={() => accept.mutate()} loading={accept.isPending} />
        <Button testID="ai-consent-decline" label="Agora não" variant="secondary" onPress={leave} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  body: { flex: 1, justifyContent: "center", gap: spacing.lg },
  iconWrap: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  text: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21 },
  link: { color: colors.brandPrimary, fontSize: 14, fontWeight: "700", textDecorationLine: "underline" },
}));
