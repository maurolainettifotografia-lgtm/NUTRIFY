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
  { key: "performance", label: "Condicionamento / performance", icon: "flash-outline" },
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

export const MUSCLE_LABELS: Record<string, string> = {
  peito: "Peito", costas: "Costas", ombros: "Ombros", biceps: "Bíceps", triceps: "Tríceps",
  pernas: "Pernas", gluteos: "Glúteos", panturrilha: "Panturrilha", abdomen: "Abdômen",
  corpo_inteiro: "Corpo inteiro", outro: "Outro",
};

/** Minusculas e sem acento, para buscar "triceps" e achar "Tríceps". */
export function fold(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** "2026-10-20" -> "20/10" */
export function formatShortDate(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

/** 67.5 -> "67,5"; 60 -> "60" */
export function formatKg(n: number) {
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

export type RecordLike = { name: string; kind: string; value: number; previous: number };

/** "Supino reto: 67,5 kg (antes 65 kg)" */
export function describeRecord(r: RecordLike) {
  if (r.kind === "reps") return `${r.name}: ${r.value} repetições`;
  const label = r.kind === "1rm" ? "1RM estimado " : "";
  const before = r.previous > 0 ? ` (antes ${formatKg(r.previous)} kg)` : "";
  return `${r.name}: ${label}${formatKg(r.value)} kg${before}`;
}

export function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Versao da Politica de Privacidade (igual a POLICY_VERSION do servidor).
export const POLICY_VERSION = "2026-10";
// PREENCHA com o seu e-mail de contato para assuntos de privacidade (aparece na Politica de Privacidade).
export const PRIVACY_CONTACT = "maurolainettifotografia@gmail.com";

export const SIGNATURE = "by Mauro Lainetti";
export const COPYRIGHT = "© 2026 Nutrify — Mauro Lainetti. Todos os direitos reservados.";

/** Local (not UTC) YYYY-MM-DD, so late-evening entries stay on the user's current day. */
export function toDateStr(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

