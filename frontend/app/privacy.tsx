import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import content from "@/src/privacy-content.json";
import { POLICY_VERSION, PRIVACY_CONTACT } from "@/src/constants";
import { makeStyles, spacing, useTheme } from "@/src/theme";

// O texto fica em src/privacy-content.json (fonte unica: tambem gera a pagina publica em docs/privacidade.html).
const SECTIONS: { title: string; body: string[] }[] = (content.sections as { title: string; body: string[] }[]).map((s) => ({
  title: s.title,
  body: s.body.map((p) => p.split("{{CONTATO}}").join(PRIVACY_CONTACT)),
}));

export default function Privacy() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable testID="close-privacy" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Política de Privacidade</Text>
        <View style={styles.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.version}>Versão {POLICY_VERSION}</Text>
        {SECTIONS.map((s) => (
          <View key={s.title} style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            {s.body.map((p, i) => (
              <Text key={i} style={styles.body}>{p}</Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  version: { color: colors.muted, fontSize: 12 },
  sectionTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21 },
}));
