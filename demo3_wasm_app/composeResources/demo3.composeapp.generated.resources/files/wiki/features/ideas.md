---
type: feature
title: Ideas
description: Standalone Linear-issue browser with its own domain model, ViewModel,
  and use-case layer.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/ideas/]
tags: [demo3, feature, ideas]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Ideas

## Purpose
Standalone Linear-issue browser with its own domain model, ViewModel, and use-case layer. Previously a thin orchestration shim over `LinearScreen`; now a first-class feature with self-contained state management (#665).

Location: `features/ideas/`

## Responsibility

Provides a two-pane view (left: issue list, right: session/start-session pane) for browsing Linear issues, creating new ones, filtering/sorting by custom status and assignee, and launching Jules AI sessions. Owns its own domain models, repository, and ViewModel — it no longer directly renders `LinearScreen` as its left pane.

Also exports standalone composables `CreateIdeaDialog` and `IdeaContent` consumed by `features/tasklist/`.

## Route & Entry Point

```kotlin
@Serializable
object IdeasRoute

fun NavGraphBuilder.ideasScreenRoute(
    onNavigateToJulesSession, onNavigateToStartSession, onNavigateToJulesArtifacts,
    onNavigateToReviewPr, onSessionStarted, onNavigateBack, contentPadding
)
```

`IdeasRouter.kt` — registered via `composable<IdeasRoute>`. Both `ideasScreenRoute` and `ideasStartSessionRoute` now take outbound callbacks instead of a `NavController`, making them nav-graph-agnostic.

The router creates an `IdeasViewModel` via `component.getIdeasViewModel()` and passes it to `IdeasScreen`. Uses `AdaptiveThreePaneLayout` (three panes: idea list / Jules session or start-session pane / PR review pane). On Medium/Expanded, `onNavigateToReviewPr` sets local `selectedPrUrl` state; on Compact it forwards to the route callback. Pane 3 visibility is gated on both `selectedPrUrl != null` and `activeSessionId != null` to prevent stale PR panes appearing during idea selection. `LaunchedEffect(activeSessionId)` clears `selectedPrUrl` when the active session changes.

## Key Types

| Type | Description |
|------|-------------|
| `IdeasRoute` | `@Serializable object` navigation route |
| `IdeasComponent` | DI component; owns repository, use cases, and ViewModel factory |
| `IdeasViewModel` | Main VM; extends `androidx.lifecycle.ViewModel` directly |
| `IdeasUiState` | Plain `data class` with `ideas`, `filters`, `teams`, pagination fields |
| `IdeasFilters` | `@Serializable data class`: `status: Set<CustomTicketStatus>`, `assignee: String?`, `search: String?` |
| `Idea` | Domain model for a Linear issue (see below) |
| `CustomTicketStatus` | Enum: `PLANNING`, `CREATING`, `REVIEW`, `DONE`, `CANCELLED` |
| `IdeaAssignee` | `data class(id, name, avatarUrl?)` |
| `IdeaPriority` | Enum: `URGENT`, `HIGH`, `MEDIUM`, `LOW`, `NONE` |
| `IdeaTeam` | `data class(id, name)` |
| `IdeasPage` | Paginated result: `nodes: List<Idea>`, `hasNextPage`, `endCursor?` |
| `LinearIdeaRepository` | `IdeaRepository` implementation backed by `LinearRepository` |
| `GetIdeasUseCase` | Fetches paginated `IdeasPage` from repository |
| `CreateIdeaUseCase` | Creates a new Linear issue; returns `Idea?` |
| `GetTeamsUseCase` | Fetches `List<IdeaTeam>` for the create-idea dialog |
| `UpdateIdeaUseCase` | Updates a Linear issue's `status` and/or `priority`; returns the updated `Idea?` |
| `GetIdeaLinksUseCase` | Fetches a single `Idea` by id and returns `IdeaLinks?` via `toLinks()` |
| `OnPrMergedUseCase` | Updates Linear state when a PR merges (called externally) |
| `IdeasOrchestrator` | Domain orchestrator: creates Jules sessions, attaches them to Linear issues, transitions issue state |
| `IssueTracker` (interface) | `attachSession`, `markInProgress`, `markDone` |
| `LinearIssueTracker` | `IssueTracker` implementation via `LinearRepository` |
| `CreateIdeaDialog` | Exported composable: team picker + title/description fields |
| `IdeaContent` | Exported composable: renders a `LinearIssueUiModel` with session state |

## Domain Models

### `Idea`

```kotlin
data class Idea(
    val id: String,
    val identifier: String,          // e.g. "ENG-42"
    val title: String,
    val description: String? = null,
    val assignee: IdeaAssignee? = null,
    val priority: IdeaPriority = IdeaPriority.NONE,
    val status: CustomTicketStatus = CustomTicketStatus.PLANNING,
    val hasActiveSession: Boolean = false,
    val hasActiveReview: Boolean = false,
    val url: String? = null,
    val activeSessionUrl: String? = null,
    val activeReviewUrl: String? = null  // PR URL when a review is active
)
```

`CustomTicketStatus` replaces the previous string-based `statusType`/`statusName` fields from `Idea.Categorized`. The repository maps Linear's `state.type` and `state.name` to this enum.

### `IdeaLinks` / `IdeaLinksRow`

`IdeaLinks` aggregates the three outbound links for an idea:

```kotlin
data class IdeaLinks(
    val linear: LinearLink,           // always present — the Linear issue
    val julesSession: JulesSessionLink?,  // present when activeSessionUrl != null
    val review: ReviewLink?,          // present when activeReviewUrl != null
)
```

`Idea.toLinks()` is the factory extension. `GetIdeaLinksUseCase(ideaId)` fetches the idea then calls `toLinks()`.

`IdeaLinksRow` is a row composable rendered in the ideas list: shows a Linear icon chip, an optional Jules-session chip (play icon), and an optional PR/review chip (branch icon). Each chip is clickable and triggers the corresponding `onLinearClick` / `onSessionClick` / `onReviewClick` callback.

### `IdeasSecondPane`

Sealed interface controlling the right pane in the three-pane layout:

```kotlin
sealed interface IdeasSecondPane {
    data class LinearDetail(val issue: LinearIssueUiModel) : IdeasSecondPane
    data class JulesSession(val sessionId: String, val title: String?) : IdeasSecondPane
    data class StartSession(val issue: LinearIssueUiModel) : IdeasSecondPane
}
```

`IdeasRouter` selects which pane to show based on user interaction in the list. `LinearDetail` is shown when an idea with no active session is tapped; `StartSession` when the user wants to launch a new session; `JulesSession` when an active session is selected.

### `CustomTicketStatus` mapping

| Linear state | `CustomTicketStatus` |
|---|---|
| `backlog`, `unstarted` | `PLANNING` |
| `started` / "in progress" / "creating" | `CREATING` |
| "review" / "code review" / "screen review" | `REVIEW` |
| `completed` / "done" / "merge" | `DONE` |
| `cancelled` / "archived" | `CANCELLED` |

## `IdeasViewModel`

Extends `androidx.lifecycle.ViewModel` (not `core.ui.ViewModel<T>`). Owns a single `MutableStateFlow<IdeasUiState>`.

```kotlin
class IdeasViewModel(
    private val getIdeasUseCase: GetIdeasUseCase,
    private val createIdeaUseCase: CreateIdeaUseCase,
    private val getTeamsUseCase: GetTeamsUseCase,
    private val updateIdeaUseCase: UpdateIdeaUseCase,
    private val localDataSource: LocalDataSource
) : ViewModel()
```

Key operations: `loadIdeas()`, `loadMoreIdeas()` (cursor pagination), `updateFilters(IdeasFilters)` (persisted to `LocalDataSource` under key `"ideas_filters"`), `createIdea(teamId, title, description?)`, `updateIdeaStatus(ideaId, status)`, `updateIdeaPriority(ideaId, priority)`.

`updateIdeaStatus` and `updateIdeaPriority` both call `updateIdeaUseCase` and patch the `_uiState.ideas` list in-place with the returned `Idea`; failures are silently swallowed (no error state emitted).

### `IdeasUiState` computed properties

- **`filteredIdeas`** — applies search, status, and assignee filters; sorts by `status.ordinal` then descending `id`.
- **`availableStatuses`** — `List<FilterOptionUiModel>` with per-status counts.
- **`availableAssignees`** — `List<FilterOptionUiModel>` + an `"Unassigned"` entry when at least one idea has no assignee.

Filter state is serialized to JSON and persisted via `LocalDataSource` so filter selections survive navigation.

## Architecture

```
IdeasRouter  [callback-based, no NavController]
  → IdeasScreen(viewModel: IdeasViewModel)
      → IdeasViewModel
          → GetIdeasUseCase → LinearIdeaRepository → LinearRepository (GraphQL)
          → CreateIdeaUseCase
          → GetTeamsUseCase
          → LocalDataSource (filter persistence)

  [Right pane — unchanged]
  → StartSessionPane → IdeasOrchestrator
      → LinearIssueTracker (LinearRepository)
      → JulesComponent (session creation)
```

`IdeasComponent` wires everything:

```kotlin
class IdeasComponent {
    private val ideaRepository by lazy { LinearIdeaRepository(linearComponent.repository) }
    val getIdeasUseCase by lazy { GetIdeasUseCase(ideaRepository) }
    val createIdeaUseCase by lazy { CreateIdeaUseCase(ideaRepository) }
    val getTeamsUseCase by lazy { GetTeamsUseCase(ideaRepository) }
    fun getIdeasViewModel(): IdeasViewModel = IdeasViewModel(
        getIdeasUseCase, createIdeaUseCase, getTeamsUseCase, updateIdeaUseCase, createLocalDataSource()
    )
}
```

## UI Layer Structure

`IdeasScreen` was refactored to delegate to extracted sub-composables in `ui/components/`:

- **`IdeasFilterRow`** (`ui/components/IdeasFilterRow.kt`) — `LazyRow` filter strip for status, assignee, and search. Internal chip and dialog-wrapper composables split into private helpers: `IdeasStatusFilterChip`, `IdeasAssigneeFilterChip`, `IdeasStatusFilterDialogWrapper`, `IdeasAssigneeFilterDialogWrapper`.
- **`IdeaItem`** (`ui/components/IdeaItem.kt`) — card composable for a single `Idea`. Extracted from the previously inlined body in `IdeasScreen` to fix oversized-composable lint.
- **`IdeasList`** (`ui/components/IdeasList.kt`) — paginated `LazyColumn` with `PullToRefreshBox`, load-more trigger, and status-grouped headers. Used via the `IdeasListContent` entry-point composable.

## Reusable UI Components

`CreateIdeaDialog` and `IdeaContent` are standalone composables exported from this feature's `ui/` package and imported by `features/tasklist/`:

- **`CreateIdeaDialog`** — `AlertDialog` with team picker (dropdown if >1 team), title field, optional description. Confirm disabled until team + title filled.
- **`IdeaContent`** — renders a Linear issue card alongside session state; signature: `IdeaContent(issue: LinearIssueUiModel, sessions, onStartSession, onSessionClick, onRemoveLabel, modifier)`. Shows a `CircularProgressIndicator` (16dp, 2dp stroke) as a trailing icon on the issue card while any session is `IN_PROGRESS` or `QUEUED`. `onRemoveLabel` is forwarded to `IssueItem` so label chips can be removed inline.

## Dependencies

- **Own**: `LinearIdeaRepository` → `LinearRepository` (from `LinearComponent`)
- **DI**: `IdeasComponent` takes `LinearComponent` and `JulesComponent` via `DiProvider`
- **Exports to**: `features/tasklist/` (`CreateIdeaDialog`, `IdeaContent`)

## Known Issues / Drift

- `IdeasViewModel` extends `androidx.lifecycle.ViewModel` directly instead of `core.ui.ViewModel<T>` — no shared analytics or offline flag.
- `IdeasOrchestrator` still exists for the Jules session-start flow but its `onPrMerged` path appears unused.
- Filter persistence writes to `LocalDataSource` synchronously (via non-suspend `get`/`save`); this is fine for small JSON payloads but bypasses the coroutine conventions used elsewhere.

## AI Tools

`IdeasComponent.tools` exposes 4 tools via `commonFeatureTools()`:

| Tool | Class | Write? | Description |
|------|-------|--------|-------------|
| `list_ideas` | `ListIdeasTool` | No | Lists Linear ideas/issues with optional filter |
| `list_idea_teams` | `ListIdeaTeamsTool` | No | Lists available Linear teams for idea creation |
| `create_idea` | `CreateIdeaTool` | Yes | Creates a new Linear issue; args: `teamId`, `title`, `description?` |
| `update_idea` | `UpdateIdeaTool` | Yes | Updates an existing idea's `status` or `priority` by id |

Write tools set `requiresConfirmation = true`. All tools are thin wrappers over the existing use cases in `IdeasComponent`.

## See Also

- [jules](jules.md) — AI session feature used in the right pane
- [linear](linear.md) — GraphQL backend for issue data
- [tasklist](tasklist.md) — imports `CreateIdeaDialog` and `IdeaContent`
- [demo3-ailift.md](../ailift.md) — broader AIlift system context

## Tests (`commonTest`)

| Test file | Coverage |
|---|---|
| `domain/IdeasOrchestratorTest.kt` | `IdeasOrchestrator.getSources()` success and failure paths; uses `FakeJulesRepository` + `FakeIssueTracker`. |
| `domain/usecase/IdeaUseCasesTest.kt` | Domain use case unit tests (create, get, teams). |
| `tools/IdeaToolsTest.kt` | Unit tests for all 4 AI tools (success + error + not-found paths). |
| `IdeasViewModelTest.kt` | `IdeasViewModel` state transitions; uses updated use cases. |

_Last updated: 2026-06-19 — Added 4 AI tools (`list_ideas`, `list_idea_teams`, `create_idea`, `update_idea`) in `features/ideas/tools/`, registered via `IdeasComponent.tools` and `commonFeatureTools()`._
_Previous: 2026-06-15 — `IdeasScreen` refactored: `IdeaItem`, `IdeasFilterRow`, and `IdeasList` extracted to `ui/components/`._
_Last updated: 2026-06-05 — `UpdateIdeaUseCase` added; `IdeasViewModel` gains `updateIdeaStatus`/`updateIdeaPriority`; `IdeaContent` shows in-progress spinner and forwards `onRemoveLabel`._
_Last updated: 2026-06-03 — Domain unit tests added: `IdeasOrchestratorTest` and `IdeaUseCasesTest`._
