import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useTheme } from "@/src/theme";

type Nutrition = { calories: number; protein: number; carbs: number; fat: number };
const metrics = [
  { key: "calories", label: "Calorias", unit: "kcal", color: "#FF276B", bright: "#FF6B9E", radius: 143 },
  { key: "protein", label: "Proteínas", unit: "g", color: "#B8F34B", bright: "#DCFF89", radius: 119 },
  { key: "carbs", label: "Carboidratos", unit: "g", color: "#00D8D0", bright: "#79FFF1", radius: 95 },
  { key: "fat", label: "Gorduras", unit: "g", color: "#FFB34E", bright: "#FFDB8A", radius: 71 },
] as const;
const safe = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const amount = (value: number) => Math.round(safe(value)).toLocaleString("pt-BR");

export function NutritionRings({ consumed, goals }: { consumed: Nutrition; goals: Nutrition }) {
  const { colors } = useTheme();
  const remaining = safe(goals.calories) - safe(consumed.calories);
  const hasGoal = safe(goals.calories) > 0;
  return <View testID="nutrition-rings" style={{ width: "100%", gap: 18 }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, fontSize: 20, fontWeight: "800" }}>Seu equilíbrio de hoje</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Cada refeição conta para sua meta</Text></View>
      <View style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.brandTertiary }}><Text style={{ color: colors.brandPrimary, fontSize: 11, fontWeight: "700" }}>HOJE</Text></View>
    </View>
    <View style={{ width: "100%", maxWidth: 340, aspectRatio: 1, alignSelf: "center", alignItems: "center", justifyContent: "center" }} accessibilityRole="image" accessibilityLabel={metrics.map(m => `${m.label}: ${amount(consumed[m.key])} ${m.unit}${goals[m.key] > 0 ? ` de ${amount(goals[m.key])}` : ", meta não definida"}`).join(". ")}>
      <Svg width="100%" height="100%" viewBox="0 0 320 320">
        <Defs>{metrics.map(m => <LinearGradient key={m.key} id={`nutrition-${m.key}`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={m.bright}/><Stop offset="1" stopColor={m.color}/></LinearGradient>)}</Defs>
        {metrics.map(m => {
          const p = safe(goals[m.key]) > 0 ? Math.min(safe(consumed[m.key]) / goals[m.key], 1) : 0;
          const circumference = 2 * Math.PI * m.radius;
          return <React.Fragment key={m.key}>
            <Circle cx={160} cy={160} r={m.radius} fill="none" stroke={m.color} strokeOpacity={0.13} strokeWidth={18}/>
            {p > 0 ? <Circle cx={160} cy={160} r={m.radius} fill="none" stroke={`url(#nutrition-${m.key})`} strokeWidth={18} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1-p)} rotation={-90} origin="160,160"/> : null}
          </React.Fragment>;
        })}
      </Svg>
      <View pointerEvents="none" style={{ position: "absolute", width: "36%", alignItems: "center", gap: 3 }}>
        <Text testID="dashboard-consumed" numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.onSurface, fontSize: 32, fontWeight: "900", letterSpacing: -1 }}>{amount(consumed.calories)}</Text>
        <Text style={{ color: colors.muted, fontSize: 11 }}>kcal consumidas</Text>
      </View>
    </View>
    <View style={{ alignItems: "center", gap: 4 }}>
      <Text testID="calorie-remaining" style={{ color: hasGoal && remaining < 0 ? "#FFB34E" : colors.onSurface, fontSize: 17, fontWeight: "700", textAlign: "center" }}>{hasGoal ? `${amount(Math.abs(remaining))} kcal ${remaining < 0 ? "acima da meta" : "restantes"}` : "Defina sua meta no perfil"}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{hasGoal ? `Meta diária: ${amount(goals.calories)} kcal` : "Os anéis acompanham suas metas diárias"}</Text>
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {metrics.map(m => <View key={m.key} testID={`dashboard-${m.key}`} style={{ flexBasis: "46%", flexGrow: 1, backgroundColor: colors.surfaceTertiary, borderRadius: 16, padding: 12, gap: 7 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: m.color }}/><Text style={{ color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" }}>{m.label}</Text></View>
        <Text style={{ color: m.color, fontSize: 20, fontWeight: "800" }}>{amount(consumed[m.key])}<Text style={{ color: colors.muted, fontSize: 11, fontWeight: "500" }}> / {safe(goals[m.key]) > 0 ? amount(goals[m.key]) : "—"} {m.unit}</Text></Text>
        {goals[m.key] > 0 && consumed[m.key] > goals[m.key] ? <Text style={{ color: colors.muted, fontSize: 10 }}>{amount(consumed[m.key] / goals[m.key] * 100)}% da meta</Text> : null}
      </View>)}
    </View>
  </View>;
}