---
type: feature
title: Calisthenics
description: Progressive bodyweight training with deterministic 2-step intake, 9 static programs, 42-exercise beginner guide catalog, adaptive visual sheet, wall-clock rest timer, and calendar progress tracking.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/calisthenics/]
tags: [demo3, feature, calisthenics, fitness]
timestamp: '2026-11-10T12:00:00Z'
last_commit: main
category: feature
---

# Calisthenics

## Purpose

Bodyweight exercise training feature designed for progressive strength, endurance, and mobility development. Combines deterministic intake calibration, 9 static programs (The Architect, The Catalyst, The Longevity Specialist across Levels 1–3), a 42-exercise beginner catalog with comprehensive guides, an adaptive visual sheet with anatomical muscle mapping, a single-mode workout session player with wall-clock countdown timers, and persistent streak and calendar progress tracking.

Location: `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/calisthenics/`

## Responsibility

**Owns:**
- First-run safety screening (`safetyAcknowledged`) and deterministic 2-step intake calibration (pull-up capacity, bodyweight squat capacity, goal selection).
- Deterministic profile resolution to one of 9 static programs (`architect_l1..l3`, `catalyst_l1..l3`, `longevity_l1..l3`).
- Static program loading and structural validation (`ProgramRepository`, `ProgramValidator`).
- 42-exercise beginner guide catalog and validation (`ExerciseCatalogRepository`, `ExerciseCatalogValidator`).
- "How to do it" exercise guide sheet (`ExerciseGuideSheet`), automatic first-encounter display (`seenExerciseIds`), easier/harder variation navigation, and visual asset resolution (`VisualAssetResolver`, `visual_manifest.json`, `docs/calisthenics/visual-asset-spec.md`).
- Anatomical muscle mapping (`MuscleMap`) with primary (100% accent) and secondary (40% accent) highlighting.
- Single-mode workout session player (`ActiveWorkoutScreen`), set completion logging (`repMin` default or hold timer), session rotation, and rest interval execution.
- Wall-clock rest countdown timer (`restEndsAt: Instant` via injected `Clock`), Skip, Pause/Resume, +15s controls, and haptic/visual feedback (`RestFeedback`).
- State persistence (`CalisthenicsSessionState` schema version 1) with corrupt JSON backup recovery.
- Weekly progress (Monday–Sunday) and 70-day heatmap tracking (`CalendarProgressCalculator`), and streak tracking (`StreakCalculator` with 3-day allowed gap for 3x/week programs).
- Today dashboard integration (`CalisthenicsTodayWidget` on `DailyScreen` Today tab).
- Analytics funnel event emissions (`calisthenics_intake_completed`, `calisthenics_session_started`, `calisthenics_session_completed`, `calisthenics_rest_skipped`, `calisthenics_recalibrated`, `calisthenics_guide_opened`).

**Does not own:**
- User authentication (relies on Clerk/Auth data source).
- Standalone app-level navigation routes (embedded directly in `DailyScreen`).

## Route & Entry Point

Embedded as a dedicated top-level tab in `DailyScreen` (`features/daily`):
1. **Unified Tab Integration (`OTI-415`)**: `DailyScreen` provides two tabs: **Today** and **Calisthenics**.
2. **`CalisthenicsTodayWidget` (`OTI-415`)**: Rendered directly on the Today tab when a workout is pending and onboarding is completed (`!completedToday`).
3. **`CalisthenicsPane()`**: Root composable for the Calisthenics tab. Renders either `SafetyDisclaimerScreen`, `OnboardingScreen`, `ActiveWorkoutScreen`, `CompletedScreen`, or `MomentumScreen` depending on `CalisthenicsUiState`.

## Architecture & Subsystems

```
features/calisthenics/
├── CalisthenicsComponent.kt                  # Manual DI container
├── data/
│   └── repository/
│       ├── CalisthenicsRepositoryImpl.kt     # Preferences-backed session state persistence
│       ├── ProgramRepositoryImpl.kt          # Static program loader (Res.readBytes)
│       └── ExerciseCatalogRepositoryImpl.kt  # Exercise guide catalog loader (Res.readBytes)
├── domain/
│   ├── model/
│   │   ├── CalisthenicsItem.kt              # Root session state, UserLevel, Routine, SessionLog
│   │   ├── ProfileRoutingModels.kt          # PullCapacity, SquatCapacity, Persona
│   │   ├── WorkoutProgram.kt                # WorkoutProgram, WorkoutSession, SessionExercise
│   │   ├── ExerciseGuide.kt                 # ExerciseGuide, ExercisePose, ExerciseMistake
│   │   ├── Equipment.kt                     # Floor, Wall, PullUpBar, ChairOrBench
│   │   └── MuscleGroup.kt                   # 18 anatomical muscle groups
│   ├── repository/
│   │   ├── CalisthenicsRepository.kt        # Session state persistence interface
│   │   ├── ProgramRepository.kt             # Program loader interface
│   │   └── ExerciseCatalogRepository.kt     # Catalog loader interface
│   ├── validator/
│   │   ├── ProgramValidator.kt              # Structural & phase validation for programs
│   │   └── ExerciseCatalogValidator.kt      # Catalog & entry integrity validator
│   ├── visual/
│   │   └── VisualAssetResolver.kt           # Manifest-driven placeholder / asset resolver
│   ├── feedback/
│   │   └── RestFeedback.kt                  # Expect/actual haptics & timer pulses
│   └── usecase/
│       ├── ResolveProfileUseCase.kt         # Deterministic intake routing
│       ├── StreakCalculator.kt              # 3-day gap streak engine
│       └── CalendarProgressCalculator.kt    # Weekly & 70-day heatmap calculator
└── ui/
    ├── CalisthenicsScreen.kt                # Root feature pane and dispatch
    ├── CalisthenicsUiState.kt               # Sealed UI states
    ├── CalisthenicsViewModel.kt             # State orchestration, timer, analytics
    ├── CalisthenicsColors.kt                # High-contrast accessible color tokens
    ├── CompletedScreen.kt                   # Post-workout completion summary
    ├── guide/
    │   └── ExerciseGuideSheet.kt            # "How to do it" adaptive modal sheet
    ├── components/
    │   ├── ExerciseVisual.kt                # 4:3 visual placeholder / image renderer
    │   ├── MuscleMap.kt                     # Anatomical front/back body schematic
    │   └── TimerWidget.kt                   # Countdown rest timer controls
    ├── onboarding/
    │   └── OnboardingScreen.kt              # Safety screen & 2-step intake UI
    ├── momentum/
    │   └── MomentumScreen.kt                # Dashboard: streak, routine card, heatmap
    └── workout/
        └── ActiveWorkoutScreen.kt           # Session player: sets, cues, hold/rest timers
```

### 1. Safety Screen & 2-Step Deterministic Intake (`OTI-457`, `OTI-267`, `OTI-435`)
- **Safety Screen**: Acknowledged gate (`safetyAcknowledged`) detailing training disclaimers, stop-if-it-hurts guidance, and mandatory warmup/cooldown adherence.
- **Step 1 (Physical Assessment)**: Evaluates `PullCapacity` (`NONE`, `ONE_TO_SEVEN`, `EIGHT_PLUS`) and `SquatCapacity` (`UNSTABLE`, `FIFTEEN_SOLID`, `UNILATERAL_OR_PAUSED`) supported by side-by-side standard cards (`pull_up.pose.hanging`, `pull_up.pose.top`, `bodyweight_squat.pose.bottom`). The physical tier is `minOf(pull.tier, squat.tier)`.
- **Step 2 (Goal Selection)**: 3 plain-language goal cards ("Get stronger", "Move faster", "Move better") mapping to internal `Persona` (`ARCHITECT`, `CATALYST`, `LONGEVITY`) without exposing internal archetype names to the user.
- **Profile Resolution**: `ResolveProfileUseCase` deterministically maps `(tier, persona)` to one of 9 static profiles.
- **Recalibrate Routine**: Users can re-calibrate anytime from the dashboard, pre-filling previous answers and bypassing the safety screen while preserving `historyLogs`, `streak`, and `seenExerciseIds`.

### 2. 9 Static Programs & Validator (`OTI-266`, `OTI-432`, `OTI-433`, `OTI-434`)
- Located at `composeResources/files/programs/<profile_id>.json`.
- Each program specifies 3 training days (`days_per_week: 3`).
- Every session strictly follows a non-interleaved sequence:
  - 1–3 `WARMUP` exercises (e.g. `arm_circles`, `cat_cow`)
  - 4–6 `MAIN` exercises (strictly selected from the 42 catalog exercises)
  - 1–3 `COOLDOWN` exercises (e.g. `child_pose`, `chest_doorway_stretch`, `seated_forward_fold`)
- Validated via `ProgramValidator` ensuring lower snake_case IDs, valid rep ranges (`rep_min <= rep_max`) or positive `hold_seconds`, valid tempos, sets >= 1, restSeconds >= 0, and non-blank cues.

### 3. 42-Exercise Beginner Guide Catalog (`OTI-443`, `OTI-446`)
- Located at `composeResources/files/exercises/<id>.json` + `index.json`.
- Complete guides with beginner-friendly `displayName`, `alsoKnownAs`, plain `description`, `setup`, 3–5 `steps`, 2–3 `cues`, 1–4 `mistakes` with actionable fixes, clear `repStandard`, `easierId`/`harderId` progression links, equipment requirements, muscle mappings, and visual specifications.
- Validated via `ExerciseCatalogValidator` ensuring bijective index match and complete coverage.

### 4. Guide Sheet, Placeholder Visuals & MuscleMap (`OTI-447`, `OTI-445`, `OTI-448`)
- **`ExerciseGuideSheet`**: Adaptive `ModalBottomSheet` on mobile, dialog on wide screens. Automatically opens on the first encounter of an exercise during a session via `seenExerciseIds`, and supports stack-based navigation through easier and harder variants.
- **`ExerciseVisual`**: 4:3 card with role badge (`Start`, `Middle`, `End`, `Hold`), loaded via `VisualAssetResolver`. Backed by `composeResources/files/exercises/visual_manifest.json` (42 exercises, 77 poses, 42 movements) and documented in `docs/calisthenics/visual-asset-spec.md`.
- **`MuscleMap`**: Vector-based front/back anatomical body schematic highlighting targeted muscle groups with high visual contrast (100% primary accent, 40% secondary accent).

### 5. Workout Session Player & Wall-Clock Rest Timer (`OTI-268`, `OTI-436`, `OTI-437`)
- **Session Player**: Exercises rotate automatically via `program.sessions[completedSessionsCount % sessions.size]`. Features a prominent central "Done" button per set (auto-logging `repMin`), hold timer support via `startHoldTimer()`, an exercise skip option, and a top-bar Back control enabling users to exit and resume without data loss.
- **Wall-Clock Rest Timer**: Rest intervals calculate expiration via `restEndsAt: Instant` using injected `kotlin.time.Clock`. Persists reliably across backgrounding and supports Pause/Resume, Skip, and `+15s` extensions. Fires haptic and visual pulses on natural completion via `RestFeedback`.

### 6. Persistence, Streak & Calendar Progress (`OTI-430`, `OTI-431`, `OTI-438`, `OTI-439`, `OTI-440`, `OTI-442`)
- **Schema & Versioning**: `CalisthenicsSessionState` with `CALISTHENICS_SCHEMA_VERSION = 1`. If corrupted JSON is encountered, a timestamped backup is preserved (`calisthenics_session_state_backup_<epochMillis>`) before resetting safely.
- **Durations & Timestamps**: Computed using injected `Clock` and system `TimeZone` for accurate ISO dates and elapsed workout durations.
- **Streak Calculation**: `StreakCalculator` enforces a 3-day allowed gap between workouts to support standard 3x/week training splits without resetting streaks prematurely.
- **Calendar Progress**: `CalendarProgressCalculator` generates 7-day Monday–Sunday weekly progress and 70-day historical activity heatmaps.

## Analytics Events

- `calisthenics_intake_completed`: Emitted upon completing intake calibration (`profile_id`, `persona`, `tier`).
- `calisthenics_session_started`: Emitted when starting a workout session (`routine_name`, `profile_id`, `day_number`).
- `calisthenics_session_completed`: Emitted on workout completion (`routine_name`, `total_sets`, `total_reps`, `duration_seconds`).
- `calisthenics_rest_skipped`: Emitted when skipping an active rest interval.
- `calisthenics_recalibrated`: Emitted when resetting or recalibrating the intake routine.
- `calisthenics_guide_opened`: Emitted when opening an exercise guide sheet (`exercise_id`, `source`).

## Verification & Tests

- `ProgramRepositoryTest`: Unit tests for program JSON deserialization and in-memory caching.
- `ProgramValidatorTest`: Exhaustive test suite verifying all structural rules and negative cases across sessions and exercises.
- `ExerciseCatalogRepositoryTest`: Unit tests for catalog index and guide parsing.
- `ExerciseCatalogValidatorTest`: Comprehensive test suite verifying stub and complete exercise guide invariants.
- `ProgramCatalogCrossCheckTest`: Release gate verifying all 9 static programs load cleanly, pass `ProgramValidator`, all referenced exercises exist in the catalog, and all 42 catalog exercises pass `ExerciseCatalogValidator`.
- `VisualManifestTest`: Release gate verifying all 77 poses and 42 movements match catalog specifications bijectively.
- `ResolveProfileUseCaseTest`: Verifies deterministic mapping across all 9 combinations of capacity and goal.
- `StreakCalculatorTest`: Tests consecutive days, 2-day/3-day gaps, and streak resets.
- `CalendarProgressCalculatorTest`: Tests Monday–Sunday weekly progress and 70-day heatmap generation.
- `CalisthenicsViewModelTest`: Tests intake flow, workout execution, rest timer, and analytics emissions.
