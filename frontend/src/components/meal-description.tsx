import React, { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/src/api";
import { useConsent } from "@/src/hooks";
import { Button, Card } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { spacing, useTheme } from "@/src/theme";

type Item = { name: string; portion: string; grams: number; calories: number; protein: number; carbs: number; fat: number };
type Estimate = { status: "estimated"; draft_id: string; items: Item[]; assumptions: string[]; notice: string };
type EstimateResult = Estimate | { status: "needs_details"; question: string };
const nutrients = ["calories", "protein", "carbs", "fat"] as const;
const format = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function MealDescription({ meal, date, onSaved }: { meal: string; date: string; onSaved: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const consent = useConsent();
  const [text, setText] = useState("");
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [removed, setRemoved] = useState<number[]>([]);
  const [details, setDetails] = useState(false);

  const accept = useMutation({
    mutationFn: () => apiFetch("/account/consent", { method: "PUT", body: { ai_processing: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["consent"] }),
    onError: (error: Error) => toast.show(error.message, "error"),
  });
  const calculate = useMutation({
    mutationFn: () => apiFetch<EstimateResult>("/ai/meal-estimate", { method: "POST", body: { text } }),
    onSuccess: (data) => { setResult(data); setRemoved([]); setDetails(false); },
  });
  const estimate = result?.status === "estimated" ? result : null;
  const selected = estimate?.items.map((item, index) => ({ item, index })).filter(({ index }) => !removed.includes(index)) ?? [];
  const totals = selected.reduce((sum, { item }) => {
    for (const key of nutrients) sum[key] += item[key];
    return sum;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const save = useMutation({
    mutationFn: () => apiFetch("/diary/ai-meal", {
      method: "POST", body: { date, meal, draft_id: estimate!.draft_id, item_indices: selected.map(({ index }) => index) },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diary", date] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.show("Refeição salva no seu diário");
      onSaved();
    },
  });
  const busy = calculate.isPending || save.isPending;

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}>
    <Text style={{ color: colors.onSurface, fontSize: 22, fontWeight: "800" }}>O que você comeu?</Text>
    <Text style={{ color: colors.muted, lineHeight: 20 }}>Escreva do seu jeito. A IA estima as calorias e os macros da refeição.</Text>
    <TextInput
      testID="meal-description" accessibilityLabel="Descrição da refeição" multiline
      editable={!busy} value={text} maxLength={3000}
      onChangeText={(value) => { setText(value); setResult(null); calculate.reset(); save.reset(); }}
      placeholder="Ex.: 1 pão francês com 2 ovos mexidos"
      placeholderTextColor={colors.muted}
      style={{ minHeight: 116, textAlignVertical: "top", backgroundColor: colors.surfaceTertiary, color: colors.onSurface, padding: 16, borderRadius: 16, fontSize: 16, lineHeight: 23 }}
    />
    {!consent.data?.ai_processing ? <Card style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.onSurfaceSecondary, lineHeight: 20 }}>O cálculo envia somente a descrição da refeição ao provedor de IA configurado no Nutrify. É opcional; você pode desativar em Perfil &gt; Privacidade.</Text>
      {consent.isError ? <Button label="Tentar verificar consentimento" variant="secondary" onPress={() => consent.refetch()} /> : <Button label="Aceitar uso de IA" variant="secondary" disabled={consent.isLoading} loading={accept.isPending} onPress={() => accept.mutate()} />}
    </Card> : null}
    {!estimate ? <Button testID="parse-meal" label={calculate.isPending ? "Calculando sua refeição…" : "Calcular com IA"} loading={calculate.isPending} disabled={!text.trim() || !consent.data?.ai_processing} onPress={() => calculate.mutate()} /> : null}
    {calculate.error ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{calculate.error.message}</Text> : null}
    {result?.status === "needs_details" ? <Text accessibilityRole="alert" style={{ color: colors.warning, lineHeight: 21 }}>{result.question}</Text> : null}
    {estimate ? <>
      <Card testID="meal-estimate-summary" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
          <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 17 }}>Sua refeição</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Estimativa da IA</Text>
        </View>
        {selected.map(({ item, index }) => <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.onSurface, fontWeight: "600" }}>{item.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{item.portion}</Text>
          </View>
          <Text style={{ color: colors.onSurfaceSecondary }}>{Math.round(item.calories)} kcal</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${item.name}`} disabled={busy} onPress={() => setRemoved((old) => [...old, index])} hitSlop={8} style={{ padding: 6 }}>
            <Text style={{ color: colors.muted, fontSize: 20 }}>×</Text>
          </Pressable>
        </View>)}
        {!selected.length ? <Text style={{ color: colors.warning }}>Todos os itens foram removidos. Edite a descrição para calcular novamente.</Text> : null}
        <Text testID="meal-totals" style={{ color: colors.brandPrimary, fontSize: 32, fontWeight: "800" }}>{Math.round(totals.calories)} <Text style={{ fontSize: 14 }}>kcal estimadas</Text></Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {([['Proteínas', totals.protein], ['Carboidratos', totals.carbs], ['Gorduras', totals.fat]] as const).map(([label, value]) => <View key={label} style={{ flex: 1, minWidth: 76, gap: 4 }}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
            <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 17 }}>{format(value)} g</Text>
          </View>)}
        </View>
      </Card>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{estimate.notice}</Text>
      {estimate.assumptions.length ? <>
        <Pressable accessibilityRole="button" onPress={() => setDetails(!details)}><Text style={{ color: colors.onSurfaceSecondary, fontSize: 13, textDecorationLine: "underline" }}>{details ? "Ocultar suposições" : "Ver porções e preparo considerados"}</Text></Pressable>
        {details ? estimate.assumptions.map((assumption, index) => <Text key={index} style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>• {assumption}</Text>) : <Text numberOfLines={3} style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{estimate.assumptions.join(" ")}</Text>}
      </> : null}
      <Button testID="save-complete-meal" label="Salvar no diário" loading={save.isPending} disabled={!selected.length || busy} onPress={() => save.mutate()} />
      {save.error ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{save.error.message}</Text> : null}
      <Button label="Editar descrição e recalcular" variant="ghost" disabled={busy} onPress={() => { setResult(null); calculate.reset(); save.reset(); }} />
    </> : null}
  </ScrollView>;
}
