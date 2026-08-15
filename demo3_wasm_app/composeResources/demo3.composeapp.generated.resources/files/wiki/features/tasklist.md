---
type: feature
title: Tasklist
description: A single-screen todo list with support for adding, checking off, indenting,
  reordering, and persisting tasks. Registered as the first item in the AiLift collection.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/tasklist/,
  Applications/Demo3/docs/features/tasklist_plan.md, Applications/Demo3/docs/features/tasklist_tasks.md]
tags: [demo3, feature, tasklist]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Tasklist

## Purpose
A single-screen todo list with support for adding, checking off, indenting, reordering, and persisting tasks. Registered as the first item in the AiLift collection. **Self-contained — no cross-feature dependencies.**

Location: `features/tasklist/`

## Responsibility

**Owns:** A persistent list of `TaskItem` entries. Each item has text, a checked state, an indent level (0 or 1), and a stable UUID. Supports adding items inline, adding after an existing item, reordering (move up/down), indenting (left/right, max 1 level), checking off (strikethrough), and removing items. The full list is persisted on every mutation to `LocalDataSource`.

**Does NOT own:** Any cross-feature orchestration or AI interactions. The feature is a plain todo list — it no longer integrates with `linear`, `jules`, or `ideas` (that coupling, plus the `grillme` ticket-sharpening feature it fed, was removed when the tasklist was simplified back to a pure todo list).

## Route & Entry Point

```kotlin
@Serializable
object TasklistRoute

fun NavController.navigateToTasklist()

fun NavGraphBuilder.tasklistScreenRoute(contentPadding: PaddingValues)
```

ViewModel obtained via `DiProvider.getComponent(TasklistComponent::class).viewModel`.

## Key Types

| Type | Description |
|------|-------------|
| `TasklistComponent` | DI component; wires `LocalDataSource`, repository, use cases, ViewModel, and the AI `tools` (`ListTasksTool`, `AddTaskTool`, `CompleteTaskTool`, `DeleteTaskTool`, `UpdateTaskTool`) by lazy |
| `TasklistViewModel` | Core `ViewModel<TasklistUiState>`; owns all list-manipulation logic |
| `TasklistUiState` | Sealed interface: `Loading`, `Success(tasks, focusedTaskId?)`, `ErrorState(error)` |
| `TaskItem` | `@Serializable data class` — `id, text, isChecked, indentLevel` |
| `TasklistRepository` / `TasklistRepositoryImpl` | Interface + `LocalDataSource`-backed impl (JSON key `tasklist_items_v1`) |
| `GetTasksUseCase` / `SaveTasksUseCase` | Thin use-case wrappers for bulk read/write; still used by the ViewModel for all UI mutations |
| `AddTaskUseCase` / `CompleteTaskUseCase` / `DeleteTaskUseCase` / `UpdateTaskUseCase` | Per-operation use cases (commonMain) that back the AI tools; each reads the list, mutates a single item, and saves |
| `TasklistScreen` | Entry-point composable; resolves the ViewModel from `TasklistComponent` and delegates to `TasklistContent`. Takes only `contentPadding`. |
| `TasklistContent` | Hosts the `Scaffold`. Provides an `ExtendedFloatingActionButton` (visible only in `Success` state) that triggers `onAddTask`. |
| `TasklistSuccessContent` | `internal` stateless composable receiving all callbacks as lambdas — enables standalone UI testing without a live ViewModel. |
| `TaskItemRow` | Per-row composable. Decomposed into `TaskItemDragHandle.kt` (drag handle gesture: axis-locked drag for reorder/indent) and `TaskItemTextField.kt` (inline text field with focus handling). All strings live in `strings_tasklist.xml`. Drag shadow elevation is 4dp. |

## Architecture

**Layers:** standard feature layout — `data/repository`, `domain/model` + `domain/repository` + `domain/usecase`, `ui/`, `ui/components/`, `tools/`, root `TasklistComponent.kt`. The `ui/components/` subfolder holds four files: `TasklistContent.kt`, `TasklistSuccessContent.kt`, `TaskItemRow.kt`, `TaskItemDragHandle.kt`, `TaskItemTextField.kt`.

**DI:** `TasklistComponent` is a plain class registered in `AiLiftPlugin.registerComponents`. All fields are `by lazy`. The ViewModel receives only `AnalyticsModule` from `DiProvider` plus the two use cases — no `LinearComponent` or other feature components.

**Persistence:** `TasklistRepositoryImpl` serialises `List<TaskItem>` to a JSON string and stores it in `LocalDataSource` under the key `"tasklist_items_v1"`. Reads are fault-tolerant — a parse error returns an empty list rather than crashing.

**Focus management:** `TasklistUiState.Success` carries an optional `focusedTaskId` that drives keyboard focus for the newly added row. The ViewModel exposes `clearFocusRequest()` to reset it after the composable consumes the event.

**Drag interaction:** `TaskItemDragHandle` runs a single `pointerInput` gesture with axis locking — a horizontal drag past a threshold steps the indent level (0↔1); a vertical drag past a threshold moves the row up/down. `TaskItemRow` animates the live drag offset and reorder placement (`spring(DampingRatioNoBouncy, StiffnessHigh)`).

**AI tools:** `TasklistComponent.tools` exposes five tools to the in-app AI agent: `ListTasksTool` (read, no confirmation), `AddTaskTool` (write, requires confirmation), `CompleteTaskTool` (write), `DeleteTaskTool` (write), and `UpdateTaskTool` (write, edits task text by id). Write tools all set `requiresConfirmation = true` and are backed by the corresponding per-operation use cases. These are local to the tasklist and do not reach into other features. All five are registered into `commonFeatureTools()` via `TasklistComponent`.

## Data Flow

1. `TasklistViewModel.init` → `loadTasks()` emits `Loading`, calls `GetTasksUseCase`, emits `Success`.
2. User adds a task → `addTask()` appends a new `TaskItem` (random UUID, empty text, `indentLevel = 0`), emits `Success(…, focusedTaskId = newId)`, then calls `SaveTasksUseCase` in a coroutine.
3. All mutations (`updateTaskText`, `toggleTaskChecked`, `indentTaskLeft/Right`, `moveTaskUp/Down`, `removeTask`) update the in-memory list, emit `Success`, then persist via `SaveTasksUseCase`.
4. `addTaskAfter(id)` inserts a new row at `index + 1`, inheriting the indent level of the item at `index`.

## ViewModel Operations

| Method | Effect |
|--------|--------|
| `addTask()` | Appends new item with indent 0, requests focus |
| `addTaskAfter(id)` | Inserts after given id, inherits indent, requests focus |
| `updateTaskText(id, text)` | Updates text in place, saves |
| `toggleTaskChecked(id)` | Flips `isChecked`, saves |
| `indentTaskRight(id)` | Increases indent up to max 1, saves |
| `indentTaskLeft(id)` | Decreases indent down to min 0, saves |
| `moveTaskUp(id)` | Swaps item with predecessor, saves |
| `moveTaskDown(id)` | Swaps item with successor, saves |
| `removeTask(id)` | Removes item by id, saves |
| `clearFocusRequest()` | Sets `focusedTaskId = null` after composable consumes focus |

## Dependencies

- **Core only:** `ViewModel<T>`, `DiProvider`, `AnalyticsModule`, `LocalDataSource`, `safeCall`, `Error`. No cross-feature imports.

## Tests

| File | What it tests |
|------|---------------|
| `commonTest/.../tasklist/ui/TasklistViewModelTest.kt` | ViewModel state transitions: initial load (`Loading` → `Success`), add, addAfter (inherits indent level), toggle checked, move up/down, indent bounds (0–1), text update, clear focus, load error |
| `commonTest/.../tasklist/data/repository/TasklistRepositoryImplTest.kt` | Repository: get/save round-trip, empty list, parse error fallback |
| `commonTest/.../tasklist/domain/repository/FakeTasklistRepository.kt` | In-memory repository stub used by UseCase and ViewModel tests |
| `commonTest/.../tasklist/domain/usecase/GetTasksUseCaseTest.kt` | `GetTasksUseCase` delegates to repository, maps results |
| `commonTest/.../tasklist/domain/usecase/SaveTasksUseCaseTest.kt` | `SaveTasksUseCase` persists via repository |
| `commonTest/.../tasklist/TasklistComponentTest.kt` | Component smoke test: verifies `TasklistComponent` wires repository and use cases correctly |
| `androidInstrumentedTest/.../catalog/TasklistScreenshotTest.kt` | Screenshot regression test for the tasklist UI |

## See Also

- [demo3-app-shell](../app-shell.md) — `AiLiftPlugin` registers `TasklistComponent`; `HomeComponent` wires `tasklistScreenRoute`

_Last updated: 2026-06-18_
