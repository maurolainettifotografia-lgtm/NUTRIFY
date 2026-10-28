import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/src/api";

export type Goals = {
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  athlete_mode: boolean;
  water_goal_ml: number;
  calorie_floor?: number;
  floor_applied?: boolean;
  below_floor?: boolean;
};

export type Profile = {
  personal_plan?: { text: string; notice: string; created_at: string; profile_snapshot: Record<string, unknown> };
  onboarded: boolean;
  name?: string;
  sex?: string;
  birth_date?: string;
  age_years?: number;
  age_recorded_on?: string;
  height_cm?: number;
  weight_kg?: number;
  goal_weight_kg?: number;
  activity_level?: string;
  goal?: string;
  athlete_mode?: boolean;
  water_goal_ml?: number;
  custom_goals?: { calories: number; protein: number; carbs: number; fat: number };
  goals?: Goals;
};

export type DiaryEntry = {
  estimated?: boolean;
  source?: string;
  assumptions?: string[];
  items?: { name: string; grams: number; calories: number; protein: number; carbs: number; fat: number }[];
  id: string;
  meal: string;
  name: string;
  brand?: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  computed: { calories: number; protein: number; carbs: number; fat: number };
};

export type DiaryResponse = {
  date: string;
  meals: Record<string, { entries: DiaryEntry[]; calories: number; protein: number; carbs: number; fat: number }>;
  totals: { calories: number; protein: number; carbs: number; fat: number };
  goals: Goals;
  target_calories: number;
  workout_calories: number;
};

export function useProfile() {
  return useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: () => apiFetch<Profile>("/profile"),
  });
}

export function useDiary(date: string) {
  return useQuery<DiaryResponse>({
    queryKey: ["diary", date],
    queryFn: () => apiFetch<DiaryResponse>("/diary", { params: { date } }),
  });
}

export function useWater(date: string) {
  return useQuery<{ date: string; total_ml: number; goal_ml: number }>({
    queryKey: ["water", date],
    queryFn: () => apiFetch("/water", { params: { date } }),
  });
}

export function useWorkouts(date: string) {
  return useQuery<{ results: { id: string; type: string; title?: string | null; session_id?: string; source?: string; duration_min: number; calories: number }[] }>({
    queryKey: ["workouts", date],
    queryFn: () => apiFetch("/workouts", { params: { date } }),
  });
}

export type RoutineExercise = {
  name: string;
  muscle_group: string;
  sets: number;
  reps: number;
  weight_kg: number;
  rest_s: number;
  notes?: string | null;
};

export type Routine = {
  id: string;
  name: string;
  notes?: string | null;
  exercises: RoutineExercise[];
  exercise_count: number;
  last_done?: string | null;
};

export type SessionSet = { reps: number; weight_kg: number };

export type PersonalRecord = { name: string; kind: "carga" | "1rm" | "reps"; value: number; previous: number; reps?: number | null };

export type Session = {
  calories_burned?: number;
  records?: PersonalRecord[];
  id: string;
  routine_id?: string | null;
  routine_name: string;
  date: string;
  duration_min: number;
  volume_kg: number;
  total_sets: number;
  exercises: { name: string; muscle_group: string; sets: SessionSet[] }[];
};

export type LastPerformance = Record<string, { name: string; date: string; sets: SessionSet[] }>;

export function useRoutines() {
  return useQuery<{ results: Routine[] }>({
    queryKey: ["routines"],
    queryFn: () => apiFetch("/routines"),
  });
}

export function useSessions(limit = 10) {
  return useQuery<{ results: Session[] }>({
    queryKey: ["sessions", limit],
    queryFn: () => apiFetch("/sessions", { params: { limit } }),
  });
}

export type Consent = { policy_version: string; ai_processing: boolean; terms_accepted: boolean };

export function useConsent() {
  return useQuery<Consent>({
    queryKey: ["consent"],
    queryFn: () => apiFetch("/account/consent"),
  });
}

export type ProgressPoint = {
  date: string;
  max_weight: number;
  est_1rm: number;
  max_reps: number;
  bw_reps: number;
  volume: number;
  sets: SessionSet[];
};

export type ExerciseProgress = {
  name: string;
  points: ProgressPoint[];
  records: { max_weight: { value: number; date: string } | null; best_1rm: { value: number; date: string } | null };
};

export type ExerciseDone = { name: string; sessions: number; last_date: string };

export function useProgressExercises() {
  return useQuery<{ results: ExerciseDone[] }>({
    queryKey: ["progress", "exercises"],
    queryFn: () => apiFetch("/progress/exercises"),
  });
}

export function useExerciseProgress(name: string | null) {
  return useQuery<ExerciseProgress>({
    queryKey: ["progress", "exercise", name],
    queryFn: () => apiFetch("/progress/exercise", { params: { name: name ?? "" } }),
    enabled: !!name,
  });
}
