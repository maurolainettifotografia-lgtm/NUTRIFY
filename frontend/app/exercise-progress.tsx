import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { ResponsiveChart } from "@/src/components/responsive-chart";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Card } from "@/src/components/primitives";
import { ProgressPoint, useExerciseProgress, useProgressExercises } from "@/src/hooks";
import { formatKg, formatShortDate } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Metric = "est_1rm" | "max_weight" | "volume" | "max_reps";
const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: "est_1rm", label: "1RM estimado", unit: "kg" },
  { key: "max_weight", label: "Carga máxima", unit: "kg" },
  { key: "volume", label: "Volume", unit: "kg" },
  { key: "max_reps", label: "Repetições", unit: "reps" },
];

export default function ExerciseProgressScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const list = useProgressExercises();
  const exercises = list.data?.results ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const name = picked ?? exercises[0]?.name ?? null;
  const detail = useExerciseProgress(name);

  const [selectedMetric, setMetric] = useState<Metric>("est_1rm");
  const [metricTouched, setMetricTouched] = useState(false);
  const points: ProgressPoint[] = detail.data?.points ?? [];

  const metric: Metric = metricTouched ? selectedMetric : points.some((p) => p.est_1rm > 0) || points.length === 0 ? "est_1rm" : "max_reps";

  const info = METRICS.find((m) => m.key === metric)!;
  const chartData = points.map((p) => ({ value: p[metric], label: formatShortDate(p.date) }));
  const rec = detail.data?.records;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable testID="close-progress" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Evolução por exercício</Text>
        <View style={styles.iconBtn} />
      </View>

      {list.isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing["2xl"] }} />
      ) : exercises.length === 0 ? (
        <Text style={styles.empty} testID="progress-empty">
          Faça seu primeiro treino para acompanhar a evolução de cada exercício aqui.
        </Text>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {exercises.map((e) => (
              <Pressable key={e.name} testID={`progress-ex-${e.name}`} onPress={() => { setPicked(e.name); setMetricTouched(false); }} style={[styles.chip, name === e.name && styles.chipActive]}>
                <Text style={[styles.chipText, name === e.name && styles.chipTextActive]} numberOfLines={1}>{e.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {detail.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}

          {rec && (rec.max_weight || rec.best_1rm) ? (
            <Card testID="progress-records" style={styles.recCard}>
              <Text style={styles.cardTitle}>Seus recordes</Text>
              <View style={styles.recRow}>
                {rec.max_weight ? (
                  <View style={styles.recBox}>
                    <Ionicons name="trophy" size={18} color={colors.warning} />
                    <Text style={styles.recValue}>{formatKg(rec.max_weight.value)} kg</Text>
                    <Text style={styles.recLabel}>Carga máxima · {formatShortDate(rec.max_weight.date)}</Text>
                  </View>
                ) : null}
                {rec.best_1rm ? (
                  <View style={styles.recBox}>
                    <Ionicons name="flash" size={18} color={colors.brandPrimary} />
                    <Text style={styles.recValue}>{formatKg(rec.best_1rm.value)} kg</Text>
                    <Text style={styles.recLabel}>1RM estimado · {formatShortDate(rec.best_1rm.date)}</Text>
                  </View>
                ) : null}
              </View>
            </Card>
          ) : null}

          {points.length > 0 ? (
            <Card>
              <Text style={styles.cardTitle}>{name}</Text>
              <View style={styles.metricRow}>
                {METRICS.map((m) => (
                  <Pressable key={m.key} testID={`metric-${m.key}`} onPress={() => { setMetric(m.key); setMetricTouched(true); }} style={[styles.metricBtn, metric === m.key && styles.metricActive]}>
                    <Text style={[styles.metricText, metric === m.key && styles.metricTextActive]}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>
              {points.length >= 2 ? (
                <ResponsiveChart data={chartData} />
              ) : (
                <Text style={styles.hint} testID="progress-one-point">
                  Só há um treino deste exercício ({formatKg(points[0][metric])} {info.unit}). Treine de novo para ver a curva.
                </Text>
              )}
              {metric === "est_1rm" ? (
                <Text style={styles.footnote}>O 1RM é uma estimativa da carga máxima para 1 repetição (fórmula de Epley, séries de até 12 repetições).</Text>
              ) : null}
            </Card>
          ) : null}

          {points.length > 0 ? (
            <>
              <Text style={styles.section}>Histórico</Text>
              {[...points].reverse().map((p, i) => (
                <View key={`${p.date}-${i}`} style={styles.histRow}>
                  <Text style={styles.histDate}>{formatShortDate(p.date)}</Text>
                  <Text style={styles.histSets} numberOfLines={2}>
                    {p.sets.map((s) => (s.weight_kg > 0 ? `${s.reps}×${formatKg(s.weight_kg)}kg` : `${s.reps} reps`)).join(" · ")}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  empty: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: spacing["2xl"], paddingHorizontal: spacing.xl },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.md },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: { maxWidth: 220, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  cardTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  recCard: { gap: spacing.md },
  recRow: { flexDirection: "row", gap: spacing.md },
  recBox: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  recValue: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
  recLabel: { color: colors.muted, fontSize: 11 },
  metricRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginVertical: spacing.md },
  metricBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  metricActive: { backgroundColor: colors.brandPrimary },
  metricText: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "600" },
  metricTextActive: { color: colors.onBrandPrimary },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  footnote: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: spacing.md },
  section: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: spacing.sm },
  histRow: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  histDate: { color: colors.onSurface, fontSize: 13, fontWeight: "700", width: 44 },
  histSets: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 13 },
}));
