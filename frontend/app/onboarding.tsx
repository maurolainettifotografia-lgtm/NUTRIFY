import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeIn } from "react-native-reanimated";

import { Button } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { useAuth } from "@/src/auth-context";
import { apiFetch } from "@/src/api";
import { ACTIVITY_LEVELS, GOALS } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Form = {
  name: string;
  sex: "male" | "female" | "";
  day: string;
  month: string;
  year: string;
  height_cm: string;
  weight_kg: string;
  goal_weight_kg: string;
  activity_level: string;
  goal: string;
};

const STEPS = ["name", "sex", "birth", "height", "weight", "goal_weight", "activity", "goal"] as const;

export default function Onboarding() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, setOnboarded } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({
    name: user?.name ?? "",
    sex: "",
    day: "",
    month: "",
    year: "",
    height_cm: "",
    weight_kg: "",
    goal_weight_kg: "",
    activity_level: "moderate",
    goal: "",
  });

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const birth_date = `${form.year.padStart(4, "0")}-${form.month.padStart(2, "0")}-${form.day.padStart(2, "0")}`;
      return apiFetch("/profile", {
        method: "PUT",
        body: {
          name: form.name.trim(),
          sex: form.sex,
          birth_date,
          height_cm: Number(form.height_cm),
          weight_kg: Number(form.weight_kg),
          goal_weight_kg: Number(form.goal_weight_kg),
          activity_level: form.activity_level,
          goal: form.goal,
        },
      });
    },
    onSuccess: () => {
      toast.show("Perfil criado com sucesso!");
      setOnboarded();
    },
    onError: () => toast.show("Não foi possível salvar. Tente novamente.", "error"),
  });

  const current = STEPS[step];
  const canContinue = useMemo(() => {
    switch (current) {
      case "name":
        return form.name.trim().length >= 2;
      case "sex":
        return form.sex !== "";
      case "birth":
        return (
          Number(form.day) >= 1 && Number(form.day) <= 31 &&
          Number(form.month) >= 1 && Number(form.month) <= 12 &&
          form.year.length === 4 && Number(form.year) > 1920
        );
      case "height":
        return Number(form.height_cm) >= 100 && Number(form.height_cm) <= 250;
      case "weight":
        return Number(form.weight_kg) >= 30 && Number(form.weight_kg) <= 350;
      case "goal_weight":
        return Number(form.goal_weight_kg) >= 30 && Number(form.goal_weight_kg) <= 350;
      case "activity":
        return form.activity_level !== "";
      case "goal":
        return form.goal !== "";
    }
  }, [current, form]);

  const onNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else save.mutate();
  };
  const onBack = () => setStep((s) => Math.max(0, s - 1));

  const progress = (step + 1) / STEPS.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} disabled={step === 0} hitSlop={10} style={styles.backBtn} testID="onboarding-back">
          <Ionicons name="chevron-back" size={24} color={step === 0 ? "transparent" : colors.onSurface} />
        </Pressable>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.stepCount}>
          {step + 1}/{STEPS.length}
        </Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View key={current} entering={FadeIn.duration(250)} style={{ gap: spacing.lg }}>
          {current === "name" && (
            <StepText
              title="Como podemos te chamar?"
              subtitle="Seu nome de exibição no app."
              value={form.name}
              onChange={(v) => set("name", v)}
              placeholder="Seu nome"
              testID="input-name"
            />
          )}
          {current === "sex" && (
            <View style={{ gap: spacing.lg }}>
              <StepTitle title="Qual é o seu sexo biológico?" subtitle="Usado nas estimativas metabólicas." />
              <Choice label="Masculino" active={form.sex === "male"} onPress={() => set("sex", "male")} icon="male" testID="sex-male" />
              <Choice label="Feminino" active={form.sex === "female"} onPress={() => set("sex", "female")} icon="female" testID="sex-female" />
            </View>
          )}
          {current === "birth" && (
            <View style={{ gap: spacing.lg }}>
              <StepTitle title="Qual é a sua data de nascimento?" />
              <View style={styles.dateRow}>
                <SmallInput value={form.day} onChange={(v) => set("day", v)} placeholder="Dia" max={2} testID="input-day" />
                <SmallInput value={form.month} onChange={(v) => set("month", v)} placeholder="Mês" max={2} testID="input-month" />
                <SmallInput value={form.year} onChange={(v) => set("year", v)} placeholder="Ano" max={4} testID="input-year" />
              </View>
            </View>
          )}
          {current === "height" && (
            <StepText title="Qual é a sua altura?" subtitle="Em centímetros" value={form.height_cm} onChange={(v) => set("height_cm", v)} placeholder="175" suffix="cm" numeric testID="input-height" />
          )}
          {current === "weight" && (
            <StepText title="Qual é o seu peso atual?" subtitle="Em quilogramas" value={form.weight_kg} onChange={(v) => set("weight_kg", v)} placeholder="72" suffix="kg" numeric testID="input-weight" />
          )}
          {current === "goal_weight" && (
            <StepText title="Qual é o seu peso desejado?" subtitle="Em quilogramas" value={form.goal_weight_kg} onChange={(v) => set("goal_weight_kg", v)} placeholder="68" suffix="kg" numeric testID="input-goal-weight" />
          )}
          {current === "activity" && (
            <View style={{ gap: spacing.md }}>
              <StepTitle title="Qual é o seu nível de atividade?" />
              {ACTIVITY_LEVELS.map((a) => (
                <Choice key={a.key} label={a.label} desc={a.desc} active={form.activity_level === a.key} onPress={() => set("activity_level", a.key)} testID={`activity-${a.key}`} />
              ))}
            </View>
          )}
          {current === "goal" && (
            <View style={{ gap: spacing.md }}>
              <StepTitle title="Qual é o seu objetivo principal?" />
              {GOALS.map((g) => (
                <Choice key={g.key} label={g.label} active={form.goal === g.key} onPress={() => set("goal", g.key)} icon={g.icon} testID={`goal-${g.key}`} />
              ))}
            </View>
          )}
        </Animated.View>
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          testID="onboarding-continue"
          label={step === STEPS.length - 1 ? "Concluir" : "Continuar"}
          onPress={onNext}
          disabled={!canContinue}
          loading={save.isPending}
        />
      </View>
    </View>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const styles = useStyles();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.question}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function StepText({
  title,
  subtitle,
  value,
  onChange,
  placeholder,
  suffix,
  numeric,
  testID,
}: {
  title: string;
  subtitle?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix?: string;
  numeric?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <StepTitle title={title} subtitle={subtitle} />
      <View style={styles.inputWrap}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={(t) => onChange(numeric ? t.replace(/[^0-9.]/g, "") : t)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={numeric ? "decimal-pad" : "default"}
          style={styles.input}
          autoFocus
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function SmallInput({ value, onChange, placeholder, max, testID }: { value: string; onChange: (v: string) => void; placeholder: string; max: number; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.inputWrap, { flex: 1 }]}>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, "").slice(0, max))}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        style={[styles.input, { textAlign: "center" }]}
      />
    </View>
  );
}

function Choice({ label, desc, active, onPress, icon, testID }: { label: string; desc?: string; active: boolean; onPress: () => void; icon?: any; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      {icon ? <Ionicons name={icon} size={22} color={active ? colors.brandPrimary : colors.muted} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.choiceLabel, active && { color: colors.onSurface }]}>{label}</Text>
        {desc ? <Text style={styles.choiceDesc}>{desc}</Text> : null}
      </View>
      {active ? <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} /> : <View style={styles.radio} />}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  progressTrack: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 999, backgroundColor: colors.brandPrimary },
  stepCount: { color: colors.muted, fontSize: 13, fontWeight: "600", width: 36, textAlign: "right" },
  scroll: { padding: spacing.xl, paddingTop: spacing["2xl"], flexGrow: 1 },
  question: { color: colors.onSurface, fontSize: 26, fontWeight: "800", lineHeight: 32 },
  subtitle: { color: colors.muted, fontSize: 15 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 20, fontWeight: "600", paddingVertical: spacing.lg },
  suffix: { color: colors.muted, fontSize: 16, fontWeight: "600" },
  dateRow: { flexDirection: "row", gap: spacing.md },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  choiceActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  choiceLabel: { color: colors.onSurfaceSecondary, fontSize: 16, fontWeight: "600" },
  choiceDesc: { color: colors.muted, fontSize: 13, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 999, borderWidth: 2, borderColor: colors.border },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
}));
