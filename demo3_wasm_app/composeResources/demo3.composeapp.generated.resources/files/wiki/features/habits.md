---
type: feature
title: Habits
description: 'Feature that owns the Daily route — a 3-tab pager (Daily Habits, Pulse,
  Momentum) that hosts the habits list, the weather widget, and Calisthenics panes.'
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/habits/]
tags: [demo3, feature, habits]
timestamp: '2026-08-01T00:00:00Z'
category: feature
---

# Habits

## Purpose

Feature that owns the **Daily** route — a 3-tab pager (`Daily Habits` / `Pulse` / `Momentum`) that hosts the habits list, the weather widget, and the Calisthenics panes. Originally introduced as a habits-only stub, expanded into the full Daily entry point via `DailyPlugin` and `Features.DAILY_COLLECTION`.

Location: `features/habits/`

## Responsibility

Owns the `DailyRoute` and its scaffold (`DailyScreen`, `DailyScreenTabs`, `DailyScreenPager`), the habits domain model (`Habit` sealed class, `HabitType`), the `HabitsRepository` interface, `HabitsViewModel` + `HabitsUiState`, and the `HabitsComponent` DI container. Also owns the tab-0 `WeatherSection` composable that adapts the weather feature's states to a compact widget slot.

Does NOT own weather data (delegated to the `weather` feature), calisthenics UI (delegated to `CalisthenicsPane`), habit persistence (no repository implementation exists — the interface has no backing data source), or route registration (owned by `DailyPlugin`).

## Route & Entry Point

```kotlin
@Serializable
object DailyRoute

fun NavGraphBuilder.dailyScreenRoute(contentPadding: PaddingValues = PaddingValues())
```

Registered by `DailyPlugin` (`app/plugins/DailyPlugin.kt`), which also calls `DiProvider.registerComponent(HabitsComponent())` alongside the `Profile`, `Weather`, and `Calisthenics` components. `DailyPlugin` participates in `Features.DAILY_COLLECTION` and appears in the app's home nav graph via `App.kt`.

## Key Types

| Type | Description |
|------|-------------|
| `HabitType` (enum) | `Daily`, `Weekly`, `Monthly` |
| `Habit` (sealed class) | Domain model with `DailyHabit`, `WeeklyHabit`, `MonthlyHabit` subtypes; each carries a name, description, target count, and current count |
| `HabitsRepository` (interface) | Declares `getHabits`, `createHabit`, `updateHabit` — **no production implementation** |
| `HabitsViewModel` | Extends `core.ui.ViewModel<HabitsUiState>`; `getHabits()` and `createHabit(name, description, type)` are currently no-ops |
| `HabitsUiState` (sealed interface) | `Loading`, `Success(habits: List<Habit>)`, `Error(message: String)` |
| `HabitsComponent` (DI class) | Feature-scoped DI container; exposes `habitsViewModel` via `by lazy` |
| `DailyScreen` | Composable scaffold: `Column { DailyScreenTabs; DailyScreenPager(weight=1f) }` |
| `DailyScreenTabs` / `DailyScreenPager` | Extracted composables driving a `TabRow` + `HorizontalPager` with three pages |
| `HabitsComponent` (composable, `ui/components/`) | Reads `HabitsUiState` and renders `HabitsList` / `LoadingIndicator` / `TitleMediumText` |
| `HabitsList`, `DailyHabitItem`, `WeeklyHabitItem`, `MonthlyHabitItem`, `HabitHeader` | Reusable habit-row composables |

## UI

**One-line summary.** A 3-tab paged screen (`Daily Habits` / `Pulse` / `Momentum`) that shows a weather widget followed by the user's habits list on tab 0, and delegates tabs 1–2 to `CalisthenicsPane`.

Layout (Success state — `Daily Habits` tab, weather loaded, one `DailyHabit`):

```
┌──────────────────────────────────────┐
│  Daily Habits │  Pulse  │  Momentum  │
├──────────────────────────────────────┤
│  ┌────────────────────────────────┐  │
│  │  [WeatherWidget]               │  │
│  │  city name · temp · condition  │  │
│  │                  [Change city] │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │  # WidgetCard
│  │  ┌──────────────────────────┐  │  │  # PillBox (DailyHabitItem)
│  │  │  Workout                 │  │  │
│  │  │  10+ Pull ups            │  │  │
│  │  │  o  o  o  .  .  .  .    │  │  │  # StatusCircles (3/7 filled)
│  │  └──────────────────────────┘  │  │
│  │  Read a book                   │  │  # WeeklyHabit (title only)
│  │  Read                          │  │  # MonthlyHabit (title only)
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

**States.** Habits (`HabitsUiState`): `Loading` → `LoadingIndicator`; `Error(message)` → `TitleMediumText` (no retry); `Success(habits)` → `HabitsList`; no `Empty` variant. Weather (independent): `Loading` / `Error` → plain text (`weather_loading` / `weather_error`); `CityNotSet` → `CityPickerWidget`; `Success` → `WeatherWidget`.

**Interactions.** Tab tap → `pagerState.animateScrollToPage(index)`; horizontal swipe moves the tab indicator. Inside the weather widget, "Change city" resets to `CityNotSet`, search feeds `weatherVm.searchCity`, selection feeds `weatherVm.selectCity`, the device-location button feeds `weatherVm.setDeviceLocation(lat, lon)` via `rememberLocationRequester`. Tab 0 is vertically scrollable; tabs 1–2 delegate to `CalisthenicsPane(isMomentumTab)`.

**Notes.** `weatherViewModel` is nullable — in previews `WeatherSection` is skipped. `WeeklyHabitItem`/`MonthlyHabitItem` render only a `TitleLargeText` (no circles). `DailyHabitItem` uses a `LazyRow { item { for … } }` of `StatusCircle`s (see Drift). `LaunchedEffect(Unit)` in `dailyScreenRoute` fires `viewModel.getHabits()` and `weatherViewModel.loadWeather()` on entry.

## Architecture

```
features/habits/
├── HabitsComponent.kt              # DI container (feature-scoped)
├── domain/
│   ├── model/Habit.kt              # sealed Habit + HabitType enum
│   └── repository/HabitsRepository.kt  # interface only, no impl
└── ui/
    ├── DailyScreen.kt              # DailyRoute, DailyScreen, tabs, pager, WeatherSection
    ├── HabitsViewModel.kt          # ViewModel<HabitsUiState> + sealed HabitsUiState
    └── components/
        └── HabitsComponents.kt     # HabitsComponent + list/item composables + samples
```

Cross-feature wiring inside `DailyScreen`:

```
DailyScreen
├── page 0 → WeatherSection(WeatherViewModel)  # from features/weather
│           └── HabitsComponent(HabitsViewModel)
├── page 1 → CalisthenicsPane(isMomentumTab=false)  # from features/calisthenics
└── page 2 → CalisthenicsPane(isMomentumTab=true)
```

## Data Flow

1. `DailyPlugin.registerComponents(scope)` → `DiProvider.registerComponent(HabitsComponent())` (plus Profile, Weather, Calisthenics).
2. `NavGraphBuilder.dailyScreenRoute(contentPadding)` composes on `DailyRoute` entry → resolves `habitsViewModel` and `weatherViewModel` from `DiProvider`.
3. `LaunchedEffect(Unit)` → `viewModel.getHabits()` (currently a no-op inside a `viewModelScope.launch`, so state stays `Loading`) + `weatherViewModel.loadWeather()`.
4. `DailyScreen` builds a `TabRow` + `HorizontalPager(pageCount = 3)`; tapping a tab calls `pagerState.animateScrollToPage(index)`.
5. Tab 0 renders a scrollable `Column` — `WeatherSection` (adapts `WeatherUiState`) then `HabitsComponent` composable → `collectAsStateWithLifecycle` on `HabitsUiState` → dispatches to `HabitsList` / `LoadingIndicator` / `TitleMediumText`.
6. Tabs 1 and 2 render `CalisthenicsPane(isMomentumTab)` opaque panes owned by the calisthenics feature.
7. `createHabit(name, description, type)` on the ViewModel is exposed but has no body and no caller in the current UI.

## Dependencies

- **Own**: `HabitsComponent` (DI), `HabitsViewModel`, `HabitsRepository` interface, `Habit` / `HabitType` domain, `DailyScreen` + subcomposables.
- **Core**: `core.ui.ViewModel` (base), `core.di.DiProvider`, `core.util.platform.Log`, `core.ui.components.{LoadingIndicator, PillBox, StatusCircle, TitleLargeText, TitleMediumText}`, `platform.widget.WidgetCard`.
- **Cross-feature**: `features.weather` (`WeatherComponent`, `WeatherViewModel`, `WeatherUiState`, `CityPickerWidget`, `WeatherWidget`), `features.calisthenics` (`CalisthenicsPane`).
- **Compose Resources**: `habits_workout`, `habits_workout_desc_daily`, `habits_workout_desc_weekly`, `habits_read`, `habits_read_desc`, `habits_daily_habits_tab`, `habits_pulse_tab`, `habits_momentum_tab`, `weather_loading`, `weather_error`.
- **Platform**: `platform.location.rememberLocationRequester` (via `WeatherSection`).
- **Navigation**: `androidx.navigation.compose`, `kotlinx.serialization` (`@Serializable object DailyRoute`).
- **App layer**: `app.plugins.DailyPlugin` registers the component and installs the route; `app.theme.LocalDimens` supplies spacing tokens.

## Known Issues / Drift

- **`HabitsRepository` is not wired.** `HabitsViewModel` has the repository injection commented out (`// val habitsRepository: HabitsRepository`), so `getHabits()` and `createHabit()` are empty bodies. The screen stays in `Loading` forever in production — see `ui/HabitsViewModel.kt:14` and lines `18`–`24`.
- **No `RepositoryImpl` or data source exists.** Only `FakeHabitsRepository` in `commonTest` implements the interface; there is no `data/` package under `features/habits/`.
- **`DailyScreen` scope creep.** The screen also embeds `WeatherSection` and two `CalisthenicsPane`s, so the "habits" feature owns cross-feature composition. Consider extracting the pager scaffold into an app-shell composable or renaming the feature to `daily`.
- **No stateless `Content(state, onEvent)` extracted.** `DailyScreen` takes `HabitsViewModel` (and `WeatherViewModel`) directly, violating the "extract a stateless `Content` for previews" rule — the only `@Preview` (`DailyScreenPreview`) has to instantiate a real `HabitsViewModel`.
- **Hardcoded dp values in `HabitsComponents.kt`.** `Spacer(Modifier.height(8.dp))` at line 68 and `Spacer(Modifier.width(4.dp))` at line 76 bypass `LocalDimens`.
- **`LazyRow` wrapping a single `item {}` with a `for` loop.** `DailyHabitItem`'s status-circle row uses a `LazyRow { item { for (...) ... } }` (lines 69–78), which emits everything eagerly — a `Row` would be more idiomatic than a lazy container that never lazy-loads.
- **`WeeklyHabitItem` and `MonthlyHabitItem` are stubs.** Each renders only a `TitleLargeText` — no status circles, no progress. `HabitsList` still switches on all three variants.
- **Sample data lives in production code.** `sampleDailyHabit`, `sampleWeeklyHabit`, `sampleMonthlyHabit`, and `sampleHabitList` in `HabitsComponents.kt` are public `@Composable` helpers shipped in `commonMain`; they should live under a preview/test module or be marked private.
- **Two symbols named `HabitsComponent`.** The DI class (`features/habits/HabitsComponent.kt`) and the UI composable (`features/habits/ui/components/HabitsComponents.kt`) share a name; `DailyScreen.kt` imports the DI class as `HabitsDiComponent` to disambiguate.
- **Pulse/Momentum tab strings live in `strings_habits.xml`** even though those tabs render `CalisthenicsPane`. If the calisthenics feature is refactored, these keys will need to move.
- **No `commonTest` for `DailyScreen`.** Only `HabitsComponent` (DI wiring), `HabitsViewModel`, and `FakeHabitsRepository` are tested — no snapshot or interaction test covers the tab/pager scaffold.

## Tests

| File | What it tests |
|------|---------------|
| `features/habits/HabitsComponentTest.kt` | DI `HabitsComponent` returns the same `habitsViewModel` instance on repeated access (`by lazy`). |
| `features/habits/ui/HabitsViewModelTest.kt` | Initial state is `Loading`; `getHabits()` and `createHabit()` do not emit new states (they are no-ops in the current implementation). |
| `features/habits/domain/repository/FakeHabitsRepository.kt` | In-memory test double implementing `HabitsRepository`. |
| `features/habits/domain/repository/FakeHabitsRepositoryTest.kt` | Verifies `create`, `get`, and `update` behavior on the fake, including the no-op path when `updateHabit` is called with an unknown name. |

## See Also

- [weather](./weather.md) — provides the widget rendered on tab 0 via `WeatherSection`
- [calisthenics](./calisthenics.md) — provides the `CalisthenicsPane` rendered on tabs 1 and 2
- [profile](./profile.md) — the other feature registered by `DailyPlugin`
- [demo3-app-shell](../app-shell.md) — where `DailyPlugin` is installed into the nav graph
- [features index](./index.md)

_Last updated: 2026-08-01_
