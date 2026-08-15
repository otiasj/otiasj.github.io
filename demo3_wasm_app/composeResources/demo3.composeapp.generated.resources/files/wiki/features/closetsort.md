---
type: feature
title: Closet Sort
description: Domain layer for a Tinder-style swipe deck that lets a user rapidly triage
  pending closet items (keep / archive / add images / list for sale). Scaffolded via
  the KMP porting engine; data, UI, and wiring are not yet implemented.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/closetsort/]
tags: [demo3, feature, closetsort, scaffold, porting-engine]
timestamp: '2026-08-01T00:00:00Z'
last_commit: c559c215f
category: feature
---

# Closet Sort

## Purpose

Domain layer for a Tinder-style swipe deck that lets a user rapidly triage pending closet items. Each card represents one `ClosetSortItem`; a swipe in one of four directions (LEFT keep, RIGHT archive, UP add/manage images, DOWN list for sale) commits an action and advances the deck.

Introduced by PR #1302 (`feat(demo3): port domain layer for closet-sort feature`) as the first stage of a port from the Revivle web feature via `Scripts/porting_engine/`. Only the domain layer has landed so far — no repository implementation, no UI, no ViewModel, no plugin wiring, no tests.

Location: `features/closetsort/`

## Responsibility

**Owns (as scaffolded):** the sort-game domain vocabulary — `ClosetSortItem` deck cards, immutable `SortGameState` snapshots (deck, position, `hasMore`, derived `currentItem`/`nextItem`/`isFinished`/`canUndo`), the `SortSwipeDirection` enum, `SortGhost` outgoing-card metadata, `SortListItemParams` for the "list for sale" gesture, tunable `SortGameConstants`, a `ClosetSortRepository` port, and seven single-purpose use cases that wrap each repository call in `safeCall`.

**Does NOT own (yet):** any repository implementation, any UI, any ViewModel, any plugin registration, or any `commonTest` coverage. The auto-launch trigger from the pending page (`CheckSortAutoLaunchUseCase`) is defined but no caller invokes it.

## Route & Entry Point

_No route yet._ The feature has no `@Serializable` route object, no `NavGraphBuilder` extension, no `NavController.navigateTo…()` helper, and no `AppPlugin` registers a `Component` for it. Adding it will require a new `ClosetSortRoute`, a `ClosetSortPane` / `ClosetSortContent` split (per the template pane contract), and registration in the plugin that owns the pending flow — most likely alongside `features/pending/` given `CheckSortAutoLaunchUseCase`'s `AUTO_LAUNCH_THRESHOLD = 5` hint.

## Key Types

| Type | Description |
|------|-------------|
| `ClosetSortItem` | Deck card domain model: `id`, `name`, `brand?`, `description?`, `price?`, `salePrice?`, `imageUrl?`, `images`, `category?`, `size?`, `color?`, `pages`, `ownerId?` |
| `SortGameState` | Immutable deck snapshot: `deck`, `position`, `totalCount?`, `hasMore`, `isLoading` + derived `currentItem`, `nextItem`, `isFinished`, `canUndo`, `total` |
| `SortSwipeDirection` | Enum: `LEFT` (keep) / `RIGHT` (archive) / `UP` (add-images) / `DOWN` (list-for-sale) |
| `SortGhost` | Outgoing card animation payload: `key`, `item`, `direction`, `startX`, `startY` |
| `SortListItemParams` | `itemId`, `salePrice`, `requestImageEnhancement` — bundle passed to the list-for-sale gesture |
| `SortGameConstants` | Tunables: `BATCH_LIMIT=60`, `PREFETCH_THRESHOLD=10`, `AUTO_LAUNCH_THRESHOLD=5`, `REWARD_INTERVAL=10`, `MAX_EMPTY_BATCHES=8`, `INGEST_DEBOUNCE_MS=400`, `RETRY_DELAY_MS=300`, `SUBVIEW_CLOSE_MS=220` |
| `ClosetSortRepository` | Port: `fetchPendingBatch(page, limit)`, `keepItem` / `keepItems`, `archiveItem` / `archiveItems`, `listItemWithPrice`, `moveItemToPending` (undo), `getPendingItemsCount`, `updateItemMainImage` |
| `FetchPendingSortBatchUseCase` | `invoke(page, limit)` → `PaginatedResult<ClosetSortItem>`; used to prime and prefetch the deck |
| `KeepSortItemUseCase` / `ArchiveSortItemUseCase` | LEFT / RIGHT swipe commits |
| `ListSortItemUseCase` | DOWN swipe commit; two overloads (`SortListItemParams` and flat args) |
| `UpdateSortItemImageUseCase` | UP swipe commit; sets the main image URL |
| `UndoSortActionUseCase` | Rewinds any swipe by calling `moveItemToPending(itemId)` |
| `GetPendingSortCountUseCase` | Pending-count read for badges / dashboards |
| `CheckSortAutoLaunchUseCase` | Returns `true` when pending-count ≥ `AUTO_LAUNCH_THRESHOLD`; intended to auto-open the sort game from the Pending page |

## UI

_No user-facing screen._ The feature is domain-only; no `*Screen.kt`, `*Pane.kt`, `*Content.kt`, or `@Preview` composables exist. The four `SortSwipeDirection` values (LEFT / RIGHT / UP / DOWN) describe the intended gesture vocabulary once a screen is built.

## Architecture

```
closetsort/
└── domain/
    ├── model/
    │   ├── ClosetSortItem.kt
    │   ├── SortGameConstants.kt
    │   ├── SortGameState.kt
    │   ├── SortGhost.kt
    │   ├── SortListItemParams.kt
    │   └── SortSwipeDirection.kt
    ├── repository/
    │   └── ClosetSortRepository.kt
    └── usecase/
        ├── ArchiveSortItemUseCase.kt
        ├── CheckSortAutoLaunchUseCase.kt
        ├── FetchPendingSortBatchUseCase.kt
        ├── GetPendingSortCountUseCase.kt
        ├── KeepSortItemUseCase.kt
        ├── ListSortItemUseCase.kt
        ├── UndoSortActionUseCase.kt
        └── UpdateSortItemImageUseCase.kt
```

No `ClosetSortComponent`, no `data/` package, no `ui/` package. Every use case follows the same one-liner shape: `safeCall { repository.xxx(...).getOrThrow() }`.

## Data Flow

_Intended flow (not yet implemented — nothing calls these use cases today):_

1. A future `ClosetSortViewModel` calls `FetchPendingSortBatchUseCase(page = 1)` to seed a `SortGameState` with the first batch of `ClosetSortItem`s (up to `BATCH_LIMIT = 60`).
2. When `deck.size - position <= PREFETCH_THRESHOLD` (10), it calls `FetchPendingSortBatchUseCase(page = n + 1)` to prefetch the next batch; empty-batch retries respect `RETRY_DELAY_MS` and give up after `MAX_EMPTY_BATCHES`.
3. Each swipe maps to one use case: LEFT → `KeepSortItemUseCase(itemId)`, RIGHT → `ArchiveSortItemUseCase(itemId)`, UP → `UpdateSortItemImageUseCase(itemId, imageUrl)`, DOWN → `ListSortItemUseCase(SortListItemParams(...))`. The advancing card becomes a `SortGhost` for the outgoing animation, and `position` advances.
4. An "undo" gesture (while `canUndo == true`) calls `UndoSortActionUseCase(itemId)` which delegates to `ClosetSortRepository.moveItemToPending(itemId)`, then decrements `position`.
5. On the Pending page, `CheckSortAutoLaunchUseCase(threshold = AUTO_LAUNCH_THRESHOLD)` decides whether to auto-open the sort game. `GetPendingSortCountUseCase` feeds any pending-count badge.

## Dependencies

- **Own**: none yet — no repository implementation, no `Component`, no API client.
- **Core**: `com.otiasj.core.domain.model.PaginatedResult` (for `fetchPendingBatch`), `com.otiasj.core.domain.model.safeCall` (wraps every use case).
- **Cross-feature**: none in code, but the domain overlaps semantically with `features/mycloset/` (archive/keep/list actions on `MyItem`) and `features/pending/` (the `AUTO_LAUNCH_THRESHOLD` trigger surface). A future implementation should decide whether to reuse `features.shared.revivle.itemactions` use cases instead of duplicating them here.
- **Compose Resources**: none — no UI-visible strings defined yet.
- **Navigation**: none — no route registered.

## Known Issues / Drift

- **Feature is a scaffold, not a shipping feature.** Only the domain layer exists — no `data/repository/ClosetSortRepositoryImpl`, no `ClosetSortComponent`, no `ui/` package, no `@Serializable` route, no `AppPlugin` wiring, no `commonTest` coverage. Nothing outside `features/closetsort/` references it (grep for `ClosetSort` / `closetsort` returns only self-references). Trying to run the sort game today would compile but be unreachable.
- **`CheckSortAutoLaunchUseCase` has no caller.** The pending page (`features/pending/`) does not import it, so the intended auto-launch trigger is dead code until the pending ViewModel is updated.
- **Every use case double-wraps `safeCall`.** The repository methods already return `Result<T>`; each use case then wraps them again in `safeCall { repository.xxx(...).getOrThrow() }`. This is the same drift called out in `template.md` and should be resolved (either drop `safeCall` from the use cases or return raw values from the repository) before the feature is fleshed out.
- **`ListSortItemUseCase` exposes two overloads for the same call.** Both `invoke(params: SortListItemParams)` and `invoke(itemId, salePrice, requestImageEnhancement)` exist; the second just constructs the params and delegates. Pick one at the call-site convention level once a UI lands, and drop the other.
- **`SortGameState.isFinished` requires `deck.isNotEmpty()`.** The initial empty deck is not "finished" — this is intentional to distinguish "not yet loaded" from "swiped through everything", but a future UI must render Loading/Empty/Finished as three distinct states, not two.
- **Domain overlap with `features.shared.revivle.itemactions`.** `mycloset` already uses shared archive/keep/list use cases against `MyItem`. Introducing parallel `ClosetSortItem`-based use cases risks divergence; a data-layer decision (map `MyItem` ↔ `ClosetSortItem`, or promote a shared item type) is deferred but load-bearing.

## Tests

No tests yet. The feature would need at least a `FakeClosetSortRepository` in `commonTest`, per-use-case tests (7 use cases, each a one-line `safeCall` delegate), and — once a ViewModel exists — a `SortGameState` transition test covering deck load, prefetch at `PREFETCH_THRESHOLD`, each `SortSwipeDirection` commit, undo, and the `MAX_EMPTY_BATCHES` exhaustion path.

## See Also

- [pending](pending.md) — surface that owns the "auto-launch when pending ≥ 5" trigger `CheckSortAutoLaunchUseCase` is designed for
- [mycloset](mycloset.md) — shares the archive / keep / list-for-sale action vocabulary against `MyItem`; the closet-sort port must reconcile with the shared item-actions use cases
- [template](template.md) — canonical shape a future `ClosetSortComponent` / `ClosetSortPane` / `ClosetSortContent` should follow
- [itemdetail](itemdetail.md) — sibling target for the UP (add-images) gesture's image-management flow

_Last updated: 2026-08-01 — Initial page for the scaffolded domain layer (PR #1302). No data, UI, wiring, or tests exist yet._
