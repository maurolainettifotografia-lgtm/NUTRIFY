import React from "react";
import { ScrollView, Text } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { profileAge } from "@/src/profile-age";
import { apiFetch } from "@/src/api";
import { useProfile } from "@/src/hooks";
import { ACTIVITY_LEVELS, GOAL_LABELS } from "@/src/constants";
import { Button, Card } from "@/src/components/primitives";
import { AiConsentGate } from "@/src/components/ai-consent-gate";
import { spacing, useTheme } from "@/src/theme";
export default function PersonalPlan() { return <AiConsentGate><Plan /></AiConsentGate>; }
function Plan() {
 const { colors }=useTheme(), insets=useSafeAreaInsets(), router=useRouter(), qc=useQueryClient();
 const profile=useProfile(); const p=profile.data;
 const generate=useMutation({mutationFn:()=>apiFetch<PlanData>("/ai/personal-plan",{method:"POST"}),onSuccess:()=>qc.invalidateQueries({queryKey:["profile"]})});
 const complete=!!(p && profileAge(p) !== undefined && p.height_cm&&p.weight_kg&&p.goal_weight_kg&&p.goal&&p.activity_level);
 const plan=generate.data??p?.personal_plan;
 const snapshot=plan?.profile_snapshot;
 const stale=!!(snapshot && p && (snapshot.age!==profileAge(p) || snapshot.weight_kg!==p.weight_kg || snapshot.height_cm!==p.height_cm || snapshot.goal_weight_kg!==p.goal_weight_kg || snapshot.goal!==p.goal || snapshot.activity_level!==p.activity_level));
 return <ScrollView style={{flex:1,backgroundColor:colors.surface}} contentContainerStyle={{padding:spacing.lg,paddingTop:insets.top+spacing.lg,paddingBottom:insets.bottom+32,gap:spacing.lg}}>
  <Button label="Voltar ao perfil" variant="ghost" onPress={()=>router.back()}/>
  <Text style={{color:colors.onSurface,fontSize:24,fontWeight:"800"}}>Sua orientação personalizada</Text>
  <Card style={{gap:spacing.sm}}><Text style={{color:colors.onSurface,fontWeight:"700"}}>Revise os dados antes de gerar</Text><Text style={{color:colors.onSurfaceSecondary}}>Idade: {p ? profileAge(p) ?? "Não informada" : "Não informada"} anos{"\n"}Altura: {p?.height_cm??"—"} cm · Peso: {p?.weight_kg??"—"} kg{"\n"}Peso desejado: {p?.goal_weight_kg??"—"} kg{"\n"}Objetivo: {GOAL_LABELS[p?.goal??""]??"Não informado"}{"\n"}Atividade: {ACTIVITY_LEVELS.find(a=>a.key===p?.activity_level)?.label??"Não informada"}</Text></Card>
  <Text style={{color:colors.muted}}>A IA usará esses dados para sugerir uma rotina geral de treino e alimentação. Você decide se deseja adotá-la; ela não altera suas metas nem cria treinos automaticamente.</Text>
  {!complete&&<Text style={{color:colors.warning}}>Complete os dados essenciais em Perfil &gt; Editar antes de gerar.</Text>}
  <Button testID="generate-personal-plan" label="Confirmar dados e gerar sugestão" disabled={!complete||profile.isFetching} loading={generate.isPending} onPress={()=>generate.mutate()}/>
  {generate.error&&<Text accessibilityRole="alert" style={{color:colors.error}}>{generate.error.message}</Text>}
  {plan&&<Card style={{gap:spacing.md}}><Text style={{color:colors.warning}}>{plan.notice}</Text><Text style={{color:colors.muted,fontSize:12}}>Gerada em {new Date(plan.created_at).toLocaleString("pt-BR")} com os dados salvos naquele momento. Gere novamente se o perfil mudou.</Text>{stale ? <Text style={{color:colors.warning}}>Seu perfil mudou desde esta orientação. Gere uma nova sugestão antes de usá-la.</Text> : null}<Text style={{color:colors.muted,fontSize:12}}>Dados utilizados: {String(snapshot?.age??"—")} anos · {String(snapshot?.height_cm??"—")} cm · {String(snapshot?.weight_kg??"—")} kg · peso desejado {String(snapshot?.goal_weight_kg??"—")} kg · {GOAL_LABELS[String(snapshot?.goal??"")]??"—"}.</Text><Text selectable style={{color:colors.onSurface,lineHeight:23}}>{plan.text}</Text></Card>}
 </ScrollView>;
}
export type PlanData={text:string;notice:string;created_at:string;profile_snapshot:Record<string,unknown>};
