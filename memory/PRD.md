# Nutrify — PRD

## Original Problem Statement
Build "Nutrify" (by Mauro Lainetti), a premium, dark-mode-first mobile nutrition app: calorie & macro tracking, food diary (6 meals), food search (Open Food Facts), nutrition calculator (Mifflin-St Jeor TMB/TDEE), animated dashboard (calorie ring + macro bars), water hydration, weight/evolution reports, Athlete Mode (workouts adjust daily target without double-counting), AI food recognition by photo, Google login, per-user data isolation. Signature "by Mauro Lainetti" across welcome/profile/about + copyright.

## User Choices
- Login: Emergent-managed Google Auth
- Food data: Open Food Facts
- AI photo recognition: OpenAI gpt-5.6-terra (Emergent LLM key)
- Theme: dark default (#0D0F12 bg, #1A1D23 cards, #B8F34B accent), optional light

## Architecture
- Frontend: Expo Router (React Native), @tanstack/react-query, react-native-svg + reanimated (charts), react-native-gifted-charts, @gorhom/bottom-sheet, expo-camera + expo-image-picker (AI scan), @react-native-vector-icons/ionicons.
- Backend: FastAPI + Motor (MongoDB). All routes under /api. Soft deletes (deleted_at).
- Auth: Emergent Google OAuth; session_token (7d) in secure store; per-user isolation via user_id.

## User Personas
- Everyday user tracking weight/diet.
- Athlete (musculação/corrida/ciclismo) using Athlete Mode.

## Implemented (2026-10-15)
- Auth: /auth/session, /auth/me, /auth/logout; welcome + gate + onboarding routing.
- Onboarding: name, sex, birthdate, height, weight, goal weight, activity, goal.
- Goals: Mifflin-St Jeor TMB/TDEE, macro split, custom override, athlete base multiplier.
- Food: Open Food Facts search (search.openfoodfacts.org), barcode, custom foods, favorites.
- Diary: 6 meals, add/edit/delete, copy day, per-100g×grams totals, target_calories.
- Dashboard: animated calorie ring + macro bars, hydration widget, summary.
- Hydration: daily total + goal, quick-add 200/300/500 ml.
- Weight + Reports: weight line chart, daily calorie bars, averages vs goal, TMB/TDEE.
- Athlete Mode: workouts (type/duration/kcal), daily target = base + workout kcal (no double count).
- AI recognition: /ai/recognize (gpt-5.6-terra vision) → foods with macros, add to diary.
- Profile: edit profile sheet, athlete toggle, theme toggle (dark default), about + signature, delete account, logout.
- Branding: "by Mauro Lainetti" + © 2026 copyright on welcome/profile.

## Backlog
- P1: Recipes (multi-ingredient), food comparison tool, meal suggestions by goals.
- P2: Barcode scanner UI (camera), weekly meal planning, shopping list, fitness app integrations, email verification/password reset (N/A for Google-only).

## Next Tasks
- Recipes creator; compare foods; meal suggestions.
