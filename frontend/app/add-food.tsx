import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet, { BottomSheetBackdrop, BottomSheetTextInput, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";

import { apiFetch } from "@/src/api";
import { Button } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { MEAL_LABELS, MEALS } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Food = {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugars?: number;
  sodium?: number;
  source?: string;
  code?: string;
  serving?: string;
  id?: string;
};

const TABS = [
  { key: "search", label: "Buscar" },
  { key: "favorites", label: "Favoritos" },
  { key: "custom", label: "Meus alimentos" },
] as const;

export default function AddFood() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const [meal, setMeal] = useState(params.meal ?? "almoco");
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("search");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState("100");
  const [showCreate, setShowCreate] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);
  const debounceT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChangeQuery = useCallback((t: string) => {
    setQ(t);
    if (debounceT.current) clearTimeout(debounceT.current);
    debounceT.current = setTimeout(() => setDebounced(t), 450);
  }, []);

  const search = useQuery({
    queryKey: ["foods-search", debounced],
    queryFn: () => apiFetch<{ results: Food[] }>("/foods/search", { params: { q: debounced } }),
    enabled: tab === "search" && debounced.trim().length >= 2,
  });

  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () => apiFetch<{ results: Food[] }>("/foods/favorites"),
    enabled: tab === "favorites",
  });

  const custom = useQuery({
    queryKey: ["custom-foods"],
    queryFn: () => apiFetch<{ results: Food[] }>("/foods/custom"),
    enabled: tab === "custom",
  });

  const openPortion = (f: Food) => {
    setSelected(f);
    setGrams("100");
    sheetRef.current?.expand();
  };

  const add = useMutation({
    mutationFn: () => {
      const f = selected!;
      return apiFetch("/diary", {
        method: "POST",
        body: {
          date,
          meal,
          name: f.name,
          brand: f.brand ?? null,
          grams: Number(grams) || 100,
          calories: f.calories,
          protein: f.protein,
          carbs: f.carbs,
          fat: f.fat,
          fiber: f.fiber ?? 0,
          sugars: f.sugars ?? 0,
          sodium: f.sodium ?? 0,
          source: f.source ?? "off",
          code: f.code ?? null,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diary", date] });
      sheetRef.current?.close();
      toast.show(`Adicionado ao ${MEAL_LABELS[meal]}`);
      setSelected(null);
    },
    onError: () => toast.show("Erro ao adicionar", "error"),
  });

  const toggleFav = useMutation({
    mutationFn: (f: Food) => apiFetch("/foods/favorites", { method: "POST", body: { food: f } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["favorites"] });
      toast.show("Salvo nos favoritos");
    },
  });

  const factor = (Number(grams) || 0) / 100;
  const list = tab === "search" ? search.data?.results : tab === "favorites" ? favorites.data?.results : custom.data?.results;
  const loading = tab === "search" ? search.isFetching : tab === "favorites" ? favorites.isLoading : custom.isLoading;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable testID="close-add-food" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Adicionar alimento</Text>
        <Pressable testID="open-scan" onPress={() => router.replace("/scan")} hitSlop={10}>
          <Ionicons name="camera-outline" size={24} color={colors.brandPrimary} />
        </Pressable>
      </View>

      {/* meal chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={MEALS}
        keyExtractor={(m) => m.key}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroller}
        renderItem={({ item }) => {
          const active = item.key === meal;
          return (
            <Pressable testID={`meal-chip-${item.key}`} onPress={() => setMeal(item.key)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      {/* tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} testID={`tab-${t.key}`} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "search" ? (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="food-search-input"
            value={q}
            onChangeText={onChangeQuery}
            placeholder="Buscar alimento (ex: arroz, banana)"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoFocus
          />
          {q.length > 0 ? (
            <Pressable onPress={() => { setQ(""); setDebounced(""); }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {tab === "custom" ? (
        <Pressable testID="create-custom-food" onPress={() => setShowCreate(true)} style={styles.createRow}>
          <Ionicons name="add-circle" size={20} color={colors.brandPrimary} />
          <Text style={styles.createText}>Criar alimento personalizado</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={list ?? []}
          keyExtractor={(item, i) => item.id ?? item.code ?? `${item.name}-${i}`}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable testID={`food-result-${item.name}`} onPress={() => openPortion(item)} style={styles.foodRow}>
              <View style={styles.foodIcon}>
                <Ionicons name={item.source === "custom" ? "create-outline" : "fast-food-outline"} size={18} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.foodSub} numberOfLines={1}>
                  {item.brand ? `${item.brand} · ` : ""}{Math.round(item.calories)} kcal / 100g
                </Text>
              </View>
              <Ionicons name="add" size={22} color={colors.brandPrimary} />
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === "search"
                ? debounced.length < 2
                  ? "Digite ao menos 2 letras para buscar."
                  : "Nenhum resultado encontrado."
                : tab === "favorites"
                  ? "Nenhum favorito ainda."
                  : "Nenhum alimento personalizado."}
            </Text>
          }
        />
      )}

      {/* Portion bottom sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={[440]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />}
      >
        <BottomSheetView style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          {selected ? (
            <>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle} numberOfLines={2}>{selected.name}</Text>
                {selected.source !== "custom" ? (
                  <Pressable testID="save-favorite" onPress={() => toggleFav.mutate(selected)} hitSlop={8}>
                    <Ionicons name="star-outline" size={22} color={colors.brandPrimary} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.gramsWrap}>
                <Text style={styles.gramsLabel}>Quantidade</Text>
                <View style={styles.gramsInputRow}>
                  <BottomSheetTextInput
                    testID="grams-input"
                    value={grams}
                    onChangeText={(t) => setGrams(t.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    style={styles.gramsInput}
                  />
                  <Text style={styles.gramsUnit}>g</Text>
                </View>
              </View>

              <View style={styles.quickGrams}>
                {[50, 100, 150, 200].map((g) => (
                  <Pressable key={g} testID={`quick-grams-${g}`} onPress={() => setGrams(String(g))} style={styles.quickGramBtn}>
                    <Text style={styles.quickGramText}>{g}g</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.macroPreview}>
                <PreviewCell value={Math.round(selected.calories * factor)} label="kcal" />
                <PreviewCell value={Math.round(selected.protein * factor)} label="Prot" />
                <PreviewCell value={Math.round(selected.carbs * factor)} label="Carb" />
                <PreviewCell value={Math.round(selected.fat * factor)} label="Gord" />
              </View>

              <Button testID="confirm-add-food" label={`Adicionar ao ${MEAL_LABELS[meal]}`} onPress={() => add.mutate()} loading={add.isPending} />
            </>
          ) : null}
        </BottomSheetView>
      </BottomSheet>

      {showCreate ? <CreateFoodSheet onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["custom-foods"] }); }} /> : null}
    </View>
  );
}

function PreviewCell({ value, label }: { value: number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.previewCell}>
      <Text style={styles.previewValue}>{value}</Text>
      <Text style={styles.previewLabel}>{label}</Text>
    </View>
  );
}

function CreateFoodSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const sheetRef = useRef<BottomSheet>(null);
  const [f, setF] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  React.useEffect(() => {
    sheetRef.current?.expand();
  }, []);

  const create = useMutation({
    mutationFn: () =>
      apiFetch("/foods/custom", {
        method: "POST",
        body: {
          name: f.name.trim(),
          calories: Number(f.calories) || 0,
          protein: Number(f.protein) || 0,
          carbs: Number(f.carbs) || 0,
          fat: Number(f.fat) || 0,
        },
      }),
    onSuccess: () => {
      toast.show("Alimento criado");
      onCreated();
    },
    onError: () => toast.show("Erro ao criar alimento", "error"),
  });

  const valid = f.name.trim().length >= 2 && Number(f.calories) > 0;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={[520]}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />}
    >
      <BottomSheetView style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }]}>
        <Text style={styles.sheetTitle}>Novo alimento (por 100g)</Text>
        <CreateField label="Nome" value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Ex: Tapioca" testID="cf-name" />
        <View style={styles.cfRow}>
          <CreateField label="Calorias" value={f.calories} onChange={(v) => setF({ ...f, calories: v })} numeric testID="cf-cal" />
          <CreateField label="Proteína" value={f.protein} onChange={(v) => setF({ ...f, protein: v })} numeric testID="cf-prot" />
        </View>
        <View style={styles.cfRow}>
          <CreateField label="Carboidrato" value={f.carbs} onChange={(v) => setF({ ...f, carbs: v })} numeric testID="cf-carb" />
          <CreateField label="Gordura" value={f.fat} onChange={(v) => setF({ ...f, fat: v })} numeric testID="cf-fat" />
        </View>
        <Button testID="save-custom-food" label="Salvar alimento" onPress={() => create.mutate()} disabled={!valid} loading={create.isPending} />
      </BottomSheetView>
    </BottomSheet>
  );
}

function CreateField({ label, value, onChange, placeholder, numeric, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={styles.cfLabel}>{label}</Text>
      <BottomSheetTextInput
        testID={testID}
        value={value}
        onChangeText={(t) => onChange(numeric ? t.replace(/[^0-9.]/g, "") : t)}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={numeric ? "decimal-pad" : "default"}
        style={styles.cfInput}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  chipScroller: { maxHeight: 56, flexGrow: 0 },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.brandPrimary },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center" },
  tabActive: { backgroundColor: colors.brandPrimary },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: colors.onBrandPrimary },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 15, paddingVertical: spacing.md },
  createRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  createText: { color: colors.brandPrimary, fontSize: 14, fontWeight: "600" },
  listContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  foodRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  foodIcon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  foodName: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  foodSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  empty: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: spacing["2xl"] },
  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  sheetTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", flex: 1 },
  gramsWrap: { gap: spacing.sm },
  gramsLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  gramsInputRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  gramsInput: { flex: 1, color: colors.onSurface, fontSize: 22, fontWeight: "700", paddingVertical: spacing.md },
  gramsUnit: { color: colors.muted, fontSize: 16, fontWeight: "600" },
  quickGrams: { flexDirection: "row", gap: spacing.sm },
  quickGramBtn: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  quickGramText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  macroPreview: { flexDirection: "row", gap: spacing.sm },
  previewCell: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.md },
  previewValue: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  previewLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  cfRow: { flexDirection: "row", gap: spacing.md },
  cfLabel: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  cfInput: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, color: colors.onSurface, fontSize: 15, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
}));
