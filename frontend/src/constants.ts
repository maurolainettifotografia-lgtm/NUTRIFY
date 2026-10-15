export const MEALS = [
  { key: "cafe_manha", label: "Café da Manhã", icon: "cafe-outline" },
  { key: "lanche_manha", label: "Lanche da Manhã", icon: "nutrition-outline" },
  { key: "almoco", label: "Almoço", icon: "restaurant-outline" },
  { key: "lanche_tarde", label: "Lanche da Tarde", icon: "ice-cream-outline" },
  { key: "jantar", label: "Jantar", icon: "pizza-outline" },
  { key: "ceia", label: "Ceia", icon: "moon-outline" },
] as const;

export const MEAL_LABELS: Record<string, string> = Object.fromEntries(
  MEALS.map((m) => [m.key, m.label]),
);

export const ACTIVITY_LEVELS = [
  { key: "sedentary", label: "Sedentário", desc: "Pouco ou nenhum exercício" },
  { key: "light", label: "Leve", desc: "Exercício leve 1-3x/semana" },
  { key: "moderate", label: "Moderado", desc: "Exercício moderado 3-5x/semana" },
  { key: "active", label: "Ativo", desc: "Exercício intenso 6-7x/semana" },
  { key: "very_active", label: "Muito Ativo", desc: "Exercício muito intenso / trabalho físico" },
] as const;

export const GOALS = [
  { key: "emagrecimento", label: "Emagrecimento", icon: "trending-down-outline" },
  { key: "ganho_massa", label: "Ganho de massa muscular", icon: "barbell-outline" },
  { key: "manutencao", label: "Manutenção de peso", icon: "remove-outline" },
  { key: "recomposicao", label: "Recomposição corporal", icon: "sync-outline" },
  { key: "performance", label: "Performance esportiva", icon: "flash-outline" },
] as const;

export const GOAL_LABELS: Record<string, string> = Object.fromEntries(
  GOALS.map((g) => [g.key, g.label]),
);

export const WORKOUT_TYPES = [
  { key: "musculacao", label: "Musculação", icon: "barbell-outline", kcalPerMin: 7 },
  { key: "corrida", label: "Corrida", icon: "walk-outline", kcalPerMin: 11 },
  { key: "ciclismo", label: "Ciclismo", icon: "bicycle-outline", kcalPerMin: 8 },
  { key: "outro", label: "Outro", icon: "fitness-outline", kcalPerMin: 6 },
] as const;

export const SIGNATURE = "by Mauro Lainetti";
export const COPYRIGHT = "© 2026 Nutrify — Mauro Lainetti. Todos os direitos reservados.";

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
