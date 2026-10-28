import React, { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Share, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, BottomSheetTextInput, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";

import { profileAge } from "@/src/profile-age";
import { apiFetch } from "@/src/api";
import { Button, Card } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { useAuth } from "@/src/auth-context";
import { useConsent, useProfile, useWorkouts } from "@/src/hooks";
import { ACTIVITY_LEVELS, COPYRIGHT, GOALS, GOAL_LABELS, SIGNATURE, WORKOUT_TYPES, todayStr } from "@/src/constants";
import { setColorScheme, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export default function Profile() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const { data: profile } = useProfile();
  const { data: consent } = useConsent();
  const [exporting, setExporting] = useState(false);

  const setAiConsent = useMutation({
    mutationFn: (on: boolean) => apiFetch("/account/consent", { method: "PUT", body: { ai_processing: on } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["consent"] }),
    onError: () => toast.show("Não foi possível salvar. Tente novamente.", "error"),
  });

  // Direito de acesso e portabilidade (LGPD): baixa/compartilha todos os dados em JSON.
  const exportData = async () => {
    setExporting(true);
    try {
      const data = await apiFetch<unknown>("/account/export");
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === "web") {
        const g = globalThis as any;
        const url = g.URL.createObjectURL(new g.Blob([json], { type: "application/json" }));
        const a = g.document.createElement("a");
        a.href = url;
        a.download = "nutrify-meus-dados.json";
        a.click();
        g.URL.revokeObjectURL(url);
      } else {
        await Share.share({ title: "Meus dados do Nutrify", message: json });
      }
    } catch {
      toast.show("Não foi possível exportar seus dados", "error");
    } finally {
      setExporting(false);
    }
  };
  const editRef = useRef<BottomSheet>(null);
  const workoutRef = useRef<BottomSheet>(null);
  const date = todayStr();
  const { data: workouts } = useWorkouts(date);

  const update = useMutation({
    mutationFn: (body: any) => apiFetch("/profile", { method: "PUT", body }),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["diary"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.show("Perfil atualizado");
      if ("age_years" in body || "height_cm" in body || "goal_weight_kg" in body) {
        editRef.current?.close();
        router.push("/personal-plan");
      }
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const delAccount = useMutation({
    mutationFn: () => apiFetch("/account", { method: "DELETE" }),
    onSuccess: async () => {
      toast.show("Conta e dados excluídos");
      qc.clear();
      await signOut();
    },
    onError: () => toast.show("Erro ao excluir conta. Tente novamente.", "error"),
  });

  const g = profile?.goals;
  const isDark = scheme === "dark";

  const toggleTheme = async (toLight: boolean) => {
    const next = toLight ? "light" : "dark";
    setColorScheme(next);
    await storage.setItem("color_scheme", next);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Perfil</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Card style={styles.userCard}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{(profile?.name ?? user?.name ?? "U").charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{profile?.name ?? user?.name}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.cardTitle}>Meus dados</Text>
          <Text style={styles.aboutText}>{profile && profileAge(profile) !== undefined ? `${profileAge(profile)} anos` : "Idade não preenchida"} · {profile?.height_cm ?? "—"} cm</Text>
          <Text style={styles.aboutText}>Peso atual: {profile?.weight_kg ?? "—"} kg · Desejado: {profile?.goal_weight_kg ?? "—"} kg</Text>
          <Button label="Revisar orientação personalizada" variant="secondary" onPress={() => router.push("/personal-plan")} />
        </Card>
        {/* Goals */}
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Minhas metas</Text>
            <Pressable testID="edit-profile" onPress={() => editRef.current?.expand()} hitSlop={8}>
              <Ionicons name="create-outline" size={20} color={colors.brandPrimary} />
            </Pressable>
          </View>
          <View style={styles.goalGrid}>
            <GoalCell value={g?.calories} label="kcal" />
            <GoalCell value={g?.protein} label="Prot (g)" />
            <GoalCell value={g?.carbs} label="Carb (g)" />
            <GoalCell value={g?.fat} label="Gord (g)" />
          </View>
          <Text style={styles.goalMeta}>
            Objetivo: {GOAL_LABELS[profile?.goal ?? "manutencao"]} · TMB {g?.bmr} · TDEE {g?.tdee}
          </Text>
          {g?.floor_applied ? (
            <Text testID="goal-floor-notice" style={styles.goalNotice}>
              Sua meta foi ajustada para o mínimo de {g.calorie_floor} kcal por dia. Comer menos do que isso só com
              acompanhamento de nutricionista ou médico.
            </Text>
          ) : null}
          {g?.below_floor ? (
            <Text testID="goal-below-floor-warning" style={styles.goalWarn}>
              Atenção: sua meta personalizada está abaixo do mínimo recomendado ({g.calorie_floor} kcal por dia).
              Procure um nutricionista ou médico antes de seguir esse plano.
            </Text>
          ) : null}
          <Text style={styles.goalDisclaimer}>
            As metas são estimativas e não substituem a orientação de um nutricionista ou médico.
          </Text>
        </Card>

        {/* Athlete mode */}
        <Card>
          <View style={styles.rowBetween}>
            <View style={styles.athleteTitleRow}>
              <Ionicons name="barbell" size={20} color={colors.brandPrimary} />
              <Text style={styles.cardTitle}>Modo Atleta</Text>
            </View>
            <Switch
              testID="athlete-toggle"
              value={!!profile?.athlete_mode}
              onValueChange={(v) => update.mutate({ athlete_mode: v })}
              trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
              thumbColor={colors.onBrandPrimary}
            />
          </View>
          <Text style={styles.athleteDesc}>
            Ajusta sua meta pelo volume de treino, somando o gasto do exercício ao dia — sem contar calorias em dobro.
          </Text>

          {profile?.athlete_mode ? (
            <View style={styles.workoutSection}>
              <View style={styles.rowBetween}>
                <Text style={styles.workoutTitle}>Treino de hoje</Text>
                <Pressable testID="add-workout" onPress={() => workoutRef.current?.expand()} style={styles.addWorkoutBtn}>
                  <Ionicons name="add" size={16} color={colors.onBrandPrimary} />
                  <Text style={styles.addWorkoutText}>Treino</Text>
                </Pressable>
              </View>
              {(workouts?.results ?? []).length === 0 ? (
                <Text style={styles.restDay}>Dia de descanso. Nenhum treino registrado.</Text>
              ) : (
                (workouts?.results ?? []).map((w) => (
                  <View key={w.id} style={styles.workoutRow}>
                    <Text style={styles.workoutName}>
                      {w.title || (WORKOUT_TYPES.find((t) => t.key === w.type)?.label ?? w.type)} · {w.duration_min} min
                    </Text>
                    <View style={styles.workoutRight}>
                      <Text style={styles.workoutKcal}>{w.calories} kcal</Text>
                      <Pressable
                        testID={`delete-workout-${w.id}`}
                        onPress={async () => {
                          await apiFetch(`/workouts/${w.id}`, { method: "DELETE" });
                          qc.invalidateQueries({ queryKey: ["workouts", date] });
                          qc.invalidateQueries({ queryKey: ["diary", date] });
                        }}
                        hitSlop={8}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </Card>

        {/* Settings */}
        <Card>
          <Text style={styles.cardTitle}>Configurações</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="moon" size={18} color={colors.onSurfaceSecondary} />
              <Text style={styles.settingLabel}>Tema escuro</Text>
            </View>
            <Switch
              testID="theme-toggle"
              value={isDark}
              onValueChange={(v) => toggleTheme(!v)}
              trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
              thumbColor={colors.onBrandPrimary}
            />
          </View>
        </Card>

        {/* Privacidade (LGPD) */}
        <Card>
          <Text style={styles.cardTitle}>Privacidade e dados</Text>
          <Pressable testID="open-privacy" onPress={() => router.push("/privacy")} style={styles.settingRow}>
            <Text style={styles.settingLabel}>Política de Privacidade</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <View style={styles.settingRow}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={styles.settingLabel}>Usar inteligência artificial</Text>
              <Text style={styles.privSub}>Foto de comida, sugestões e chat com a Nutri</Text>
            </View>
            <Switch
              testID="ai-consent-switch"
              value={!!consent?.ai_processing}
              onValueChange={(v) => setAiConsent.mutate(v)}
              disabled={!consent || setAiConsent.isPending}
              trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
              thumbColor={colors.onBrandPrimary}
            />
          </View>
          <Pressable testID="export-data" onPress={exportData} disabled={exporting} style={styles.settingRow}>
            <Text style={styles.settingLabel}>{exporting ? "Preparando..." : "Exportar meus dados"}</Text>
            <Ionicons name="download-outline" size={18} color={colors.muted} />
          </Pressable>
        </Card>

        {/* About */}
        <Card>
          <Text style={styles.cardTitle}>Sobre o aplicativo</Text>
          <Text style={styles.aboutText}>
            Nutrify é um acompanhamento nutricional inteligente: calorias, macros, hidratação, evolução e modo atleta.
          </Text>
          <Text style={styles.brandLine}>NUTRIFY</Text>
          <Text style={styles.signature}>{SIGNATURE}</Text>
        </Card>

        <Pressable testID="logout-btn" onPress={signOut} style={styles.logoutRow}>
          <Ionicons name="log-out-outline" size={20} color={colors.onSurfaceSecondary} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </Pressable>

        {confirmDelete ? (
          <Card>
            <Text style={styles.deleteWarnTitle}>Excluir conta definitivamente?</Text>
            <Text style={styles.deleteWarnText}>
              Seu perfil, diário, pesos, água, treinos, receitas, favoritos, alimentos próprios e conversas com a Nutri serão apagados para sempre. Esta ação não pode ser desfeita.
            </Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Button testID="confirm-delete-account" label="Sim, excluir tudo" onPress={() => delAccount.mutate()} loading={delAccount.isPending} />
              <Button testID="cancel-delete-account" label="Cancelar" variant="secondary" onPress={() => setConfirmDelete(false)} />
            </View>
          </Card>
        ) : (
          <Pressable testID="delete-account-btn" onPress={() => setConfirmDelete(true)} style={styles.deleteRow}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
            <Text style={styles.deleteText}>Excluir minha conta e dados</Text>
          </Pressable>
        )}

        <Text style={styles.copyright}>{COPYRIGHT}</Text>
      </ScrollView>

      <EditProfileSheet sheetRef={editRef} profile={profile} saving={update.isPending} onSave={(body) => update.mutate(body)} />
      <WorkoutSheet sheetRef={workoutRef} date={date} onSaved={() => { qc.invalidateQueries({ queryKey: ["workouts", date] }); qc.invalidateQueries({ queryKey: ["diary", date] }); workoutRef.current?.close(); toast.show("Treino registrado"); }} />
    </View>
  );
}

function GoalCell({ value, label }: { value?: number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.goalCell}>
      <Text style={styles.goalValue}>{value ?? "--"}</Text>
      <Text style={styles.goalLabel}>{label}</Text>
    </View>
  );
}

function EditProfileSheet({ sheetRef, profile, onSave, saving }: { sheetRef: React.RefObject<BottomSheet | null>; profile: any; onSave: (b: any) => void; saving: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [step, setStep] = useState(0);
  const [goalWeight, setGoalWeight] = useState("");
  const [water, setWater] = useState("");
  const [goal, setGoal] = useState("");
  const [activity, setActivity] = useState("");
  const validData = Number.isInteger(Number(age)) && Number(age) >= 18 && Number(age) <= 110 && Number(height.replace(",", ".")) >= 80 && Number(height.replace(",", ".")) <= 250 && Number(weight.replace(",", ".")) >= 20 && Number(weight.replace(",", ".")) <= 500 && Number(goalWeight.replace(",", ".")) >= 20 && Number(goalWeight.replace(",", ".")) <= 500;

  React.useEffect(() => {
    if (profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Sincroniza o formulário com o perfil carregado.
      setWeight(String(profile.weight_kg ?? ""));
      setHeight(String(profile.height_cm ?? ""));
      setAge(profileAge(profile) !== undefined ? String(profileAge(profile)) : "");
      setGoalWeight(String(profile.goal_weight_kg ?? ""));
      setWater(String(profile.goals?.water_goal_ml ?? ""));
      setGoal(profile.goal ?? "manutencao");
      setActivity(profile.activity_level ?? "moderate");
    }
  }, [profile]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={["85%"]}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.sheetTitle}>Editar perfil</Text>
        {step === 0 ? <>
        <Field label="Idade (anos)" value={age} onChange={setAge} testID="edit-age" />
        <Field label="Altura (cm)" value={height} onChange={setHeight} testID="edit-height" />
        <Field label="Peso atual (kg)" value={weight} onChange={setWeight} testID="edit-weight" />
        <Field label="Peso desejado (kg)" value={goalWeight} onChange={setGoalWeight} testID="edit-goal-weight" />
        <Field label="Meta de água (ml)" value={water} onChange={setWater} testID="edit-water" />

        <Text style={styles.privSub}>Preencha os dados para revisar seu objetivo e gerar uma orientação geral.</Text>
        <Button label="Continuar: escolher objetivo" onPress={() => setStep(1)} disabled={!validData} />
        </> : <>
        <Text style={styles.fieldLabel}>Qual é seu objetivo?</Text>
        <View style={styles.optionsWrap}>
          {GOALS.map((o) => (
            <Pressable key={o.key} testID={`edit-goal-${o.key}`} onPress={() => setGoal(o.key)} style={[styles.optionChip, goal === o.key && styles.optionChipActive]}>
              <Text style={[styles.optionText, goal === o.key && styles.optionTextActive]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Nível de atividade</Text>
        <View style={styles.optionsWrap}>
          {ACTIVITY_LEVELS.map((o) => (
            <Pressable key={o.key} testID={`edit-activity-${o.key}`} onPress={() => setActivity(o.key)} style={[styles.optionChip, activity === o.key && styles.optionChipActive]}>
              <Text style={[styles.optionText, activity === o.key && styles.optionTextActive]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>

        <Button
          testID="save-profile"
          label="Salvar e revisar sugestão" disabled={!validData || !goal} loading={saving}
          onPress={() =>
            onSave({
              age_years: Number(age),
              height_cm: Number(height.replace(",", ".")),
              weight_kg: Number(weight.replace(",", ".")),
              goal_weight_kg: Number(goalWeight.replace(",", ".")),
              water_goal_ml: Number(water.replace(",", ".")) || undefined,
              goal,
              activity_level: activity,
            })
          }
          style={{ marginTop: spacing.lg }}
        />
        <Button label="Voltar aos dados" variant="ghost" onPress={() => setStep(0)} />
        </>}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function WorkoutSheet({ sheetRef, date, onSaved }: { sheetRef: React.RefObject<BottomSheet | null>; date: string; onSaved: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState("musculacao");
  const [duration, setDuration] = useState("45");
  const kcalPerMin = WORKOUT_TYPES.find((t) => t.key === type)?.kcalPerMin ?? 6;
  const calories = Math.round((Number(duration) || 0) * kcalPerMin);

  const save = async () => {
    await apiFetch("/workouts", { method: "POST", body: { date, type, duration_min: Number(duration) || 0, calories } });
    onSaved();
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={[440]}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />}
    >
      <BottomSheetView style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.sheetTitle}>Registrar treino</Text>
        <View style={styles.optionsWrap}>
          {WORKOUT_TYPES.map((t) => (
            <Pressable key={t.key} testID={`workout-type-${t.key}`} onPress={() => setType(t.key)} style={[styles.optionChip, type === t.key && styles.optionChipActive]}>
              <Ionicons name={t.icon as any} size={16} color={type === t.key ? colors.brandPrimary : colors.muted} />
              <Text style={[styles.optionText, type === t.key && styles.optionTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Duração (min)" value={duration} onChange={setDuration} testID="workout-duration" />
        <View style={styles.estimateRow}>
          <Text style={styles.estimateLabel}>Gasto estimado</Text>
          <Text style={styles.estimateValue}>{calories} kcal</Text>
        </View>
        <Button testID="save-workout" label="Registrar treino" onPress={save} disabled={!(Number(duration) > 0)} />
      </BottomSheetView>
    </BottomSheet>
  );
}

function Field({ label, value, onChange, testID }: { label: string; value: string; onChange: (v: string) => void; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6, marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <BottomSheetTextInput
        testID={testID}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ""))}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.muted}
        style={styles.fieldInput}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "800" },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  userCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 999 },
  avatarFallback: { backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: colors.onBrandPrimary, fontSize: 24, fontWeight: "800" },
  userName: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  userEmail: { color: colors.muted, fontSize: 13, marginTop: 2 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  goalGrid: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  goalCell: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.md },
  goalValue: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  goalLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
  goalMeta: { color: colors.muted, fontSize: 12, marginTop: spacing.md },
  goalNotice: { color: colors.onSurfaceTertiary, fontSize: 12, lineHeight: 18, marginTop: spacing.sm, backgroundColor: colors.brandTertiary, padding: spacing.sm, borderRadius: radius.md },
  goalWarn: { color: colors.warning, fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: spacing.sm },
  goalDisclaimer: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
  athleteTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  athleteDesc: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  workoutSection: { marginTop: spacing.lg, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md },
  workoutTitle: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700" },
  addWorkoutBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.md },
  addWorkoutText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "700" },
  restDay: { color: colors.muted, fontSize: 13, paddingVertical: spacing.sm },
  workoutRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm },
  workoutName: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  workoutRight: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  workoutKcal: { color: colors.brandPrimary, fontSize: 14, fontWeight: "700" },
  privSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  settingLabel: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  aboutText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  brandLine: { color: colors.onSurface, fontSize: 18, fontWeight: "800", letterSpacing: 2, marginTop: spacing.md },
  signature: { color: colors.muted, fontSize: 13, fontStyle: "italic", marginTop: 2 },
  logoutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg },
  logoutText: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "600" },
  deleteRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", paddingVertical: spacing.md },
  deleteText: { color: colors.error, fontSize: 13, fontWeight: "600" },
  deleteWarnTitle: { color: colors.error, fontSize: 16, fontWeight: "800" },
  deleteWarnText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  copyright: { color: colors.muted, fontSize: 10, textAlign: "center", opacity: 0.7, marginTop: spacing.sm },
  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  sheetTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginBottom: spacing.lg },
  fieldLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  fieldInput: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, color: colors.onSurface, fontSize: 16, fontWeight: "600", paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  optionsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
  optionChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  optionChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  optionText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  optionTextActive: { color: colors.brandPrimary },
  estimateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg },
  estimateLabel: { color: colors.muted, fontSize: 14 },
  estimateValue: { color: colors.brandPrimary, fontSize: 18, fontWeight: "800" },
}));
