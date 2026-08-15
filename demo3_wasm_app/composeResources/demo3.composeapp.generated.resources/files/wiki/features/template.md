---
type: feature
title: Template
description: Canonical blank feature scaffold that new features are copied from, demonstrating
  the full Clean Architecture and DI conventions for Demo3. Now includes checklist,
  search, sort, deletion, and an iOS native SwiftUI bridge.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/template/]
tags: [demo3, feature, template]
timestamp: '2026-08-10T00:00:00Z'
last_commit: f07ac24224b8bb6a150b46420a259f287e23077e
category: feature
---

# Template

## Purpose
Canonical blank feature scaffold that new features are copied from, demonstrating the full Clean Architecture and DI conventions for Demo3.

Location: `features/template/`

## Responsibility

Serves as the authoritative reference implementation for all new features. It demonstrates: manual DI via a `Component` class, the repository interface/implementation split, use-case encapsulation of business logic, sealed-interface UI state, a `ViewModel` extending the core base class, Compose screens with `@Preview` annotations, Kotlin Resources for strings, and Material Design 3 components. It is not a user-facing feature; it exists to be copied and renamed.

## Route & Entry Point

```kotlin
@Serializable
object TemplateRoute

fun NavGraphBuilder.templateRoute(onNavigateBack, contentPadding)   // ~5-line adapter over TemplatePane
fun NavController.navigateToTemplate()

// Three-layer pane contract (canonical pattern for all new features):
// templateRoute() → TemplatePane(id, contentPadding, onClose, ...) → TemplateContent(state, onEvent)
@Composable
fun TemplatePane(contentPadding, onClose, ...)
```

The template now ships the **route/pane/content split** as the canonical pattern. `templateRoute()` is a ~5-line adapter that delegates to `TemplatePane()`. `TemplatePane` owns VM resolution and loading effects, accepts `onClose` and outbound navigation callbacks instead of a `NavController`, and is embeddable as a pane inside `AdaptiveThreePaneLayout` without modification. `TemplateContent` is stateless and previewable. See `README.md` in the template for full usage guidance.

**Pane contract rules (enforced as "ALWAYS" in `CONVENTIONS.md`):**
- `XxxPane` must never accept a `NavController` parameter or call `navController.navigate(...)`.
- `XxxPane` must never accept `showCloseIcon: Boolean` — read `LocalPaneMode` instead.
- `XxxPane` must own its VM via `DiProvider.getComponent(...)` and a `LaunchedEffect(id)` for loading.
- `XxxRoute` must be a ~5-line adapter that delegates to `XxxPane`.

## Key Types

| Type | Description |
|------|-------------|
| `TemplateComponent` | DI container; lazily creates `TemplateRepositoryImpl`, `GetTemplateItemsUseCase`, and `TemplateViewModel` |
| `TemplateViewModel` | Extends core `ViewModel<TemplateUiState>`; exposes `loadItems()`, `refresh()`, `selectItem(id)`, `clearSelection()`, `deleteItem(id)`, `toggleItemCompletion(id)`, `updateSearchQuery(query)`, `updateSortOrder(SortOrder)` |
| `TemplateRepository` | Interface: `getItems()`, `getItemById(id)`, `createItem(item)`, `updateItem(item)`, `deleteItem(id)` |
| `TemplateRepositoryImpl` | Mock implementation backed by an in-memory `mutableListOf`; supports full CRUD with simulated delays |
| `GetTemplateItemsUseCase` | `invoke(): Result<List<TemplateItem>>`; wraps `repository.getItems()` in `safeCall` |
| `SortOrder` | Enum: `DATE_DESC`, `DATE_ASC`, `TITLE_ASC`, `TITLE_DESC` |
| `TemplateUiState` | Sealed interface: `Loading`, `Empty` (first-class, not just an empty `Success`), `Success(items, filteredItems, isRefreshing, selectedItem, searchQuery, sortBy)`, `Error(error, message)` |
| `TemplateItem` | Domain model: `id: String`, `title: String`, `description: String`, `isCompleted: Boolean = false`, `createdAt: Long` (defaults to `TimeUtils.now()`) |
| `TemplateItemUiModel` | UI projection of `TemplateItem` with an added `isSelected: Boolean`; produced by `TemplateItem.toUiModel()` |
| `TemplateComponent` (composable) | `ui/components/TemplateComponent.kt`; renders an item row with checkbox, selection, delete action |
| `IOSTemplateScreenBridge` | (`iosMain`) Kotlin/Swift bridge. Subscribes to `TemplateViewModel.uiState` and forwards state changes to an `IOSTemplateScreenDelegate`. Exposes `refresh()`, `selectItem()`, `toggleItemCompletion()`, `deleteItem()`, `updateSearchQuery()`, `updateSortOrder()` to Swift callers. |
| `NativeScreen` | (`platform/nativescreen/`) KMP expect/actual. On iOS, delegates to the registered native SwiftUI screen by `screenName`; on Android/Desktop/wasmJs, renders the `fallback` Compose composable. |

## Architecture

```
template/
├── TemplateComponent.kt                      # Manual DI
├── data/repository/
│   └── TemplateRepositoryImpl.kt             # In-memory CRUD mock
├── domain/
│   ├── model/TemplateItem.kt                 # Domain model
│   ├── repository/TemplateRepository.kt      # Interface (5 methods)
│   └── usecase/
│       └── GetTemplateItemsUseCase.kt
└── ui/
    ├── components/
    │   └── TemplateItemCard.kt               # Reusable card composable
    ├── TemplateScreen.kt                     # Route adapter (~5 lines) + nav extensions
    ├── TemplatePane.kt                       # Pane composable (owns VM + load effect, embeddable)
    ├── TemplateContent.kt                    # Stateless content + @Preview
    ├── TemplateUiState.kt                    # Sealed states + TemplateItemUiModel + mapper
    └── TemplateViewModel.kt
    └── README.md                             # Three-layer split usage guide
```

`TemplateComponent` documents the full pattern for API-backed features in KDoc, including how to wire `AuthTokenProvider`, `LoggingHttpClient`, and a Ktorfit API interface.

## Data Flow

1. `templateRoute` calls `viewModel.loadItems()` inside `LaunchedEffect(Unit)`.
2. State transitions to `TemplateUiState.Loading`.
3. `GetTemplateItemsUseCase` calls `repository.getItems()` (500 ms simulated delay).
4. On success with items → `TemplateUiState.Success(items, filteredItems = items, ...)`; on empty list → `TemplateUiState.Empty`; on failure → `TemplateUiState.Error(...)`.
5. `refresh()` sets `isRefreshing = true` on the current `Success` state, then re-fetches, preserving `searchQuery` and `sortBy`.
6. `selectItem(id)` finds the item in the current `Success.items` list and sets `selectedItem`; fires `AnalyticsEvent("template_item_selected", {"item_id": id})`.
7. `updateSearchQuery(query)` / `updateSortOrder(sortOrder)` both call the internal `filterAndSort(items, query, sortBy)` — first filters by lowercased title/description, then sorts by the `SortOrder` variant.
8. `deleteItem(id)` removes from `Success.items`; if the list becomes empty, transitions to `Empty`.
9. `toggleItemCompletion(id)` copies the updated `isCompleted` flag and re-applies the current filter/sort.
10. On iOS, `IOSTemplateScreenBridge` collects `uiState` via a coroutine launched in its own `CoroutineScope(SupervisorJob() + Dispatchers.Main)` and calls `delegate.onStateChanged(state)` on each emission. The `NativeScreen` composable in `TemplateScreen.kt` routes the `"template"` screen name to the SwiftUI implementation wired in `iOSApp.swift`.

## Dependencies

- **Core**: `DiProvider`, `AnalyticsModule`, `AnalyticsManager`, `safeCall`, `Error.UnknownError`, `TimeUtils`
- **Core UI**: `AppScaffold`, `FullScreenLoading`, `EmptyState`, `ErrorState`
- **Compose Resources**: `template_screen_title`, `template_empty_state`, `template_error_message` (from `composeResources/values/strings.xml`)
- **Navigation**: `androidx.navigation`, `kotlinx.serialization`
- No cross-feature imports.

## Known Issues / Drift

- **`MyFeatureComponent` / `MyFeatureViewModel` in README**: Placeholder names in the README usage guide don't correspond to real classes, which is intentional for a scaffold but can be confusing when reading in isolation.
- **`GetTemplateItemsUseCase` double-wraps `safeCall`**: Calls `safeCall { repository.getItems() }` where `getItems()` already returns a `Result`. Redundant nested try/catch.
- **`TemplateRepository` interface declares CRUD but `createItem`/`updateItem` are not exercised by the ViewModel**: These exist on the interface and mock but are dead surface area for copiers.
- **`TemplateItemUiModel` is defined but the screen renders `TemplateItem` directly**: `TemplateItem.toUiModel()` is dead code.
- **iOS bridge scope leak**: `IOSTemplateScreenBridge` creates a `CoroutineScope(SupervisorJob())` that is never cancelled — if the bridge is re-created (e.g. on view re-use), the old scope leaks.

## Tests

| File | What it tests |
|------|---------------|
| `ui/TemplateViewModelTest.kt` | `Loading` → `Success` / `Empty`, refresh (no reset to Loading), item selection + analytics, error path, `deleteItem` (list→Empty transition), `toggleItemCompletion`, `updateSearchQuery` filter, `updateSortOrder` all four variants. Extended in 2026-08-10 to cover the new ViewModel surface. |
| `domain/repository/FakeTemplateRepository.kt` | In-memory stub implementing `TemplateRepository` for test isolation. |
| `domain/usecase/GetTemplateItemsUseCaseTest.kt` | `GetTemplateItemsUseCase` delegates to repository and propagates results correctly. |
| `desktopTest/TemplateVisualDiffTest.kt` | Desktop screenshot regression test for the Template screen UI. |

## See Also

- [review](review.md) — feature built from this template; shows a real (though still mocked) domain
- [linear](linear.md) — counter-example: does not follow this template's patterns
- `docs/new_feature_template_agent.md` — agent workflow for scaffolding from this template

_Last updated: 2026-08-10 — Added checklist checkboxes (`isCompleted`), search, sort (`SortOrder`), deletion, `Empty` as first-class state, and iOS native SwiftUI bridge (`IOSTemplateScreenBridge` + `NativeScreen` expect/actual). `TemplateViewModelTest` extended to cover new surface._
