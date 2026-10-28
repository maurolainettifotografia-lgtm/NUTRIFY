import React, { useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { ResponsiveChart } from "@/src/components/responsive-chart";
import { todayStr } from "@/src/constants";
import { useAuth } from "@/src/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet, { BottomSheetBackdrop, BottomSheetTextInput, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";

import { apiFetch } from "@/src/api";
import { Button, Card } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Report = {
  period: string;
  daily: { date: string; calories: number; protein: number; carbs: number; fat: number }[];
  averages: { calories: number; protein: number; carbs: number; fat: number };
  goals: { calories: number; protein: number; carbs: number; fat: number };
  weights: { date: string; weight_kg: number }[];
};

export default function Reports() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [period, setPeriod] = useState<"week" | "month">("week");
  const sheetRef = useRef<BottomSheet>(null);
  const [weightInput, setWeightInput] = useState("");

  const { data, isError, refetch, isFetching } = useQuery<Report>({
    queryKey: ["reports", period, user?.user_id],
    queryFn: () => apiFetch<Report>("/reports", { params: { period } }),
  });

  const addWeight = useMutation({
    mutationFn: () => apiFetch("/weight", { method: "POST", body: { weight_kg: Number(weightInput.replace(",", ".")), date: todayStr() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      sheetRef.current?.close();
      setWeightInput("");
      toast.show("Peso registrado");
    },
    onError: () => toast.show("Erro ao registrar peso", "error"),
  });


  const calBars = (data?.daily ?? []).map((d) => ({
    value: Math.round(d.calories),
    label: d.date.slice(8, 10),
    frontColor: colors.brandPrimary,
  }));

  const weightLine = (data?.weights ?? []).slice(-12).map((w) => ({
    value: w.weight_kg,
    label: w.date.slice(5),
  }));

  const avg = data?.averages ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const goals = data?.goals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Evolução</Text>
        <Pressable testID="add-weight" onPress={() => sheetRef.current?.expand()} style={styles.addWeightBtn}>
          <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.addWeightText}>Peso</Text>
        </Pressable>
      </View>

      <View style={styles.periodRow}>
        {(["week", "month"] as const).map((p) => (
          <Pressable key={p} testID={`period-${p}`} onPress={() => setPeriod(p)} style={[styles.periodBtn, period === p && styles.periodActive]}>
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{p === "week" ? "Semana" : "Mês"}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={colors.brandPrimary} />} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {isError ? <Text style={styles.empty}>Não foi possível carregar sua evolução. Puxe para atualizar.</Text> : null}
        <Card>
          <Text style={styles.cardTitle}>Evolução do peso</Text>
          {weightLine.length >= 2 ? (
            <ResponsiveChart data={weightLine} />
          ) : (
            <Text style={styles.empty}>Registre ao menos 2 medições para ver o gráfico.</Text>
          )}
          {(data?.weights ?? []).slice(-5).reverse().map(w => <Text key={w.date} style={{ color: colors.onSurfaceSecondary, marginTop: 6 }}>{w.date.split("-").reverse().join("/")} · {String(w.weight_kg).replace(".", ",")} kg</Text>)}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Calorias por dia</Text>
          {calBars.some((b) => b.value > 0) ? (
            <ResponsiveChart data={calBars} bars />
          ) : (
            <Text style={styles.empty}>Sem dados suficientes para o período.</Text>
          )}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Médias diárias vs meta</Text>
          <AvgRow label="Calorias" value={avg.calories} goal={goals.calories} unit="kcal" color={colors.warning} />
          <AvgRow label="Proteínas" value={avg.protein} goal={goals.protein} unit="g" color={colors.brandPrimary} />
          <AvgRow label="Carboidratos" value={avg.carbs} goal={goals.carbs} unit="g" color="#38BDF8" />
          <AvgRow label="Gorduras" value={avg.fat} goal={goals.fat} unit="g" color={colors.warning} />
        </Card>


      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={[280]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />}
      >
        <BottomSheetView style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>Registrar peso</Text>
          <View style={styles.weightInputRow}>
            <BottomSheetTextInput
              testID="weight-input"
              value={weightInput}
              onChangeText={(t) => setWeightInput(t.replace(/[^0-9.,]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="72.5"
              placeholderTextColor={colors.muted}
              style={styles.weightInput}
            />
            <Text style={styles.weightUnit}>kg</Text>
          </View>
          <Button testID="save-weight" label="Salvar" onPress={() => addWeight.mutate()} disabled={!(Number(weightInput.replace(",", ".")) >= 20 && Number(weightInput.replace(",", ".")) <= 500)} loading={addWeight.isPending} />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

function AvgRow({ label, value, goal, unit, color }: { label: string; value: number; goal: number; unit: string; color: string }) {
  const styles = useStyles();
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <View style={styles.avgRow}>
      <View style={styles.avgHeader}>
        <Text style={styles.avgLabel}>{label}</Text>
        <Text style={styles.avgValue}>
          {Math.round(value)} <Text style={styles.avgGoal}>/ {Math.round(goal)} {unit}</Text>
        </Text>
      </View>
      <View style={styles.avgTrack}>
        <View style={[styles.avgFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "800" },
  addWeightBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  addWeightText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "700" },
  periodRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  periodBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center" },
  periodActive: { backgroundColor: colors.brandPrimary },
  periodText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  periodTextActive: { color: colors.onBrandPrimary },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  cardTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginBottom: spacing.md },
  empty: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: spacing.xl },
  avgRow: { gap: 6, marginBottom: spacing.md },
  avgHeader: { flexDirection: "row", justifyContent: "space-between" },
  avgLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  avgValue: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  avgGoal: { color: colors.muted, fontWeight: "500" },
  avgTrack: { height: 8, borderRadius: 999, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  avgFill: { height: 8, borderRadius: 999 },
  metaRow: { flexDirection: "row", gap: spacing.md },
  metaCell: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.lg },
  metaValue: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  metaLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  disclaimer: { color: colors.muted, fontSize: 11, marginTop: spacing.md, opacity: 0.7, lineHeight: 16 },
  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  sheetTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  weightInputRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  weightInput: { flex: 1, color: colors.onSurface, fontSize: 24, fontWeight: "700", paddingVertical: spacing.md },
  weightUnit: { color: colors.muted, fontSize: 16, fontWeight: "600" },
}));
