---
type: feature
title: Calisthenics
description: Bodyweight exercise training feature with progressive skill advancement, workout tracking, and performance metrics.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/calisthenics/]
tags: [demo3, feature, calisthenics, fitness]
timestamp: '2026-07-25T00:00:00Z'
last_commit: f1e53c187cf60d6c318801128139674bbd4ad44b
category: feature
---

# Calisthenics

## Purpose
Bodyweight exercise training feature with progressive skill advancement, workout tracking, personal records, and performance metrics. Two main modes: Phase A (Onboarding) for initial assessment, Phase B (Momentum) for ongoing routine execution and progress dashboards.

Location: `features/calisthenics/`

## Responsibility

**Owns:** user fitness onboarding flow (pushups/pullups/plank assessment), routine generation and execution, set/rep tracking, timer management, streak tracking, personal records, skill progression ladder, weekly activity heatmap, and session state persistence.

**Does not own:** user authentication, profile management, or social features.

## Route & Entry Point

```kotlin
@Serializable
object CalisthenicsRoute
```

Embedded as a tab within the AiLift collection; accessed via `DailyScreen` (Habits feature). Navigation is internal to the feature — no standalone route. Exposed via `CalisthenicsPane(isMomentumTab)` composable that checks session state to determine which phase to render.

## Key Types

- `CalisthenicsRoute` — `@Serializable` route for the feature pane (consumed by tab system).
- `CalisthenicsComponent` — manual DI component; constructs repository, use cases, and ViewModel. Scoped singleton via `DiProvider.getComponent(CalisthenicsComponent::class)`.
- `CalisthenicsRepository` / `CalisthenicsRepositoryImpl` — interface + implementation; manages session state, routine persistence, and heatmap data via local storage.
- `CalisthenicsSessionState` — root domain state: `onboardingCompleted`, `level: UserLevel` (LEVEL_1/2/3), `answers: OnboardingAnswers`, `activeRoutine: Routine?`, `streak`, `lastCompletedTimestamp`, `completedToday`, `personalRecords`, `skillProgressions`, `heatmap`, `weeklyProgress`.
- `UserLevel` — enum: LEVEL_1 (Pure Beginner), LEVEL_2 (Intermediate Beginner), LEVEL_3 (Advanced Beginner). Determined by onboarding assessment.
- `OnboardingAnswers` — data class: `pushupsCount: Int`, `canDoRowsOrPullups: String` ("no" / "rows" / "pullups"), `plankSeconds: Int`. Used to seed routine generation and compute user level.
- `Routine` — data class: `name: String`, `exercises: List<Exercise>`. Tracks `totalSets`, `completedSets`, `isCompleted`.
- `Exercise` — data class: `id, name, targetSets, targetReps, isHold, holdDurationSeconds, restSeconds, setsCompletion: List<Boolean>`. Computed properties: `isCompleted`.
- `PersonalRecord` — data class: `exerciseName, value: String, dateDescription: String`. Immutable snapshots of top achievements.
- `SkillProgression` — data class: `targetSkillName, steps: List<SkillProgressionStep>`. Unlocks as exercises are completed; gates progression to harder variants.
- `SkillProgressionStep` — data class: `stepName, isCompleted, isLocked, description`.
- `HeatmapDay` — data class: `dateStr: String` (YYYY-MM-DD), `intensity: Int` (0–4). Activity heatmap for Dashboard.
- `CalisthenicsUiState` — sealed interface: `Loading`, `Onboarding(step, answers, isGenerating)`, `SessionActive(sessionState, activeTimerSeconds, isTimerRunning, currentRestingExerciseId)`, `SessionCompleted(streak, totalSets, totalReps)`.
- `CalisthenicsViewModel` — extends `core.ui.ViewModel<CalisthenicsUiState>`; orchestrates phase transitions, routine execution, timer control, and analytics.
- `GenerateRoutineUseCase` — generates a `Routine` from `OnboardingAnswers` and `UserLevel`; produces progressively harder routines as user levels up.

## Architecture

Full clean architecture:

- **Domain** (`domain/`): `CalisthenicsRepository`, `GenerateRoutineUseCase`, model data classes (`CalisthenicsItem`, `Routine`, `Exercise`, etc.).
- **Data** (`data/`): `CalisthenicsRepositoryImpl` provides session state persistence via local storage (likely `PreferencesRepository` or similar key-value store for state hydration on app launch).
- **UI** (`ui/`): `CalisthenicsScreen.kt` root pane, `CalisthenicsScreenContent` (stateless, previewed), `CalisthenicsViewModel` with `StateFlow<CalisthenicsUiState>`.

## Data Flow

1. **App launch** → `CalisthenicsPane` triggers `loadSession()` → ViewModel queries `CalisthenicsRepositoryImpl` → UI renders based on `onboardingCompleted` flag.
2. **Phase A (Onboarding)** → User answers three questions (pushups, pullups/rows, plank hold) → ViewModel calls `GenerateRoutineUseCase(answers)` → routine is generated and session state transitions to `SessionActive`.
3. **Phase B (Momentum)** → `SessionActive` renders active `Routine`, displays exercises with set counters, timer for rest intervals. User taps set completion → ViewModel updates `setsCompletion` list → UI reflects progress. On final set, user taps "Complete Workout" → state transitions to `SessionCompleted`, streak increments, `completedToday` flag sets, heatmap updates.
4. **Dashboard** → Momentum tab displays streak, heatmap, personal records, skill progression ladder (unlocked milestones, locked next steps).

## Patterns & Decisions

- **Phase-based UI** — Onboarding and active session are separate `UiState` cases so navigation is stateless; UI reads phase from state rather than maintaining local flags.
- **Assessment-based routine generation** — User level is computed once on onboarding; routine difficulty grows as user levels up (triggered by completion metrics, not manual progression).
- **Local persistence only** — Session state is persisted to local storage; no backend sync. Streak, routine progress, personal records survive app restarts.
- **Timer abstraction** — Rest intervals are managed via `activeTimerSeconds` + `isTimerRunning` in `SessionActive`. Timer lifecycle is tied to session state (cleared on completion).
- **Heatmap granularity** — One entry per day (intensity 0–4); weekly view aggregates into 7-day progress array (`weeklyProgress: List<Boolean>`).

## Gotchas

- **Phase B launch rewrite (2026-07-25)** — Recent commit introduced Phase B (Momentum) dashboard polish: onboarding slider refinements, Momentum tab rendering. The dashboard now properly displays skill progression ladder and personal records alongside active session controls. Note: design tokens (CoralEnergy, VoltGreen) are hardcoded in `CalisthenicsScreen.kt` pending Material 3 token integration.
- **Timer state durability** — If the app is backgrounded during a rest interval, timer state may not persist (depending on `ViewModel.onCleared()`). Investigate whether rest-timer pause/resume should checkpoint to repository.
- **Routine generation is stateless** — `GenerateRoutineUseCase` is deterministic per `(level, answers)` pair. Calling it twice with the same inputs produces identical routines. No seeding or variety.
- **No routine customization** — Generated routine cannot be edited; user must complete or reset. Reset clears session and returns to onboarding.

## Tests

No unit or instrumented tests yet for Calisthenics feature. Coverage candidates: `GenerateRoutineUseCase` (routine structure, progression), `CalisthenicsViewModel` state transitions, set completion logic, streak/heatmap updates.
