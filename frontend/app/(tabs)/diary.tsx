import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { apiFetch } from "@/src/api";
import { Card } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { DiaryEntry, useDiary } from "@/src/hooks";
import { MEALS, toDateStr, todayStr } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export default function Diary() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const { data } = useDiary(date);

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/diary/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diary", date] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.show("Alimento removido");
    },
  });

  const copy = useMutation({
    mutationFn: () => apiFetch("/diary/copy", { method: "POST", body: { from_date: addDays(date, -1), to_date: date } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["diary", date] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.show(r.copied > 0 ? `${r.copied} itens copiados de ontem` : "Nada para copiar de ontem", r.copied > 0 ? "success" : "info");
    },
  });

  const isToday = date === todayStr();
  const dLabel = new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
  const totals = data?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const target = data?.target_calories ?? 2000;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Diário</Text>
        <Pressable testID="copy-yesterday" onPress={() => copy.mutate()} style={styles.copyBtn}>
          <Ionicons name="copy-outline" size={16} color={colors.onSurfaceSecondary} />
          <Text style={styles.copyText}>Copiar ontem</Text>
        </Pressable>
      </View>

      <View style={styles.dateNav}>
        <Pressable testID="prev-day" onPress={() => setDate((d) => addDays(d, -1))} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.dateLabel}>{isToday ? "Hoje" : dLabel}</Text>
        <Pressable testID="next-day" onPress={() => setDate((d) => addDays(d, 1))} hitSlop={10} disabled={isToday}>
          <Ionicons name="chevron-forward" size={22} color={isToday ? colors.border : colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Card style={styles.totalCard}>
          <View style={styles.totalItem}>
            <Text style={styles.totalValue}>{Math.round(totals.calories)}</Text>
            <Text style={styles.totalLabel}>/ {Math.round(target)} kcal</Text>
          </View>
          <View style={styles.totalMacros}>
            <TotalMacro label="P" value={totals.protein} color={colors.brandPrimary} />
            <TotalMacro label="C" value={totals.carbs} color="#38BDF8" />
            <TotalMacro label="G" value={totals.fat} color={colors.warning} />
          </View>
        </Card>

        {MEALS.map((meal) => {
          const m = data?.meals[meal.key];
          const entries = m?.entries ?? [];
          return (
            <Card key={meal.key} testID={`meal-${meal.key}`}>
              <View style={styles.mealHeader}>
                <View style={styles.mealTitleRow}>
                  <Ionicons name={meal.icon as any} size={18} color={colors.brandPrimary} />
                  <Text style={styles.mealTitle}>{meal.label}</Text>
                </View>
                <Text style={styles.mealKcal}>{Math.round(m?.calories ?? 0)} kcal</Text>
              </View>

              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} onDelete={() => del.mutate(e.id)} />
              ))}

              <Pressable
                testID={`add-${meal.key}`}
                onPress={() => router.push(`/add-food?meal=${meal.key}&date=${date}`)}
                style={styles.addMeal}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.brandPrimary} />
                <Text style={styles.addMealText}>Adicionar alimento</Text>
              </Pressable>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

function EntryRow({ entry, onDelete }: { entry: DiaryEntry; onDelete: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.entry}>
      <View style={{ flex: 1 }}>
        <Text style={styles.entryName} numberOfLines={entry.items ? 3 : 1}>{entry.name}</Text>
        {entry.items?.map((item, i) => <Text key={i} style={styles.entrySub}>{item.grams} g · {item.name} · ~{Math.round(item.calories * item.grams / 100)} kcal</Text>)}
        {entry.estimated ? <Text style={styles.entrySub}>{entry.source === "ai_text" ? "Estimativa da IA" : "Estimativa · TACO/referências comuns"}</Text> : null}
        <Text style={styles.entrySub}>
          {Math.round(entry.grams)} g · {Math.round(entry.computed.calories)} kcal · P {Math.round(entry.computed.protein)} C {Math.round(entry.computed.carbs)} G {Math.round(entry.computed.fat)}
        </Text>
      </View>
      <Pressable testID={`delete-${entry.id}`} onPress={onDelete} hitSlop={8} style={styles.delBtn}>
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </Pressable>
    </View>
  );
}

function TotalMacro({ label, value, color }: { label: string; value: number; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tmacro}>
      <View style={[styles.tdot, { backgroundColor: color }]} />
      <Text style={styles.tmacroText}>
        {label} {Math.round(value)}g
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "800" },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  copyText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xl, paddingBottom: spacing.md },
  dateLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "700", textTransform: "capitalize", minWidth: 120, textAlign: "center" },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  totalCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalItem: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  totalValue: { color: colors.onSurface, fontSize: 28, fontWeight: "800" },
  totalLabel: { color: colors.muted, fontSize: 13 },
  totalMacros: { flexDirection: "row", gap: spacing.md },
  tmacro: { flexDirection: "row", alignItems: "center", gap: 5 },
  tdot: { width: 8, height: 8, borderRadius: 999 },
  tmacroText: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "600" },
  mealHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  mealTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mealTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  mealKcal: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  entry: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  entryName: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  entrySub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  delBtn: { padding: 6 },
  addMeal: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  addMealText: { color: colors.brandPrimary, fontSize: 13, fontWeight: "600" },
}));
