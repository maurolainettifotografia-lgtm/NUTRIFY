import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { CalorieRing, MacroBar } from "@/src/components/charts";
import { Card } from "@/src/components/primitives";
import { WaterWidget } from "@/src/components/water-widget";
import { useDiary } from "@/src/hooks";
import { todayStr } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Dashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const date = todayStr();
  const { data, isLoading, refetch, isRefetching } = useDiary(date);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const totals = data?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const goals = data?.goals;
  const target = data?.target_calories ?? goals?.calories ?? 2000;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const dateLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting} 👋</Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
        <Pressable testID="scan-shortcut" onPress={() => router.push("/scan")} style={styles.scanBtn}>
          <Ionicons name="scan" size={20} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing || isRefetching} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {goals?.athlete_mode ? (
          <View style={styles.athleteChip} testID="athlete-chip">
            <Ionicons name="barbell" size={14} color={colors.brandPrimary} />
            <Text style={styles.athleteText}>
              Modo Atleta ativo{data?.workout_calories ? ` · +${data.workout_calories} kcal de treino` : ""}
            </Text>
          </View>
        ) : null}

        <Animated.View entering={FadeInDown.duration(400)}>
          <Card testID="calorie-card" style={styles.heroCard}>
            <CalorieRing consumed={totals.calories} target={target} />
            <View style={styles.macros}>
              <MacroBar label="Proteínas" consumed={totals.protein} target={goals?.protein ?? 120} color={colors.brandPrimary} />
              <MacroBar label="Carboidratos" consumed={totals.carbs} target={goals?.carbs ?? 220} color="#38BDF8" />
              <MacroBar label="Gorduras" consumed={totals.fat} target={goals?.fat ?? 60} color={colors.warning} />
            </View>
            <View style={styles.statsRow}>
              <Stat label="Meta" value={`${Math.round(target)}`} unit="kcal" />
              <View style={styles.statDivider} />
              <Stat label="Consumido" value={`${Math.round(totals.calories)}`} unit="kcal" />
              <View style={styles.statDivider} />
              <Stat label="Restante" value={`${Math.max(0, Math.round(target - totals.calories))}`} unit="kcal" />
            </View>
          </Card>
        </Animated.View>

        <WaterWidget date={date} />

        <Pressable testID="quick-add-food" onPress={() => router.push(`/add-food?meal=almoco&date=${date}`)} style={styles.addRow}>
          <View style={styles.addIcon}>
            <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.addTitle}>Adicionar alimento</Text>
            <Text style={styles.addSub}>Buscar, calcular ou escanear com a câmera</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        <Pressable testID="open-assistant" onPress={() => router.push("/assistant")} style={styles.addRow}>
          <View style={[styles.addIcon, { backgroundColor: colors.brandTertiary }]}>
            <Ionicons name="sparkles" size={20} color={colors.brandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.addTitle}>Nutri IA</Text>
            <Text style={styles.addSub}>Tire dúvidas e receba dicas com base nas suas metas</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        <Card>
          <Text style={styles.sectionTitle}>Resumo de hoje</Text>
          <View style={styles.summaryGrid}>
            <SummaryCell icon="flame" color={colors.warning} label="Calorias" value={`${Math.round(totals.calories)}`} />
            <SummaryCell icon="restaurant" color={colors.brandPrimary} label="Refeições" value={`${Object.values(data?.meals ?? {}).reduce((a, m) => a + m.entries.length, 0)}`} />
            <SummaryCell icon="barbell" color="#38BDF8" label="Treino" value={`${data?.workout_calories ?? 0} kcal`} />
          </View>
        </Card>

        {!isLoading && totals.calories === 0 ? (
          <Text style={styles.emptyHint}>Nenhuma refeição registrada hoje. Comece adicionando seu café da manhã.</Text>
        ) : null}

        <Text style={styles.disclaimer}>As estimativas são aproximadas e não substituem orientação nutricional profissional.</Text>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SummaryCell({ icon, color, label, value }: { icon: any; color: string; label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.summaryCell}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  greeting: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  date: { color: colors.muted, fontSize: 13, marginTop: 2, textTransform: "capitalize" },
  scanBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  athleteChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  athleteText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  heroCard: { alignItems: "center", gap: spacing.xl },
  macros: { width: "100%", gap: spacing.lg },
  statsRow: { flexDirection: "row", alignItems: "center", width: "100%", justifyContent: "space-between" },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  statUnit: { color: colors.muted, fontSize: 11 },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: colors.divider },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  addSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sectionTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginBottom: spacing.md },
  summaryGrid: { flexDirection: "row", gap: spacing.md },
  summaryCell: { flex: 1, alignItems: "center", gap: 6, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.lg },
  summaryValue: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  summaryLabel: { color: colors.muted, fontSize: 11 },
  emptyHint: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 20 },
  disclaimer: { color: colors.muted, fontSize: 11, textAlign: "center", opacity: 0.7, lineHeight: 16, marginTop: spacing.sm },
}));
