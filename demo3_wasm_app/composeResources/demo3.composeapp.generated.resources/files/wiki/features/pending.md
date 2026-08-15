---
type: feature
title: Pending
description: Swipe-to-decide workflow that surfaces closet items awaiting approval,
  grouped by calendar month.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/pending/]
tags: [demo3, feature, pending]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Pending

## Purpose
Swipe-to-decide workflow that surfaces closet items awaiting approval, grouped by calendar month.

Location: `features/pending/`

## Responsibility

Presents the user with a swipeable stack of `PendingItem`s fetched from the Revivle closet API. Items are loaded in month-sized groups; the user swipes left (archive), right (keep), or up (list) on each item. Completed groups trigger automatic loading of the next month bucket. An undo stack (up to 10 entries) lets the user reverse the last swipe.

## Route & Entry Point

- **Route object:** `PendingSwipe` (defined in `PendingNavigation.kt`)
- **Registration helper:** `NavGraphBuilder.pendingSwipeRoute(onNavigateBack, contentPadding)`
- **Navigation helper:** `NavController.navigateToPendingSwipe()`
- The composable resolves `PendingComponent` from `DiProvider` and reads `pendingSwipeViewModel`.

## Key Types

| Type | Role |
|---|---|
| `PendingComponent` | DI container; constructs and owns all feature-scoped objects |
| `PendingSwipeViewModel` | Owns `PendingUiState`; dispatches swipe actions and undo |
| `PendingUiState` | Holds `stack: List<PendingItem>`, `header: PendingHeaderState`, loading/error/complete flags |
| `PendingHeaderState` | Sealed class — `Hidden` or `Visible(label, count, totalCount)` |
| `PendingSwipeEffect` | One-shot channel events: `ShowError`, `NavigationBack` |
| `PendingItem` | Domain wrapper: `item: MyItem` + `month: PendingMonth` |
| `PendingMonth` | Value object for `(year, month)`; carries `sortKey` and `previousOrNull()` |
| `PendingMonthBucket` | `(month, items: MutableList<PendingItem>)` — transient grouping structure |
| `PendingMonthState` | Sealed interface: `Loading`, `Content`, `Empty`, `Completed` |
| `LoadNextPendingGroupUseCase` | Stateful use case; buffers pages and emits one `PendingMonthState` per call |
| `PendingRepositoryImpl` | Calls `ClosetApi`; maps DTO pages to domain items via `PendingItemMapper` |
| `ArchiveItemUseCase` / `KeepItemUseCase` / `ListItemUseCase` | Shared item-action use cases from `features/shared/revivle/itemactions/` |

## Architecture

Standard Clean Architecture with three layers:

```
ui/                     PendingSwipeScreen, PendingSwipeViewModel, PendingNavigation
ui/components/          PendingHeader, PendingLegend, PendingSwipeContent,
                        PendingSwipeEmptyState, PendingSwipeIndicator (uses named `contentDescription` param in `IconFile.Render`), PendingSwipeTopBar
domain/model/           PendingItem, PendingMonth, PendingMonthBucket, PendingMonthState
domain/usecase/         LoadNextPendingGroupUseCase
domain/repository/      PendingRepository (interface)
data/                   PendingRepositoryImpl
data/mapper/            PendingItemMapper
PendingComponent.kt     DI container (registered with DiProvider)
```

`PendingSwipeViewModel` extends the shared `ViewModel<PendingUiState>` base class and integrates `AnalyticsManager` for swipe and month-load events. Side effects (errors, back navigation) are delivered via a `Channel<PendingSwipeEffect>` collected in the screen composable.

## Data Flow

1. `onScreenEntered()` resets `LoadNextPendingGroupUseCase` and calls `loadMoreItems()`.
2. `LoadNextPendingGroupUseCase.loadNext()` fetches pages of 50 items from `PendingRepository`, buffers them in memory, and returns the next `PendingMonthState.Content` group (all items sharing the earliest month in the buffer).
3. `PendingSwipeViewModel` writes the group into `stack` and updates `PendingHeaderState.Visible` with label, per-month count, and running total from the API's `totalCount`.
4. User swipe → `ArchiveItemUseCase` / `KeepItemUseCase` / `ListItemUseCase` → API call → item removed from `stack`; successful swipe pushes item + direction onto `undoStack`.
5. When `stack` empties, `checkIfMonthComplete()` calls `loadMoreItems()` again; if the use case returns `Completed`, `isComplete = true`.
6. `onUndo()` pops the `undoStack` and prepends the item back into `stack`, incrementing header counts.

## Dependencies

- `ClosetApi` (Revivle generated client) — paginated pending items
- `MyItemRepository` / `MyItemRepositoryImpl` — backing repository for item-action use cases
- `AnalyticsModule` (via `DiProvider`) — event tracking
- `features/shared/revivle/itemactions/` — `ArchiveItemUseCase`, `KeepItemUseCase`, `ListItemUseCase`
- `core/ui/components/SwipeDirection` — direction enum shared with undo logic
- `core/config/Configuration.myClosetApiBaseUrl`

## Known Issues / Drift

- `LoadNextPendingGroupUseCase` is stateful (holds buffer, cursor, counts as instance fields). It is scoped to `PendingComponent` via lazy delegation, so it survives recompositions but is reset only by `onScreenEntered()`. Navigating away and back without the component being recreated will correctly reset via `onScreenEntered()`, but a process-level component leak would cause stale state.
- `PendingMonthBucket` and `PendingMonthState.Empty` / `PendingMonthState.Loading` are defined but `LoadNextPendingGroupUseCase` never emits `Loading` or `Empty` variants — the ViewModel infers loading from the coroutine lifecycle. These variants may be vestigial from an earlier design.
- The README references a fuller implementation plan at `docs/features/pending_plan.md`; verify this file still reflects the current pagination approach.

## Tests

`commonTest` coverage added in #425, extended in #515, further extended in #560:

| File | What it tests |
|------|---------------|
| `ui/PendingSwipeViewModelTest.kt` | `PendingSwipeViewModel` state transitions: initial load, swipe actions (archive/keep/list), undo stack, Turbine-based flow assertions. Uses `FakeMyItemRepository` and a stub `PendingRepository`. |
| `data/PendingRepositoryImplTest.kt` | `PendingRepositoryImpl` unit tests: fetching pages, cursor advancement, empty-page handling, API error propagation (#515). |
| `domain/usecase/LoadNextPendingGroupUseCaseTest.kt` | `LoadNextPendingGroupUseCase` stateful cursor/buffer logic: initial group, multi-item buffering, month-boundary grouping, exhaustion (#515). |
| `data/mapper/PendingItemMapperTest.kt` | Domain mapper edge cases: null fields, type coercion, boundary values (#560). |
| `domain/model/PendingMonthTest.kt` | `PendingMonth` domain model: equality, grouping logic, month boundary edge cases (#560). |

## See Also

- `features/mycloset/` — source of `MyItem` domain model
- `features/shared/revivle/itemactions/` — swipe action use cases
- `docs/features/pending_plan.md` — original design document
- `.wiki/apps/demo3/features/profile.md`

_Last updated: 2026-06-24 — `PendingSwipeScreen`: `Scaffold` replaced with `AppScaffold(title=stringResource(pending_review_title), …)`; `PendingSwipeTopBar` composable import removed (navigation icon now owned by `AppScaffold`). `PendingSwipeContent` extracted to own component in parallel refactor._
