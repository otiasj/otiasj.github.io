---
type: feature
title: Linear
description: 'Linear issue tracker integration: browse, filter, sort, create, and
  manage Linear issues with inline status/priority changes and a detail pane.'
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/linear/]
tags: [demo3, feature, linear]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Linear

## Purpose
Linear issue tracker integration: browse, filter, sort, create, and manage Linear issues with inline status/priority changes and a detail pane.

Location: `features/linear/`

## Responsibility

Owns the full Linear issue management experience: listing issues with client-side filtering (status, assignee, search, sort), creating new issues, updating issue status and priority, managing attachments and labels, viewing issue details, and a two-pane master-detail layout. Does NOT own Jules session orchestration (that belongs to `ideas`) or shared AI-lift UI components.

## Route & Entry Point

```kotlin
@Serializable
object LinearRoute

fun NavGraphBuilder.linearScreenRoute(onNavigateBack, contentPadding)
```

Navigation helper: `NavController.navigateToLinear()`.

The `LinearScreen` composable can also be used standalone (embedded by the `ideas` feature with custom `onIssueClick` and `issueTrailingIcon` slots).

## Key Types

| Type | Description |
|------|-------------|
| `LinearComponent` | DI component; creates auth provider, API, repository, and ViewModel factories |
| `LinearAuthTokenProvider` | **Feature-specific auth**: reads `LINEAR_API_KEY` from Clerk unsafe metadata |
| `LinearApi` | Ktorfit-generated interface; all operations are GraphQL `POST /graphql` calls (includes `deleteIssue`) |
| `LinearRepository` / `LinearRepositoryImpl` | Interface + implementation for issues, teams, attachments, labels, viewer; `deleteIssue(issueId): Boolean` added |
| `IssueDeletePayload` / `IssueDeleteResponse` | Serializable response models for the `issueDelete` GraphQL mutation |
| `LinearViewModel` | Manages issue list, pagination, filtering, sorting, CRUD operations |
| `LinearDetailViewModel` | (referenced in component) Manages single-issue detail editing |
| `LinearUiState` (data class) | Holds `issues`, `filters`, `teams`, loading/error state; computes `filteredIssues`, `availableStatuses`, `availableAssignees` as derived properties |
| `LinearFilters` | `status: Set<String>`, `assignee: String?`, `sortBy`, `sortOrder`, `search` |
| `LinearIssueUiModel` | UI model with id, identifier, title, state, assignee, priority, labels, attachments, GitHub PR info |

### UI Components
`IssueItem`, `IssueChips`, `IssueSupportingContent`, `IssueTitleRow`, `SortFilterChip`, `CreateIssueDialog`

`GithubPrChip` and `AttachmentChip` now accept an optional `onClick: (() -> Unit)?` parameter. When provided it overrides the default `uriHandler.openUri(...)` tap — used by the issue detail pane to route PR links into the third pane (`LinearThirdPane.ReviewPr`) instead of the system browser. `IssueSupportingContent` exposes `onGithubPrClick` and `onAttachmentClick` slots that thread down to the chip's `onClick`.

`LinearIssueDetailScreen` was significantly redesigned: the `TopAppBar` title now shows status icon + priority icon + identifier (bold, primary colour) as an inline row, replacing the plain text title. `IssueSupportingContent` (labels, attachments, assignee, GitHub PR chips) moved to the bottom bar above the Save/Cancel buttons, rendered right-aligned. Confirmation dialogs switched from the shared `AlertDialogExample` to `AlertDialog` directly. All hardcoded strings are in `strings_linear.xml`.

`CreateIssueDialog` was extracted from `LinearScreen.kt` into its own file `components/CreateIssueDialog.kt` (#566). `IssueChips` and `IssueTitleRow` received accessibility improvements (#547): content descriptions added for assignee avatar, open-in-Linear icon, and priority/status icons; new strings added to `strings_linear.xml`.

## Architecture

### Layers
- **data/auth**: `LinearAuthTokenProvider` -- reads API key from Clerk unsafe metadata
- **data/remote**: `LinearApi` (Ktorfit interface) -- all calls are GraphQL mutations/queries
- **data/model**: `LinearModels` -- API response types (`LinearIssue`, `LinearState`, `IssueConnection`, etc.)
- **data/repository**: `LinearRepositoryImpl`
- **domain/repository**: `LinearRepository` interface
- **domain/model**: `LinearFilters`, `LinearSortOption`, `LinearSortOrder`
- **ui**: `LinearViewModel`, `LinearScreen`, `LinearUiModels`, composable components

### DI
`LinearComponent` registered via `DiProvider`. Creates `LinearAuthTokenProvider` from `ClerkUnsafeMetadataDataSourceFactory`, builds the Ktorfit-based `LinearApi`, and exposes factory methods `getLinearViewModel()` and `getLinearDetailViewModel(...)`.

### Notable Patterns
- **Feature-specific authentication**: `LinearAuthTokenProvider` implements `AuthTokenProvider` by reading the `LINEAR_API_KEY` field from Clerk's unsafe metadata store. This is distinct from the app's main auth flow and allows per-user Linear API key configuration.
- **GraphQL via Ktorfit**: All API calls go through `POST /graphql` with `JsonObject` bodies. The API interface declares typed return types via Ktorfit's serialization support.
- **Client-side filtering and sorting**: `LinearUiState.filteredIssues` is a computed property that applies status, assignee, and search filters plus sort. No server-side filtering.
- **Cursor-based pagination**: `loadMoreIssues()` passes `nextCursor` from the previous response.
- **Composable slot API**: `LinearScreen` accepts `issueTrailingIcon` as a composable lambda, allowing the `ideas` feature to inject session indicators.
- **AdaptiveThreePaneLayout**: Route uses `AdaptiveThreePaneLayout` (replaces `TwoPaneLayout`). Pane 3 type is controlled by feature-local `sealed class LinearThirdPane { data class JulesSession(id, title); data class ReviewPr(prUrl) }`. `isThirdPaneActive = thirdPane != null && selectedIssue != null`. `LaunchedEffect(selectedIssue)` clears `thirdPane` when the user switches issues. On Compact, chip taps route via `NavController`; on Medium/Expanded they set `thirdPane` state. Pane-3 Jules sessions' `onNavigateToReviewPr` swaps `thirdPane` in-place to `ReviewPr`, keeping the user in pane 3.
- **Callback-based routing**: `linearScreenRoute` and `linearIssueDetailRoute` now take outbound callbacks (`onNavigateBack`, `onIssueModified`, `onNavigateToJulesSession`, `onNavigateToReviewPr`) instead of a `NavController`. Routes are nav-graph-agnostic; `HomeComponent` wires the callbacks.
- **`LinearThirdPane` sealed type**: Lives in the linear feature (`ui/LinearThirdPane.kt`), not in `core/ui/components/`. `extractJulesSessionId(url)` helper requires `jules.google` in the URL before extracting the session ID; non-Jules attachments fall through to `LocalUriHandler.openUri(...)`. `GithubPrChip` and `AttachmentChip` in `IssueChips.kt` now accept optional `onClick: (() -> Unit)? = null`, defaulting to URI open when null.

## Data Flow

1. `LinearViewModel.init` triggers `loadViewerId()`, `loadTeams()`, `loadIssues()` in parallel.
2. Issues fetched via `repository.getIssues()` (GraphQL query, 50 per page).
3. UI applies client-side filters via `LinearUiState.filteredIssues` computed property.
4. Filter chips (`SortFilterChip`, status, assignee, search) update `LinearFilters` via `updateFilters()`.
5. Inline actions: `updateIssueStatus()`, `updateIssuePriority()`, `deleteAttachment()`, `removeLabel()`, `unassignIssue()`, `deleteIssue()` each call repository and optimistically update local state.
6. `createIssue()` sends a mutation with team, title, description, priority, and assigns to current viewer.
7. **Multi-select actions**: `selectionActions` is computed from `dragSelectState` and `state.availableStateModels`. It dynamically generates one `ItemAction` per available status (sets status on all selected issues via `updateIssueStatus()`) plus a "Delete" action (calls `deleteIssue()` on each selected issue). Previously this list was static ("Unassign" only).

## Dependencies

- **Core**: `DiProvider`, `LoggingHttpClient`, `ClerkUnsafeMetadataDataSource`
- **Core UI**: `AdaptiveThreePaneLayout`, `SelectableFilterChip`, `SearchFilterField`, `GenericFilterDialog`, `EmptyState`, `ErrorState`, `InitialLoadingState`, `StatusIcon`
- **Shared**: `PriorityIcon` (from `features.shared.ailift`)
- **External**: Ktorfit (HTTP client code generation), `kotlinx.serialization`
- **No cross-feature imports**: Linear is self-contained. Other features (`ideas`) import from Linear, not the reverse.

## Known Issues / Drift

- **ViewModel does not extend core `ViewModel<T>`**: `LinearViewModel` extends `androidx.lifecycle.ViewModel` directly and manages state via a manual `MutableStateFlow<LinearUiState>`. This violates the project convention of using the core `ViewModel<T>` base class with `updateState {}`.
- **UiState is a data class, not sealed interface**: `LinearUiState` uses boolean flags (`isLoading`, `isLoadingMore`) and nullable `error` instead of the preferred sealed-interface pattern (`Loading`, `Content`, `Error`).
- **No DataSource layer**: `LinearRepositoryImpl` calls `LinearApi` directly without an intermediate `RemoteDataSource` abstraction.
- **Silent error swallowing**: Several methods (team loading, viewer ID, status/priority updates) catch exceptions silently with no user feedback.
- **GitHub PR detection via regex**: `LinearIssue.toUiModel()` extracts GitHub PR numbers from attachment URLs using regex. This is fragile.
- **No use cases**: The feature goes directly from ViewModel to Repository, skipping the use-case layer used in other features.

## Tests

`commonTest` coverage added in #419, extended in #501, and further extended in #524:

| File | What it tests |
|------|---------------|
| `data/repository/FakeLinearRepository.kt` | In-memory stub implementing `LinearRepository` for test isolation. |
| `ui/LinearViewModelTest.kt` | `LinearViewModel` state transitions: issue loading, status updates, team/member filtering. |
| `ui/LinearDetailViewModelTest.kt` | `LinearDetailViewModel` state transitions: issue detail loading, status/priority edits, attachment and label mutations. Uses `FakeLinearRepository` + Turbine; added in #432. |
| `data/remote/FakeLinearApi.kt` | Fake Ktorfit API implementation for testing the repository layer in isolation. |
| `data/repository/LinearRepositoryImplTest.kt` | Unit tests for `LinearRepositoryImpl` against `FakeLinearApi`; extended in #553 with additional edge cases for issue mutations and error propagation. |
| `LinearComponentTest.kt` | Component wiring smoke test. |
| `data/auth/FakeClerkUnsafeMetadataDataSource.kt` | Fake for `ClerkUnsafeMetadataDataSource` — simulates token read/write at the Clerk metadata layer (#524). |
| `data/auth/LinearAuthTokenProviderTest.kt` | Unit tests for `LinearAuthTokenProvider`: token fetch, caching, refresh-on-expiry, and error propagation (#524). |

## AI Tools

`LinearComponent.tools` exposes 5 tools via `commonFeatureTools()`:

| Tool | Class | Write? | Description |
|------|-------|--------|-------------|
| `list_linear_issues` | `ListLinearIssuesTool` | No | Lists issues with optional cursor for pagination |
| `get_linear_issue` | `GetLinearIssueTool` | No | Fetches a single issue by id |
| `list_linear_teams` | `ListLinearTeamsTool` | No | Lists available Linear teams |
| `create_linear_issue` | `CreateLinearIssueTool` | Yes | Creates a new issue; args: `teamId`, `title`, `description?`, `priority?` |
| `update_linear_issue` | `UpdateLinearIssueTool` | Yes | Updates title, description, stateId, or priority by id |

Write tools set `requiresConfirmation = true`. All tools delegate to `LinearRepository` via thin wrappers.

## See Also

- [ideas](ideas.md) -- orchestration feature that combines Linear issues with Jules sessions
- [jules](jules.md) -- AI coding assistant sessions
- [itemdetail](itemdetail.md) -- exemplary sealed-interface UiState pattern

_Last updated: 2026-07-06 — Added `deleteIssue` GraphQL mutation (`IssueDeletePayload`/`IssueDeleteResponse` models, `LinearApi.deleteIssue`, `LinearRepositoryImpl.deleteIssue`, `LinearRepository.deleteIssue`). Multi-select `selectionActions` now dynamically builds one status-change action per available status (`availableStateModels`) plus a "Delete" action, replacing the previous static "Unassign" action._
_Previous: 2026-06-19 — Added 5 AI tools (`list_linear_issues`, `get_linear_issue`, `list_linear_teams`, `create_linear_issue`, `update_linear_issue`) in `features/linear/tools/`; `LinearIssueDetailScreen` redesigned (status/priority in TopAppBar title, IssueSupportingContent moved to bottom bar)._
_Previous: 2026-06-01 — Migrated to `AdaptiveThreePaneLayout` (three-pane: issue list / detail / polymorphic Jules-session-or-PR-review). Feature-local `LinearThirdPane` sealed type. Both routes refactored to outbound callbacks. `showCloseIcon` removed from `LinearIssueDetailScreen` — reads `LocalPaneMode` instead. `GithubPrChip` and `AttachmentChip` gained optional `onClick` overrides; `IssueSupportingContent` exposes `onGithubPrClick`/`onAttachmentClick` slots. Fixed Dependencies: `AdaptiveThreePaneLayout` (not `TwoPaneLayout`)._
