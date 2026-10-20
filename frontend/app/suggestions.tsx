import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { apiFetch } from "@/src/api";
import { Button } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { MEALS, MEAL_LABELS, todayStr } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Macros = { calories: number; protein: number; carbs: number; fat: number };
type Item = Macros & { name: string; grams: number; fiber?: number; source: string; code: string; computed: Macros };
type Suggestion = { id: string; title: string; description: string; items: Item[]; totals: Macros };
type Resp = { meal: string; remaining: Macros; suggestions: Suggestion[] };

function defaultMeal() {
  const h = new Date().getHours();
  if (h < 10) return "cafe_manha";
  if (h < 12) return "lanche_manha";
  if (h < 15) return "almoco";
  if (h < 18) return "lanche_tarde";
  if (h < 21) return "jantar";
  return "ceia";
}

export default function Suggestions() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ meal?: string }>();
  const [meal, setMeal] = useState(params.meal ?? defaultMeal());
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const date = todayStr();

  const gen = useMutation({
    mutationFn: () => apiFetch<Resp>("/ai/meal-suggestions", { method: "POST", body: { meal, date } }),
    onSuccess: (r) => {
      setAdded({});
      if (!r.suggestions.length) toast.show("Não consegui montar sugestões. Tente novamente.", "info");
    },
    onError: (e: any) => toast.show(e?.message ?? "Erro ao gerar sugestões", "error"),
  });

  const add = useMutation({
    mutationFn: async (s: Suggestion) => {
      for (const it of s.items) {
        await apiFetch("/diary", {
          method: "POST",
          body: {
            date, meal, name: it.name, brand: "TACO", grams: it.grams,
            calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat, fiber: it.fiber ?? 0,
            source: "taco", code: it.code,
          },
        });
      }
      return s.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["diary", date] });
      setAdded((a) => ({ ...a, [id]: true }));
      toast.show(`Refeição adicionada ao ${MEAL_LABELS[meal]}`);
    },
    onError: () => toast.show("Erro ao adicionar", "error"),
  });

  const data = gen.data;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable testID="close-suggestions" onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Sugestões de refeições</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Para qual refeição?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.chipScroller}>
          {MEALS.map((m) => {
            const active = m.key === meal;
            return (
              <Pressable key={m.key} testID={`sugg-meal-${m.key}`} onPress={() => setMeal(m.key)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Button
          testID="generate-suggestions"
          label={data ? "Gerar novas sugestões" : "Sugerir refeições"}
          onPress={() => gen.mutate()}
          loading={gen.isPending}
        />

        {gen.isPending ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.loadingText}>Montando refeições brasileiras para suas metas...</Text>
          </View>
        ) : null}

        {data && !gen.isPending ? (
          <>
            <View style={styles.remaining} testID="remaining-card">
              <Text style={styles.remainingTitle}>Faltam hoje</Text>
              <View style={styles.remainingRow}>
                <Rem value={data.remaining.calories} unit="kcal" />
                <Rem value={data.remaining.protein} unit="g prot" />
                <Rem value={data.remaining.carbs} unit="g carb" />
                <Rem value={data.remaining.fat} unit="g gord" />
              </View>
            </View>

            {data.suggestions.map((s, idx) => (
              <View key={s.id} style={styles.card} testID={`suggestion-card-${idx}`}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>{s.title}</Text>
                  <Text style={styles.cardKcal}>{Math.round(s.totals.calories)} kcal</Text>
                </View>
                {s.description ? <Text style={styles.cardDesc}>{s.description}</Text> : null}
                <View style={styles.items}>
                  {s.items.map((it, i) => (
                    <View key={i} style={styles.itemRow}>
                      <View style={styles.dot} />
                      <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                      <Text style={styles.itemGrams}>{it.grams} g</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.macros}>
                  P {Math.round(s.totals.protein)} g · C {Math.round(s.totals.carbs)} g · G {Math.round(s.totals.fat)} g
                </Text>
                <Button
                  testID={`add-suggestion-${idx}`}
                  label={added[s.id] ? "Adicionado ✓" : `Adicionar ao ${MEAL_LABELS[meal]}`}
                  variant={added[s.id] ? "secondary" : "primary"}
                  disabled={!!added[s.id]}
                  loading={add.isPending && add.variables?.id === s.id}
                  onPress={() => add.mutate(s)}
                />
              </View>
            ))}
          </>
        ) : null}

        {!data && !gen.isPending ? (
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={40} color={colors.brandPrimary} />
            <Text style={styles.emptyText}>
              A IA monta 3 opções com alimentos brasileiros (tabela TACO) para completar o que falta das suas metas hoje.
            </Text>
          </View>
        ) : null}

        <Text style={styles.disclaimer}>Sugestões geradas por IA. Não substituem orientação de um nutricionista.</Text>
      </ScrollView>
    </View>
  );
}

function Rem({ value, unit }: { value: number; unit: string }) {
  const styles = useStyles();
  return (
    <View style={styles.rem}>
      <Text style={styles.remValue}>{Math.round(value)}</Text>
      <Text style={styles.remUnit}>{unit}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  label: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  chipScroller: { flexGrow: 0, marginTop: -spacing.sm },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.brandPrimary },
  loading: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
  loadingText: { color: colors.muted, fontSize: 13, textAlign: "center" },
  remaining: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  remainingTitle: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  remainingRow: { flexDirection: "row", justifyContent: "space-between" },
  rem: { alignItems: "center", flex: 1 },
  remValue: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  remUnit: { color: colors.muted, fontSize: 11 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  cardTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", flex: 1 },
  cardKcal: { color: colors.brandPrimary, fontSize: 15, fontWeight: "800" },
  cardDesc: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: -spacing.sm },
  items: { gap: spacing.sm },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 999, backgroundColor: colors.brandPrimary },
  itemName: { color: colors.onSurfaceSecondary, fontSize: 14, flex: 1 },
  itemGrams: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  macros: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  disclaimer: { color: colors.muted, fontSize: 11, textAlign: "center", opacity: 0.7 },
}));
