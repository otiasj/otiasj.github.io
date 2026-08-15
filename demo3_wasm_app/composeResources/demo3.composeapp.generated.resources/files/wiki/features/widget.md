---
type: feature
title: Widget
description: Server-driven UI renderer that displays a scrollable list of pre-built
  and dynamically stored widgets, with a built-in editor for composing custom widget
  trees from primitive node types.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/widget/]
tags: [demo3, feature, widget]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Widget

## Purpose
Server-driven UI renderer that displays a scrollable list of pre-built and dynamically stored widgets, with a built-in editor for composing custom widget trees from primitive node types.

Location: `features/widget/`

## Responsibility

Two distinct concerns in one feature:

1. **Widget list screen** — renders a fixed set of hardcoded health/activity widgets (hydration, sleep, screen time, weekly recap) alongside user-saved `WidgetEntity` records rendered through `WidgetRenderer`. Long-press on a dynamic widget opens the editor.
2. **Widget editor** (`editor/` sub-package) — lets the user inspect and mutate the `UINode` tree of a single widget: select nodes, add child nodes by type, remove nodes, and preview the result live. Properties and content panels slide in on wider screens.

## Route & Entry Point

### List screen
- Route object: `Widgets` (`@Serializable object Widgets`)
- Navigation helper: `NavController.navigateToWidgetScreen()`
- Graph registration: `NavGraphBuilder.widgetScreenRoute(onNavigateToEditWidget, contentPadding)`
- Entry composable: `WidgetScreen(state, onWidgetClicked, onWidgetLongClicked)`

### Editor screen
- Route object: `WidgetId` (used directly as a nav route — `@Serializable`)
- Navigation helper: `NavController.navigateToWidgetEditorScreen(widgetId: WidgetId)`
- Graph registration: `NavGraphBuilder.widgetEditorScreenRoute(onNavigateBack, contentPadding)`
- Entry composable: `WidgetEditorScreen(treeItems, content, properties, selectedWidgetId, ...)`

## Key Types

| Type | Role |
|---|---|
| `WidgetComponent` | DI component; owns a single `WidgetRepository` and vends both ViewModels |
| `WidgetScreenViewModel` | Loads all `WidgetEntity` records from `WidgetRepository` into `WidgetUIState.widgets` |
| `WidgetUIState` | Data class: `isLoading`, `widgets: List<WidgetEntity>`, `errorMessage` |
| `WidgetEditorScreenViewModel` | Owns mutable `UINode` tree; exposes `flattenedWidgetTree: StateFlow<List<FlattenNodes>>` and `selectedWidgetId`; handles add/remove/replace node operations |
| `WidgetEditorUIState` | Data class: `entity: WidgetEntity`, `selectedWidgetId: String?` |
| `UINodeType` | Enum — `TEXT`, `ICON`, `IMAGE`, `COLUMN`, `ROW`, `CARD`; drives the add-child dropdown |
| `Icon` (in `WidgetIcons.kt`) | Reusable composable wrapping Material `Icon` with optional circular background and configurable tint/size |

## Architecture

Both ViewModels extend `com.otiasj.core.ui.ViewModel<S>` and are resolved at composition time via `DiProvider.getComponent(WidgetComponent::class)`. `WidgetComponent` is a plain class (no framework DI) that constructs a shared `WidgetRepository` and creates new ViewModel instances on demand.

`WidgetEditorScreenViewModel` manages the tree as an in-memory mutable structure: all mutations deep-copy the current `UINode` tree, apply the change, then call `updateState`. The flattened tree is derived via `flattenTree(root)` and re-emitted as a `StateFlow` using `SharingStarted.WhileSubscribed(5000)`.

The editor layout adapts to window size via `LocalWindowSize`: on `Expanded` and `Medium` windows, `PropertiesPanel` and `ContentPanel` are pinned open side-by-side; on `Compact`, they are toggled with animated horizontal visibility (`expandHorizontally` / `shrinkHorizontally`).

## Data Flow

### List screen
1. `WidgetScreenViewModel.init` → `widgetRepository.loadWidgets()` (Flow) → collects into `WidgetUIState.widgets`
2. `WidgetScreen` renders static composables first (`HydrationWidget`, `SleepScoreWidget`, `ScreenTime`, `WeeklyRecapWidget`), then iterates `state.widgets` and delegates each to `WidgetRenderer.render(node, content, properties)`
3. Long-press on a dynamic widget → `onWidgetLongClicked(WidgetEntity)` → caller navigates to `WidgetEditorScreen` passing `WidgetId`

### Editor screen
1. `WidgetEditorScreenViewModel.init` loads the widget by `WidgetId` from `widgetRepository.loadWidget(id)` and collects into `WidgetEditorUIState.entity`
2. `flattenedWidgetTree` maps `entity.widget` to a depth-annotated `List<FlattenNodes>` for the tree view
3. User taps a row → `selectChild(id)` toggles selection (highlights the row and reveals Add/Edit/Delete action buttons)
4. Add: dropdown picks a `UINodeType` → `addChild(parentId, type)` → factory function (`createTextNode`, `createRowNode`, etc.) → deep-copy + insert → `updateState`
5. Remove: `removeChild(nodeId)` → `removeNodeFromParent` recursive search → `updateState`; selection cleared
6. `WidgetPreview` re-renders `WidgetRenderer.render(node, content, properties, selectedWidgetId)` on every state change
7. `PropertiesPanel` / `ContentPanel` display raw map entries (key enumeration only — editing is stubbed)

## Dependencies

- `com.otiasj.platform.widget.*` — `WidgetRenderer`, `UINode`, `FlattenNodes`, `Properties`, `WidgetEntity`, `WidgetId`, `WidgetRepository`, `WidgetCard`, `ColumnWidget`, `TwoColumnWidget`, `HorizontalBarGraph`, `VerticalBarGraph`, `BigNumber`, `IconTextRow`, `BarSection`, `VerticalBarValue`
- `com.otiasj.platform.widget.dynamic.*` — `createTextNode`, `createIconNode`, `createImageNode`, `createColumnNode`, `createRowNode`, `createCardNode`, `createRootNode`, `flattenTree`
- `com.otiasj.core.di.DiProvider` — service locator for `WidgetComponent`
- `com.otiasj.core.ui.resizable.LocalWindowSize` / `WindowSize` — adaptive layout breakpoints
- `com.otiasj.core.ui.ViewModel` — base ViewModel with `updateState` and `currentState`

## Known Issues / Drift

- `PropertiesPanel` and `ContentPanel` enumerate keys but render placeholder text ("Property 0", "Content 0") — actual editing of widget properties and content is not implemented.
- `moveWidget` in `WidgetEditorScreenViewModel` is declared but has an empty body — drag-to-reorder is unfinished.
- The `Icon` wrapper in `WidgetIcons.kt` builds a `Modifier` chain but never assigns the intermediate results (`modifier.clip(shape)` and `modifier.background(...)` are discarded), so clipping and background have no effect.
- `WidgetScreenViewModel` uses an awkward `stateIn(...).collect()` pattern inside a `launch` block; the inner `StateFlow` is unnecessary and the `collect` will never return.
- Saved widgets are loaded from `WidgetRepository` but there is no visible save action in the editor — changes are held in-memory only.

## See Also

- `platform/widget/` — `WidgetRenderer`, `UINode` sealed hierarchy, `WidgetRepository`, layout primitives
- `platform/widget/dynamic/` — node factory functions and `flattenTree`
- `platform/widget/repository/` — `WidgetEntity`, `WidgetId`
- `core/ui/resizable/` — `LocalWindowSize`, `WindowSize`

_Last updated: 2026-04-22_
