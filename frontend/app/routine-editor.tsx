import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { ExerciseGuide, MuscleSummary } from "@/src/components/exercise-visuals";
import { apiFetch } from "@/src/api";
import { Button } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { Routine } from "@/src/hooks";
import { MUSCLE_LABELS, fold } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type EditEx = { name: string; muscle_group: string; sets: string; reps: string; weight: string; rest: string };
type LibEx = { name: string; group: string };
type Library = { groups: { key: string; label: string }[]; results: LibEx[] };

const digits = (t: string) => t.replace(/[^0-9]/g, "");
const decimal = (t: string) => t.replace(/[^0-9.,]/g, "");
const toNum = (t: string) => Number(t.replace(",", ".")) || 0;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function RoutineEditor() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<EditEx[]>([]);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ["routine", id],
    queryFn: () => apiFetch<Routine>(`/routines/${id}`),
    enabled: !!id,
  });

  // Carrega o treino salvo UMA vez (um refetch depois nao pode apagar o que a pessoa esta editando).
  const loaded = useRef(false);
  useEffect(() => {
    if (existing.data && !loaded.current) {
      loaded.current = true;
      setName(existing.data.name);
      setNotes(existing.data.notes ?? "");
      setExercises(
        existing.data.exercises.map((e) => ({
          name: e.name,
          muscle_group: e.muscle_group,
          sets: String(e.sets),
          reps: String(e.reps),
          weight: e.weight_kg ? String(e.weight_kg) : "",
          rest: String(e.rest_s),
        })),
      );
    }
  }, [existing.data]);

  const library = useQuery({
    queryKey: ["exercise-library"],
    queryFn: () => apiFetch<Library>("/exercises"),
    staleTime: Infinity,
  });

  const tokens = fold(q).split(" ").filter(Boolean);
  const filtered = (library.data?.results ?? [])
    .filter((e) => (!group || e.group === group) && tokens.every((t) => fold(e.name).includes(t)))
    .slice(0, 40);
  const added = new Set(exercises.map((e) => fold(e.name)));
  const typed = q.trim();
  const showCustom = typed.length > 0 && !(library.data?.results ?? []).some((e) => fold(e.name) === fold(typed)) && !added.has(fold(typed));

  const addExercise = (exName: string, exGroup: string) => {
    setExercises((list) => [...list, { name: exName, muscle_group: exGroup, sets: "3", reps: "10", weight: "", rest: "60" }]);
    setQ("");
  };

  const patch = (idx: number, key: keyof EditEx, value: string) =>
    setExercises((list) => list.map((e, i) => (i === idx ? { ...e, [key]: value } : e)));
  const remove = (idx: number) => setExercises((list) => list.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) =>
    setExercises((list) => {
      const to = idx + dir;
      if (to < 0 || to >= list.length) return list;
      const copy = [...list];
      [copy[idx], copy[to]] = [copy[to], copy[idx]];
      return copy;
    });

  const valid = name.trim().length >= 1 && exercises.length > 0;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        notes: notes.trim() || null,
        exercises: exercises.map((e) => ({
          name: e.name,
          muscle_group: e.muscle_group,
          sets: clamp(Math.round(toNum(e.sets)) || 3, 1, 20),
          reps: clamp(Math.round(toNum(e.reps)) || 10, 1, 200),
          weight_kg: clamp(toNum(e.weight), 0, 1000),
          rest_s: clamp(Math.round(toNum(e.rest)), 0, 900),
        })),
      };
      return apiFetch(id ? `/routines/${id}` : "/routines", { method: id ? "PUT" : "POST", body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routines"] });
      qc.invalidateQueries({ queryKey: ["routine", id] });
      qc.invalidateQueries({ queryKey: ["routine-last", id] });
      toast.show(id ? "Treino atualizado" : "Treino salvo");
      router.back();
    },
    onError: (e: any) => toast.show(e?.message ?? "Erro ao salvar o treino", "error"),
  });

  const del = useMutation({
    mutationFn: () => apiFetch(`/routines/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routines"] });
      toast.show("Treino excluído");
      router.back();
    },
  });

  const confirmDelete = () => {
    if (Platform.OS === "web") {
      del.mutate();
      return;
    }
    Alert.alert("Excluir treino", "O histórico dos treinos já feitos será mantido. Deseja excluir este treino?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => del.mutate() },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable testID="close-routine" onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{id ? "Editar treino" : "Novo treino"}</Text>
        {id ? (
          <Pressable testID="delete-routine" onPress={confirmDelete} hitSlop={10} style={styles.iconBtn}>
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
          <MuscleSummary exercises={exercises.map(e => ({ ...e, sets: Number(e.sets) }))} />
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Nome do treino</Text>
            <TextInput testID="routine-name" value={name} onChangeText={setName} placeholder="Ex: Treino A - Peito e tríceps" placeholderTextColor={colors.muted} maxLength={80} style={styles.input} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Observações (opcional)</Text>
            <TextInput testID="routine-notes" value={notes} onChangeText={setNotes} placeholder="Ex: segunda e quinta" placeholderTextColor={colors.muted} maxLength={500} style={styles.input} />
          </View>

          <Text style={styles.section}>Exercícios ({exercises.length})</Text>
          {exercises.length === 0 ? <Text style={styles.hint}>Toque em &quot;Adicionar exercício&quot; para começar.</Text> : null}

          {exercises.map((e, i) => (
            <View key={`${e.name}-${i}`} style={styles.exCard} testID={`routine-exercise-${i}`}>
              <View style={styles.exTop}>
                <View style={styles.badge}><Text style={styles.badgeText}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exName} numberOfLines={2}>{e.name}</Text>
                  <Text style={styles.exSub}>{MUSCLE_LABELS[e.muscle_group] ?? "Outro"}</Text>
                </View>
                <Pressable testID={`move-up-${i}`} onPress={() => move(i, -1)} hitSlop={6} style={styles.smallBtn} disabled={i === 0}>
                  <Ionicons name="chevron-up" size={20} color={i === 0 ? colors.border : colors.onSurfaceSecondary} />
                </Pressable>
                <Pressable testID={`move-down-${i}`} onPress={() => move(i, 1)} hitSlop={6} style={styles.smallBtn} disabled={i === exercises.length - 1}>
                  <Ionicons name="chevron-down" size={20} color={i === exercises.length - 1 ? colors.border : colors.onSurfaceSecondary} />
                </Pressable>
                <Pressable testID={`remove-exercise-${i}`} onPress={() => remove(i)} hitSlop={6} style={styles.smallBtn}>
                  <Ionicons name="close-circle" size={22} color={colors.muted} />
                </Pressable>
              </View>
              <View style={styles.fields}>
                <Field label="Séries" testID={`ex-sets-${i}`} value={e.sets} onChange={(v) => patch(i, "sets", digits(v))} keyboard="number-pad" />
                <Field label="Reps" testID={`ex-reps-${i}`} value={e.reps} onChange={(v) => patch(i, "reps", digits(v))} keyboard="number-pad" />
                <Field label="Carga (kg)" testID={`ex-weight-${i}`} value={e.weight} onChange={(v) => patch(i, "weight", decimal(v))} keyboard="decimal-pad" placeholder="0" />
                <Field label="Descanso (s)" testID={`ex-rest-${i}`} value={e.rest} onChange={(v) => patch(i, "rest", digits(v))} keyboard="number-pad" />
              </View>
            </View>
          ))}

          <Button
            testID="toggle-picker"
            variant="secondary"
            icon={picking ? "chevron-up" : "add"}
            label={picking ? "Fechar lista de exercícios" : "Adicionar exercício"}
            onPress={() => setPicking((v) => !v)}
          />

          {picking ? (
            <View style={styles.picker} testID="exercise-picker">
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={colors.muted} />
                <TextInput testID="exercise-search" value={q} onChangeText={setQ} placeholder="Buscar exercício (ex: supino, agachamento)" placeholderTextColor={colors.muted} style={styles.searchInput} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
                <Chip label="Todos" active={group === null} onPress={() => setGroup(null)} testID="group-all" />
                {(library.data?.groups ?? []).map((g) => (
                  <Chip key={g.key} label={g.label} active={group === g.key} onPress={() => setGroup(g.key)} testID={`group-${g.key}`} />
                ))}
              </ScrollView>
              {library.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
              {showCustom ? (
                <Pressable testID="add-custom-exercise" onPress={() => addExercise(typed.slice(0, 80), group ?? "outro")} style={styles.resultRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exName} numberOfLines={1}>Criar &quot;{typed}&quot;</Text>
                    <Text style={styles.exSub}>Exercício seu{group ? ` · ${MUSCLE_LABELS[group]}` : ""}</Text>
                  </View>
                  <Ionicons name="add-circle" size={22} color={colors.brandPrimary} />
                </Pressable>
              ) : null}
              {filtered.map((e) => {
                const isAdded = added.has(fold(e.name));
                return (
                  <View key={e.name} style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                  <Pressable testID={`exercise-result-${e.name}`} onPress={() => addExercise(e.name, e.group)} style={styles.resultRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.exName} numberOfLines={1}>{e.name}</Text>
                      <Text style={styles.exSub}>{MUSCLE_LABELS[e.group] ?? ""}</Text>
                    </View>
                    <Ionicons name={isAdded ? "checkmark-circle" : "add-circle"} size={22} color={isAdded ? colors.success : colors.brandPrimary} />
                  </Pressable>
                  <ExerciseGuide name={e.name} compact />
                  </View>
                );
              })}
              {!library.isLoading && filtered.length === 0 && !showCustom ? <Text style={styles.hint}>Nenhum exercício encontrado.</Text> : null}
            </View>
          ) : null}
        </KeyboardAwareScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button testID="save-routine" label={id ? "Salvar alterações" : "Salvar treino"} onPress={() => save.mutate()} disabled={!valid} loading={save.isPending} />
      </View>
    </View>
  );
}

function Field({ label, value, onChange, keyboard, testID, placeholder }: { label: string; value: string; onChange: (v: string) => void; keyboard: "number-pad" | "decimal-pad"; testID: string; placeholder?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput testID={testID} value={value} onChangeText={onChange} keyboardType={keyboard} placeholder={placeholder} placeholderTextColor={colors.muted} maxLength={6} style={styles.fieldInput} />
    </View>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  const styles = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.md },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  input: { minHeight: 48, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, color: colors.onSurface, fontSize: 15 },
  section: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: spacing.sm },
  hint: { color: colors.muted, fontSize: 13 },
  exCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  exTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "800" },
  exName: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  exSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  smallBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  fields: { flexDirection: "row", gap: spacing.sm },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  fieldInput: { minHeight: 42, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, color: colors.onSurface, fontSize: 15, fontWeight: "700", textAlign: "center", paddingHorizontal: 4 },
  picker: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 15, paddingVertical: spacing.md },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  resultRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingVertical: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
}));
