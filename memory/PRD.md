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

## Iteration 2 (2026-10-20)
- Fix: birth date now single masked DD/MM/AAAA input with real-date + age (10–110) validation and inline error.
- Fix: diary/add-food use LOCAL date (todayStr) instead of UTC (items no longer land on "tomorrow" at night).
- Fix: PUT /profile weight log upsert (no DuplicateKeyError when re-saving profile same day).
- Brazilian foods: built-in TACO base (~110 foods, backend/taco_foods.py) searched first, then OFF filtered to Brazil (fallback worldwide).
- Nutri IA chat assistant (OpenAI gpt-5.5, SSE streaming) at /assistant: knows profile, goals, today's diary/water/workouts; history in `chat_messages`; clear chat.


## Iteration 3
- Meal suggestions: POST /api/ai/meal-suggestions {meal,date} (gpt-5.5) → 3 Brazilian meals using only TACO foods; macros computed server-side; screen /suggestions with "Adicionar" per suggestion.
- Barcode: /barcode screen (expo-camera scanner EAN13/EAN8/UPC on native; manual code entry everywhere incl. web) → GET /api/foods/barcode/{code} → portion + meal → add to diary. Entry points: dashboard quick cards + add-food header icon.

## Iteration 4
- Homemade recipes: CRUD /api/recipes (name, servings, ingredients per-100g + grams; view adds per-100g, serving_grams, totals). Add-food tab "Receitas" (list, create, edit pencil) + /recipe-editor screen (search ingredients, grams, per-serving summary, delete). Logging prefills 1 serving; quick buttons 0.5/1/1.5/2 porções.



## Backlog
- P1: Recipes (multi-ingredient), food comparison tool, meal suggestions by goals.
- P2: Barcode scanner UI (camera), weekly meal planning, shopping list, fitness app integrations, email verification/password reset (N/A for Google-only).

## Next Tasks
- Recipes creator; compare foods; meal suggestions.
