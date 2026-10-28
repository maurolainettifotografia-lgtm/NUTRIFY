import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Switch, Text, TextInput, Vibration, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { ExerciseGuide, MuscleSummary } from "@/src/components/exercise-visuals";
import { apiFetch, ApiError } from "@/src/api";
import { Button } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { LastPerformance, Routine, Session } from "@/src/hooks";
import { MUSCLE_LABELS, describeRecord, fold, formatClock, formatShortDate } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type SetState = { reps: string; weight: string; done: boolean };

const digits = (t: string) => t.replace(/[^0-9]/g, "");
const decimal = (t: string) => t.replace(/[^0-9.,]/g, "");
const toNum = (t: string) => Number(t.replace(",", ".")) || 0;
const kg = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

export default function WorkoutSession() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const routine = useQuery({ queryKey: ["routine", id], queryFn: () => apiFetch<Routine>(`/routines/${id}`), enabled: !!id });
  const last = useQuery({
    queryKey: ["routine-last", id],
    queryFn: () => apiFetch<{ last: LastPerformance }>(`/routines/${id}/last`),
    enabled: !!id,
  });

  const [requestId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`);
  const pendingPayload = useRef<Record<string, unknown> | null>(null);
  const saving = useRef(false);
  const [sets, setSets] = useState<SetState[][]>([]);
  const initialised = useRef(false);
  const [ready, setReady] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState<number | null>(null);
  const [logCalories, setLogCalories] = useState(true);

  // Preenche as series: com a carga da ULTIMA vez, se houver; senao com a meta do treino.
  useEffect(() => {
    if (initialised.current || !routine.data || (last.isLoading && !last.isError)) return;
    initialised.current = true;
    // A série editável é inicializada uma vez após as duas consultas.
    setReady(true);
    const lastMap = last.data?.last ?? {};
    setSets(
      routine.data.exercises.map((ex) => {
        const prev = lastMap[fold(ex.name)]?.sets ?? [];
        return Array.from({ length: ex.sets }, (_, i) => {
          const p = prev[i] ?? prev[prev.length - 1];
          return {
            reps: String(p ? p.reps : ex.reps),
            weight: (p ? p.weight_kg : ex.weight_kg) ? String(p ? p.weight_kg : ex.weight_kg) : "",
            done: false,
          };
        });
      }),
    );
  }, [routine.data, last.data, last.isLoading, last.isError]);

  // Relogio do treino e contagem do descanso (1x por segundo)
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      setRest((r) => (r !== null && r > 0 ? r - 1 : r));
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    if (rest === 0) {
      Vibration.vibrate(400);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Encerra o descanso após o relógio chegar a zero.
      setRest(null);
    }
  }, [rest]);

  const patchSet = (ei: number, si: number, patch: Partial<SetState>) =>
    setSets((all) => all.map((list, i) => (i === ei ? list.map((s, j) => (j === si ? { ...s, ...patch } : s)) : list)));

  const toggleDone = (ei: number, si: number, restSeconds: number) => {
    const wasDone = sets[ei]?.[si]?.done;
    patchSet(ei, si, { done: !wasDone });
    if (!wasDone && restSeconds > 0) setRest(restSeconds);
    if (wasDone) setRest(null);
  };

  const addSet = (ei: number) =>
    setSets((all) => all.map((list, i) => (i === ei ? [...list, { ...(list[list.length - 1] ?? { reps: "10", weight: "" }), done: false }] : list)));

  const doneCount = sets.reduce((n, list) => n + list.filter((s) => s.done).length, 0);
  const totalCount = sets.reduce((n, list) => n + list.length, 0);

  const finish = useMutation({
    mutationFn: () => {
      pendingPayload.current ??= {
          request_id: requestId,
          routine_id: id,
          routine_name: routine.data?.name ?? "Treino",
          duration_min: Math.min(600, Math.max(1, Math.round((Date.now() - startedAt) / 60000))),
          log_calories: logCalories,
          exercises: (routine.data?.exercises ?? []).map((ex, ei) => ({
            name: ex.name,
            muscle_group: ex.muscle_group,
            sets: (sets[ei] ?? []).map((s) => ({
              reps: Math.min(500, Math.round(toNum(s.reps))),
              weight_kg: Math.min(1000, toNum(s.weight)),
              done: s.done,
            })),
          })),
      };
      return apiFetch<Session>("/sessions", { method: "POST", body: pendingPayload.current });
    },
    onSettled: () => { saving.current = false; },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["routines"] });
      qc.invalidateQueries({ queryKey: ["routine-last", id] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["diary"] });
      const recs = s.records ?? [];
      if (recs.length > 0) {
        toast.show(`🏆 Novo recorde! ${describeRecord(recs[0])}${recs.length > 1 ? ` (+${recs.length - 1})` : ""}`);
      } else {
        const kcal = s.calories_burned ? ` · ~${s.calories_burned} kcal` : "";
        toast.show(`Treino salvo! ${s.total_sets} séries · ${Math.round(s.volume_kg)} kg${kcal}`);
      }
      router.back();
    },
    onError: (e: Error) => {
      // Validation failures happen before insertion, so the user may correct the fields.
      if (e instanceof ApiError && (e.status === 400 || e.status === 422)) pendingPayload.current = null;
      toast.show(e.message ?? "Erro ao salvar o treino", "error");
    },
  });

  const tryFinish = () => {
    if (doneCount === 0) {
      toast.show("Marque pelo menos uma série como feita", "error");
      return;
    }
    if (saving.current) return;
    saving.current = true;
    finish.mutate();
  };

  const leave = () => {
    if (saving.current) return;
    if (doneCount === 0) { router.back(); return; }
    if (Platform.OS === "web") {
      if (globalThis.confirm("Sair sem salvar? As séries deste treino serão perdidas.")) router.back();
      return;
    }
    Alert.alert("Sair sem salvar?", "As séries que você marcou neste treino serão perdidas.", [
      { text: "Continuar treinando", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const loading = routine.isLoading || (!ready && !routine.isError);
  const lastMap = last.data?.last ?? {};

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable testID="leave-session" onPress={leave} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{routine.data?.name ?? "Treino"}</Text>
          <Text style={styles.headerSub} testID="session-clock">{formatClock(elapsed)} · {doneCount}/{totalCount} séries</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {finish.isError && <Text style={{ color: colors.error, padding: 12 }}>Envio sem confirmação. Tente finalizar novamente: os mesmos dados serão reenviados. Não feche esta tela antes de confirmar.</Text>}
      {rest !== null ? (
        <View style={styles.restBar} testID="rest-bar">
          <Ionicons name="timer-outline" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.restText}>Descanso {formatClock(rest)}</Text>
          <Pressable testID="skip-rest" onPress={() => setRest(null)} hitSlop={8}>
            <Text style={styles.restSkip}>Pular</Text>
          </Pressable>
        </View>
      ) : null}

      {routine.isError ? (
        <Text style={styles.hint}>Não foi possível carregar este treino.</Text>
      ) : loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing["2xl"] }} />
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
          bottomOffset={20}
          keyboardShouldPersistTaps="handled"
        >
          <MuscleSummary exercises={routine.data?.exercises ?? []} />
          {(routine.data?.exercises ?? []).map((ex, ei) => {
            const prev = lastMap[fold(ex.name)];
            return (
              <View key={`${ex.name}-${ei}`} style={styles.exCard} testID={`session-exercise-${ei}`}>
                <Text style={styles.exName}>{ex.name}</Text>
                <ExerciseGuide name={ex.name} compact />
                <Text style={styles.exSub}>
                  {MUSCLE_LABELS[ex.muscle_group] ?? "Outro"} · descanso {ex.rest_s}s
                </Text>
                {prev ? (
                  <Text style={styles.lastText} testID={`last-${ei}`}>
                    Última vez ({formatShortDate(prev.date)}): {prev.sets.map((s) => `${s.reps}×${kg(s.weight_kg)}kg`).join(" · ")}
                  </Text>
                ) : (
                  <Text style={styles.lastText}>Primeira vez neste exercício</Text>
                )}

                <View style={styles.setHeader}>
                  <Text style={[styles.setHeadText, { width: 28 }]}>Série</Text>
                  <Text style={[styles.setHeadText, { flex: 1, textAlign: "center" }]}>Reps</Text>
                  <Text style={[styles.setHeadText, { flex: 1, textAlign: "center" }]}>Carga (kg)</Text>
                  <View style={{ width: 44 }} />
                </View>
                {(sets[ei] ?? []).map((s, si) => (
                  <View key={si} style={[styles.setRow, s.done && styles.setRowDone]}>
                    <Text style={[styles.setNum, { width: 28 }]}>{si + 1}</Text>
                    <TextInput testID={`set-reps-${ei}-${si}`} value={s.reps} onChangeText={(v) => patchSet(ei, si, { reps: digits(v) })} keyboardType="number-pad" maxLength={3} style={styles.setInput} />
                    <TextInput testID={`set-weight-${ei}-${si}`} value={s.weight} onChangeText={(v) => patchSet(ei, si, { weight: decimal(v) })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} maxLength={6} style={styles.setInput} />
                    <Pressable testID={`set-done-${ei}-${si}`} onPress={() => toggleDone(ei, si, ex.rest_s)} hitSlop={6} style={[styles.checkBtn, s.done && styles.checkBtnDone]}>
                      <Ionicons name="checkmark" size={20} color={s.done ? colors.onBrandPrimary : colors.muted} />
                    </Pressable>
                  </View>
                ))}
                <Pressable testID={`add-set-${ei}`} onPress={() => addSet(ei)} style={styles.addSet}>
                  <Ionicons name="add" size={16} color={colors.brandPrimary} />
                  <Text style={styles.addSetText}>Adicionar série</Text>
                </Pressable>
              </View>
            );
          })}
        </KeyboardAwareScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.kcalRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.kcalTitle}>Somar gasto calórico ao diário</Text>
            <Text style={styles.kcalSub}>Estimativa pelo tempo de treino e pelo seu peso</Text>
          </View>
          <Switch
            testID="log-calories-switch"
            value={logCalories}
            onValueChange={setLogCalories}
            trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
            thumbColor={colors.onBrandPrimary}
          />
        </View>
        <Button testID="finish-session" label={`Finalizar treino (${doneCount}/${totalCount})`} icon="flag" onPress={tryFinish} loading={finish.isPending} disabled={loading || finish.isPending} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  headerSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  restBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, marginHorizontal: spacing.lg, marginBottom: spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  restText: { flex: 1, color: colors.onBrandPrimary, fontSize: 14, fontWeight: "800" },
  restSkip: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
  hint: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: spacing.xl },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.md },
  exCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  exName: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  exSub: { color: colors.muted, fontSize: 12 },
  lastText: { color: colors.onBrandTertiary, backgroundColor: colors.brandTertiary, fontSize: 12, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, alignSelf: "flex-start", marginTop: 2 },
  setHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  setHeadText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  setRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md },
  setRowDone: { opacity: 0.75 },
  setNum: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700", textAlign: "center" },
  setInput: { flex: 1, minHeight: 44, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, color: colors.onSurface, fontSize: 16, fontWeight: "700", textAlign: "center" },
  checkBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  checkBtnDone: { backgroundColor: colors.brandPrimary },
  addSet: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: spacing.sm },
  addSetText: { color: colors.brandPrimary, fontSize: 13, fontWeight: "700" },
  kcalRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  kcalTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  kcalSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
}));
