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
};

export type Profile = {
  onboarded: boolean;
  name?: string;
  sex?: string;
  birth_date?: string;
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
  return useQuery<{ results: { id: string; type: string; duration_min: number; calories: number }[] }>({
    queryKey: ["workouts", date],
    queryFn: () => apiFetch("/workouts", { params: { date } }),
  });
}
