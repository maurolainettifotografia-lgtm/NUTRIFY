import React from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { MuscleSummary } from "@/src/components/exercise-visuals";
import { StravaPanel } from "@/src/components/strava-panel";
import { apiFetch } from "@/src/api";
import { Button, Card } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { Routine, Session, useRoutines, useSessions } from "@/src/hooks";
import { MUSCLE_LABELS, formatShortDate } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

function groupsOf(r: Routine) {
  const keys = Array.from(new Set(r.exercises.map((e) => e.muscle_group).filter((g) => g && g !== "outro")));
  return keys.map((k) => MUSCLE_LABELS[k] ?? k).join(" · ");
}

export default function Workouts() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const routines = useRoutines();
  const sessions = useSessions(10);

  const delSession = useMutation({
    mutationFn: (id: string) => apiFetch(`/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["routines"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["diary"] });
      toast.show("Treino removido do histórico");
    },
  });

  const confirmDelete = (s: Session) => {
    if (Platform.OS === "web") {
      delSession.mutate(s.id);
      return;
    }
    Alert.alert("Remover do histórico", `Remover "${s.routine_name}" de ${formatShortDate(s.date)}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: () => delSession.mutate(s.id) },
    ]);
  };

  const list = routines.data?.results ?? [];
  const history = sessions.data?.results ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Treinos</Text>
        <Pressable testID="new-routine" onPress={() => router.push("/routine-editor")} style={styles.newBtn}>
          <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.newText}>Novo treino</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <StravaPanel />
        {routines.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} /> : null}

        {!routines.isLoading && list.length === 0 ? (
          <Card testID="routines-empty" style={styles.empty}>
            <Ionicons name="barbell-outline" size={40} color={colors.brandPrimary} />
            <Text style={styles.emptyTitle}>Monte o seu primeiro treino</Text>
            <Text style={styles.emptyText}>
              Escolha os exercícios, defina séries, repetições e carga. Na hora de treinar, o app mostra o que você fez da última vez.
            </Text>
            <Button testID="create-first-routine" label="Criar treino" icon="add" onPress={() => router.push("/routine-editor")} />
          </Card>
        ) : null}

        {list.map((r) => (
          <Card key={r.id} testID={`routine-${r.id}`} style={styles.routine}>
            <View style={styles.routineTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.routineName} numberOfLines={1}>{r.name}</Text>
                <Text style={styles.routineSub} numberOfLines={1}>
                  {r.exercise_count} {r.exercise_count === 1 ? "exercício" : "exercícios"}
                  {groupsOf(r) ? ` · ${groupsOf(r)}` : ""}
                </Text>
                <Text style={styles.routineSub}>{r.last_done ? `Último treino: ${formatShortDate(r.last_done)}` : "Ainda não treinado"}</Text>
              </View>
              <Pressable testID={`edit-routine-${r.id}`} onPress={() => router.push(`/routine-editor?id=${r.id}`)} hitSlop={10} style={styles.editBtn}>
                <Ionicons name="create-outline" size={20} color={colors.onSurfaceSecondary} />
              </Pressable>
            </View>
            <MuscleSummary exercises={r.exercises} />
            <Button
              testID={`start-routine-${r.id}`}
              label="Iniciar treino"
              icon="play"
              onPress={() => router.push(`/workout-session?id=${r.id}`)}
            />
          </Card>
        ))}

        {history.length > 0 ? (
          <>
            <Pressable testID="open-progress" onPress={() => router.push("/exercise-progress")} style={styles.progressRow}>
              <Ionicons name="stats-chart" size={20} color={colors.brandPrimary} />
              <Text style={styles.progressText}>Evolução por exercício e recordes</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <Text style={styles.section}>Últimos treinos</Text>
            {history.map((s) => (
              <View key={s.id} testID={`session-${s.id}`} style={styles.session}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionName} numberOfLines={1}>{s.routine_name}</Text>
                  <Text style={styles.sessionSub}>
                    {formatShortDate(s.date)} · {s.duration_min} min · {s.total_sets} séries · {Math.round(s.volume_kg)} kg
                    {s.calories_burned ? ` · ~${s.calories_burned} kcal` : ""}
                  </Text>
                  {(s.records ?? []).length > 0 ? (
                    <View style={styles.recBadge} testID={`session-records-${s.id}`}>
                      <Ionicons name="trophy" size={13} color={colors.warning} />
                      <Text style={styles.recText} numberOfLines={1}>
                        {(s.records ?? []).length === 1 ? "1 recorde" : `${(s.records ?? []).length} recordes`}: {(s.records ?? []).map((r) => r.name).join(", ")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Pressable testID={`delete-session-${s.id}`} onPress={() => confirmDelete(s)} hitSlop={8} style={styles.delBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "800" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  newText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.md },
  empty: { alignItems: "center", gap: spacing.md, padding: spacing.xl },
  emptyTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  routine: { gap: spacing.md },
  routineTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  routineName: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  routineSub: { color: colors.muted, fontSize: 12, marginTop: 3 },
  editBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md },
  section: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: spacing.md },
  session: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  sessionName: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  sessionSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg },
  progressText: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  recBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  recText: { flex: 1, color: colors.warning, fontSize: 11, fontWeight: "600" },
  delBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
}));
