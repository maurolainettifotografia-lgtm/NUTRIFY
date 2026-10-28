import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { apiFetch } from "@/src/api";
import { Button } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Ingredient = {
  name: string; brand?: string | null; code?: string | null; source?: string;
  grams: number; calories: number; protein: number; carbs: number; fat: number; fiber?: number;
};
type Food = Omit<Ingredient, "grams">;

export default function RecipeEditor() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState("");
  const [servings, setServings] = useState("4");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const debounceT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const existing = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => apiFetch<{ name: string; servings: number; ingredients: Ingredient[] }>(`/recipes/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (existing.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Preenche o formulário ao carregar uma receita.
      setName(existing.data.name);
      setServings(String(existing.data.servings));
      setIngredients(existing.data.ingredients);
    }
  }, [existing.data]);

  const onChangeQuery = (t: string) => {
    setQ(t);
    if (debounceT.current) clearTimeout(debounceT.current);
    debounceT.current = setTimeout(() => setDebounced(t), 450);
  };

  const search = useQuery({
    queryKey: ["foods-search", debounced],
    queryFn: () => apiFetch<{ results: Food[] }>("/foods/search", { params: { q: debounced } }),
    enabled: debounced.trim().length >= 2,
  });

  const addIngredient = (f: Food) => {
    setIngredients((list) => [...list, { ...f, grams: 100 }]);
    setQ("");
    setDebounced("");
  };

  const setGrams = (idx: number, v: string) =>
    setIngredients((list) => list.map((it, i) => (i === idx ? { ...it, grams: Number(v.replace(/[^0-9]/g, "")) || 0 } : it)));
  const remove = (idx: number) => setIngredients((list) => list.filter((_, i) => i !== idx));

  const totals = ingredients.reduce(
    (a, it) => ({
      calories: a.calories + (it.calories * it.grams) / 100,
      protein: a.protein + (it.protein * it.grams) / 100,
      carbs: a.carbs + (it.carbs * it.grams) / 100,
      fat: a.fat + (it.fat * it.grams) / 100,
      grams: a.grams + it.grams,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, grams: 0 },
  );
  const nServ = Number(servings) || 0;
  const per = (v: number) => (nServ > 0 ? Math.round(v / nServ) : 0);
  const valid = name.trim().length >= 2 && nServ > 0 && ingredients.some((i) => i.grams > 0);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        servings: nServ,
        ingredients: ingredients.filter((i) => i.grams > 0).map((i) => ({
          name: i.name, brand: i.brand ?? null, code: i.code ?? null, source: i.source ?? null, grams: i.grams,
          calories: i.calories, protein: i.protein, carbs: i.carbs, fat: i.fat, fiber: i.fiber ?? 0,
        })),
      };
      return apiFetch(id ? `/recipes/${id}` : "/recipes", { method: id ? "PUT" : "POST", body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["recipe", id] });
      toast.show(id ? "Receita atualizada" : "Receita salva");
      router.back();
    },
    onError: (e: any) => toast.show(e?.message ?? "Erro ao salvar receita", "error"),
  });

  const del = useMutation({
    mutationFn: () => apiFetch(`/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.show("Receita excluída");
      router.back();
    },
  });

  const confirmDelete = () => {
    if (Platform.OS === "web") {
      del.mutate();
      return;
    }
    Alert.alert("Excluir receita", "Deseja excluir esta receita?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => del.mutate() },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable testID="close-recipe" onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{id ? "Editar receita" : "Nova receita"}</Text>
        {id ? (
          <Pressable testID="delete-recipe" onPress={confirmDelete} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {id && existing.isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing["2xl"] }} />
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
          bottomOffset={20}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.row}>
            <View style={{ flex: 2, gap: 6 }}>
              <Text style={styles.label}>Nome da receita</Text>
              <TextInput testID="recipe-name" value={name} onChangeText={setName} placeholder="Ex: Bolo de banana" placeholderTextColor={colors.muted} style={styles.input} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.label}>Rende (porções)</Text>
              <TextInput testID="recipe-servings" value={servings} onChangeText={(t) => setServings(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" style={[styles.input, { textAlign: "center" }]} />
            </View>
          </View>

          <View style={styles.summary} testID="recipe-summary">
            <Text style={styles.summaryTitle}>Por porção {nServ > 0 && totals.grams > 0 ? `(${per(totals.grams)} g)` : ""}</Text>
            <View style={styles.summaryRow}>
              <Cell value={per(totals.calories)} label="kcal" />
              <Cell value={per(totals.protein)} label="Prot" />
              <Cell value={per(totals.carbs)} label="Carb" />
              <Cell value={per(totals.fat)} label="Gord" />
            </View>
            <Text style={styles.summaryTotal}>Receita inteira: {Math.round(totals.calories)} kcal · {Math.round(totals.grams)} g</Text>
          </View>

          <Text style={styles.section}>Ingredientes ({ingredients.length})</Text>
          {ingredients.map((it, i) => (
            <View key={`${it.name}-${i}`} style={styles.ingRow} testID={`ingredient-${i}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ingName} numberOfLines={1}>{it.name}</Text>
                <Text style={styles.ingSub}>{Math.round((it.calories * it.grams) / 100)} kcal</Text>
              </View>
              <View style={styles.gramsBox}>
                <TextInput testID={`ingredient-grams-${i}`} value={String(it.grams)} onChangeText={(v) => setGrams(i, v)} keyboardType="number-pad" style={styles.gramsInput} />
                <Text style={styles.gramsUnit}>g</Text>
              </View>
              <Pressable testID={`remove-ingredient-${i}`} onPress={() => remove(i)} hitSlop={8} style={styles.removeBtn}>
                <Ionicons name="close-circle" size={22} color={colors.muted} />
              </Pressable>
            </View>
          ))}

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              testID="ingredient-search"
              value={q}
              onChangeText={onChangeQuery}
              placeholder="Adicionar ingrediente (ex: ovo, farinha)"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
            {search.isFetching ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : null}
          </View>
          {debounced.length >= 2 && !search.isFetching
            ? (search.data?.results ?? []).filter((f) => f.source !== "recipe").slice(0, 12).map((f, i) => (
                <Pressable key={`${f.code ?? f.name}-${i}`} testID={`ingredient-result-${f.name}`} onPress={() => addIngredient(f)} style={styles.resultRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ingName} numberOfLines={1}>{f.name}</Text>
                    <Text style={styles.ingSub} numberOfLines={1}>{f.brand ? `${f.brand} · ` : ""}{Math.round(f.calories)} kcal / 100g</Text>
                  </View>
                  <Ionicons name="add-circle" size={22} color={colors.brandPrimary} />
                </Pressable>
              ))
            : null}
        </KeyboardAwareScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button testID="save-recipe" label={id ? "Salvar alterações" : "Salvar receita"} onPress={() => save.mutate()} disabled={!valid} loading={save.isPending} />
      </View>
    </View>
  );
}

function Cell({ value, label }: { value: number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.cell}>
      <Text style={styles.cellValue}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  input: { minHeight: 48, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, color: colors.onSurface, fontSize: 15 },
  summary: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  summaryTitle: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  summaryRow: { flexDirection: "row", gap: spacing.sm },
  summaryTotal: { color: colors.muted, fontSize: 12 },
  cell: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.sm },
  cellValue: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  cellLabel: { color: colors.muted, fontSize: 11 },
  section: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: spacing.sm },
  ingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  ingName: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  ingSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  gramsBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, width: 84 },
  gramsInput: { flex: 1, minWidth: 0, color: colors.onSurface, fontSize: 15, fontWeight: "700", paddingVertical: spacing.sm, textAlign: "right" },
  gramsUnit: { color: colors.muted, fontSize: 13, marginLeft: 4 },
  removeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 15, paddingVertical: spacing.md },
  resultRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingVertical: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
}));
