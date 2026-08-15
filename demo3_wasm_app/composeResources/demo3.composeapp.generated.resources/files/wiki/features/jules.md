---
type: feature
title: Jules / CodingAgent
description: 'Multi-provider AI coding assistant integration: manages coding agent
  sessions (create, monitor, approve plans, send messages, view artifacts) through
  a provider-agnostic repository layer.'
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/jules/]
tags: [demo3, feature, jules]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Jules / CodingAgent

## Purpose
Multi-provider AI coding assistant integration: manages coding agent sessions (create, monitor, approve plans, send messages, view artifacts) through a provider-agnostic repository layer. Supports Google's hosted Jules service and the on-premise **Kobote** Claude agent running in the Demo3 desktop app.

Location: `features/jules/`

## Responsibility

Owns the full lifecycle of coding agent sessions: listing sessions on a dashboard, creating new sessions (with source/branch selection), viewing session detail with a real-time chat timeline, approving generated plans, sending messages, archiving sessions, checking PR merge status, and displaying code artifacts (unified diffs). The data layer (`features/jules/data/`) is split by provider: `JulesGoogleRepository` wraps the Google Jules API; `KoboteRepository` wraps the Kobote HTTP API on the desktop server. `CodingAgentRepositoryRouter` dispatches every use-case call to whichever backend the user has selected, keeping all use cases provider-unaware.

## Route & Entry Point

Three `@Serializable` route objects, each with a `NavGraphBuilder` extension:

```kotlin
@Serializable object JulesDashboardRoute
// NavGraphBuilder.julesDashboardRoute(onNavigateToSession, onNavigateToArtifacts, onNavigateToReviewPr, contentPadding)

@Serializable data class JulesSessionRoute(val sessionId: String, val title: String? = null)
// NavGraphBuilder.julesSessionRoute(onBack, onNavigateToArtifacts, contentPadding)

@Serializable data class JulesArtifactsRoute(val sessionId: String, val activityId: String)
// NavGraphBuilder.julesArtifactsRoute(onBack, contentPadding)
```

Navigation helpers: `NavController.navigateToJulesSession()`, `NavController.navigateToJulesArtifacts()`.

## Key Types

| Type | Description |
|------|-------------|
| `CodingAgentProvider` | Enum: `JULES_GOOGLE` (default) or `KOBOTE`. Stored as `settings_key = "coding_agent_provider"`. |
| `CodingAgentProviderRepository` | Reads/writes the active provider setting via DataStore. |
| `CodingAgentRepository` | Interface: all session operations (`getSessions`, `createSession`, `getSession`, `getActivities`, `sendMessage`, `approvePlan`, `cancelSession`, `deleteSession`, `listSources`). |
| `CodingAgentRepositoryRouter` | `CodingAgentRepository` impl that delegates to `julesGoogleRepository` or `koboteRepositoryProvider()` based on `CodingAgentProviderRepository.get()`. Fails fast with a clear error if Kobote is selected but no desktop address is configured. |
| `JulesGoogleRepository` | `CodingAgentRepository` adapter backed by the hosted Google Jules API via `JulesGoogleApi` + `safeCall`. |
| `KoboteRepository` | `CodingAgentRepository` adapter backed by `KoboteApi` (our on-desktop Claude agent). Mirrors `JulesGoogleRepository` one-for-one because both backends share the same wire contract. |
| `CodingAgentComponent` | DI component (was `JulesComponent`); wires both repositories, the router, all use cases, and dashboard/artifacts ViewModels. |
| `JulesDashboardViewModel` | Manages session list, pagination, tab filtering, sorting, search, auto-refresh (configurable interval, default 30s), session creation, batch archive. |
| `JulesSessionViewModel` | Manages a single session: polling (5s), chat activities, message sending, plan approval, archive, PR merge check. |
| `JulesArtifactsViewModel` | Loads artifacts (code diffs) for a specific activity within a session. |
| `JulesDashboardUiState` | Sealed interface: `Loading`, `Content(sessions, hasMore, tabs, sort, search)`, `Error`. |
| `JulesSessionUiState` | Sealed interface: `Loading`, `Content(session, activities, messageInput, prStatus)`, `Error`. |
| `JulesArtifactsUiState` | Sealed interface: `Loading`, `Content(artifacts, prUrl)`, `Error`. |
| `DashboardTab` (enum) | `OPEN`, `SCHEDULED`, `COMPLETED`, `ARCHIVED` — maps `SessionState` values to UI tabs. |
| `WorkflowModel` / `WorkflowStatus` | Domain models: `WorkflowActivity` (sealed class), `WorkflowOutput`, `WorkflowPlan`, `WorkflowStatus` (enum). |

### Use Cases (9 total)
`GetSessionsUseCase`, `GetSessionUseCase`, `GetSessionActivitiesUseCase`, `CreateSessionUseCase`, `SendMessageUseCase`, `ApprovePlanUseCase`, `ArchiveSessionUseCase`, `CancelSessionUseCase`, `CheckPrMergedUseCase`, `ListSourcesUseCase`

### UI Components
`SessionCard` (now uses `SelectableItemWrapper` for selection state; removed its own `SelectionIndicator`), `ChatBubble`, `ArtifactCard` (delegates per-file diff rows to `DiffFileRow` from `shared/ailift`), `ArtifactPreviewCard`, `BashOutputCard`, `MediaCard`, `JulesSortFilterChip`, `NewSessionDialog`

`JulesDashboardContentState` (`ui/dashboard/components/JulesDashboardContentState.kt`) — state-dispatch composable routing `JulesDashboardUiState` variants to `JulesDashboardLoading`, `JulesDashboardError`, `JulesDashboardContentGrid`, `JulesDashboardEmpty`, `JulesDashboardGrid`.

`JulesDashboardContent` — now uses `ResponsiveSelectionTopAppBar` + `ResponsiveSelectionBottomBar` (from `core/ui/components/`) for selection-mode chrome instead of the previous bespoke `JulesDashboardTopBar`. Selection action: Archive.

## Architecture

### Layers
- **data/**: `CodingAgentProviderRepository` (provider selection), `CodingAgentRepositoryRouter` (dispatcher)
- **data/repository**: `JulesGoogleRepository` (Google API) and `KoboteRepository` (desktop Kobote API)
- **data/datasource/remote**: `JulesGoogleApi`, `KoboteApi` (Ktorfit clients), `JulesGoogleAuthTokenProvider`, models shared across both backends
- **data/mapper**: `JulesMapper` converts API `Activity` to `ChatMessage` and provides formatting helpers
- **domain/repository**: `CodingAgentRepository` interface
- **domain/usecase**: 9+ single-responsibility use cases (all bound to `CodingAgentRepository`; provider-unaware)
- **domain/model**: `WorkflowModel`, `WorkflowStatus`, `CodingAgentProvider`
- **ui/dashboard**: `JulesDashboardScreen`, `JulesDashboardViewModel`, `JulesDashboardUiState`, `NewSessionDialog`, `JulesSortFilterChip`
- **ui/session**: `JulesSessionDetailScreen`, `JulesSessionViewModel`, `JulesSessionUiState`
- **ui/artifacts**: `JulesArtifactsScreen` (migrated to `AppScaffold`), `JulesArtifactsViewModel`, `JulesArtifactsUiState`
- **ui/components**: Shared composables (`SessionCard`, `ChatBubble`, `ArtifactCard`, etc.)

### DI
`CodingAgentComponent` registered via `DiProvider`. Creates `JulesGoogleAuthTokenProvider` + `GitHubAuthTokenProvider` (both from Clerk unsafe metadata), both API clients, both concrete repositories, the router, `CodingAgentProviderRepository`, all use cases, and ViewModels. `koboteRepositoryProvider` is a lazy lambda that reads the desktop address from `DesktopAddressRepository` and constructs a `KoboteRepository` on first use; returns `null` if no address is configured.

### `GitHubAPI` — endpoints available to the whole codebase

`GitHubAPI` lives in `features/jules/data/datasource/remote/` and is reused by `features/review/`. All endpoints are Ktorfit `@GET` declarations authenticated via `GitHubAuthTokenProvider`.

| Endpoint | Method | Returns |
|---|---|---|
| `user/repos?per_page=50&sort=updated` | `getRepositories()` | `List<GithubReviewRepo>` |
| `repos/{owner}/{repo}/pulls?state=open` | `getPullRequests(owner, repo)` | `List<GitHubPrSummary>` |
| `repos/{owner}/{repo}/pulls/{pullNumber}` | `getPullRequest(owner, repo, pullNumber)` | `GitHubPullRequest` |
| `repos/{owner}/{repo}/pulls/{pullNumber}/files` | `getPullRequestFiles(owner, repo, pullNumber)` | `List<GitHubFile>` |
| `repos/{owner}/{repo}/actions/runs?branch=…&per_page=N` | `getWorkflowRuns(owner, repo, branch, perPage)` | `GitHubWorkflowRunResponse` |
| `repos/{owner}/{repo}/actions/runs/{runId}/artifacts` | `getRunArtifacts(owner, repo, runId)` | `GitHubArtifactResponse` |
| `repos/{owner}/{repo}/pulls/{pullNumber}/merge` | `mergePullRequest(owner, repo, pullNumber, body)` | `GitHubMergeResponse` (`@PUT`) |

**Models** (all `@Serializable`):

| Model | Fields |
|---|---|
| `GithubReviewRepo` | `id: Long`, `name: String`, `fullName: String` |
| `GitHubPrSummary` | `number: Int`, `title: String`, `body: String?`, `head: GitHubBranchRef`, `user: GitHubUser` |
| `GitHubBranchRef` | `ref: String` |
| `GitHubUser` | `login: String` |
| `GitHubFile` | `filename: String`, `additions: Int`, `deletions: Int`, `patch: String?` |
| `GitHubPullRequest` | Full PR detail; now includes `mergeable: Boolean?` and `mergeableState: String?` (null while GitHub computes it) |
| `GitHubMergeRequest` | `commitTitle: String?`, `mergeMethod: String = "merge"` — request body for merge endpoint |
| `GitHubMergeResponse` | `sha: String?`, `merged: Boolean`, `message: String?` |
| `GitHubWorkflowRunResponse` | `workflowRuns: List<GitHubWorkflowRun>` |
| `GitHubWorkflowRun` | `id: Long`, `headBranch: String`, `headSha: String`, `status: String`, `conclusion: String?` |
| `GitHubArtifactResponse` | `artifacts: List<GitHubArtifact>` |
| `GitHubArtifact` | `id: Long`, `name: String`, `sizeInBytes: Long`, `url: String`, `archiveDownloadUrl: String` |

### Notable Patterns
- **Auth via Clerk metadata**: `JulesAuthTokenProvider` reads the Jules token from `ClerkUnsafeMetadataDataSource`. `GitHubAuthTokenProvider` does the same for GitHub.
- **Auto-polling**: Dashboard refreshes on a configurable interval (`autoRefreshIntervalMs: Long? = 30_000L`); passing `null` disables the timer entirely (useful in tests). Session detail polls every 5s, stopping when session reaches a terminal or waiting state.
- **Drag-select**: Dashboard uses `DragSelectState` from `dragselectcompose` library for multi-select batch archive.
- **AdaptiveThreePaneLayout**: Dashboard uses a three-pane adaptive layout (replaces `TwoPaneLayout`). Pane 1 = session list, pane 2 = `JulesSessionDetailScreen`, pane 3 = `ReviewDetailsPane`. On Compact, all navigation is routed via `NavController`; on Medium/Expanded, session clicks set `selectedSession` state and PR clicks set `selectedPrUrl` state. `julesDashboardRoute` now takes `onNavigateToReviewPr: (prUrl) -> Unit` (wired in `HomeComponent`). `LaunchedEffect(selectedSession)` clears `selectedPrUrl` when the user switches sessions. PR URL is parsed inline via `parseGitHubPrUrl` to build the `prId` passed to `ReviewDetailsPane`.
- **Chat-style session view**: Activities are rendered as a reversed `LazyColumn` (chat-like), with domain `Activity` mapped to `ChatMessage` and `WorkflowActivity` types.
- **PR merge detection**: `CheckPrMergedUseCase` calls GitHub API to determine if the output PR was merged, enabling an "Archive" card.

## Data Flow

### Dashboard
1. `JulesDashboardViewModel.init` triggers `loadSessions()`, `loadSources()`, `startTimer()`.
2. Sessions fetched via `GetSessionsUseCase` (paginated, 20 per page).
3. Client-side filtering by `DashboardTab` (maps `SessionState`), sorting by created/updated/title, text search.
4. `createSession()` sends a `CreateSessionRequest` with source context and automation mode, then refreshes.
5. `archiveSessions()` runs parallel archive calls via `async/awaitAll`.

### Session Detail
1. `JulesSessionViewModel` fetches session + activities in parallel on init.
2. Starts 5s polling loop; stops only when session reaches a terminal state (MERGED or CLOSED) — previously stopped on any non-active state; now re-polls while still OPEN to surface the archive button after a merge without a manual reload.
3. `sendMessage()` posts user message, clears input, refreshes, restarts polling.
4. `approvePlan()` approves the plan, refreshes, restarts polling.
5. `checkPrMergedIfNeeded()` runs when session is completed and has a PR output.
6. Activities rendered as chat bubbles + domain event cards + artifact inline cards.

### Artifacts
1. `JulesArtifactsViewModel.load()` fetches session + activities.
2. Filters artifacts with non-null `changeSet.gitPatch.unidiffPatch`.
3. Renders each artifact as an expandable diff card.

## Dependencies

- **Core**: `ViewModel<T>`, `DiProvider`, `AnalyticsManager`, `safeCall`, `getErrorFromException`
- **Core remote**: `JulesAPI`, `JulesAuthTokenProvider`, `GitHubAPI`, `GitHubAuthTokenProvider`, `ClerkUnsafeMetadataDataSource`
- **Core models**: `Session`, `SessionState`, `Activity`, `Artifact`, `Source`, `CreateSessionRequest`, `PrStatus`
- **Shared**: `ActiveSessionIndicator`, `ActivityEventCard`, `PullRequestCard` (from `features.shared.ailift`)
- **External libs**: `dragselectcompose` (drag-select grid)
- **Platform**: None directly

## Known Issues / Drift

- **JulesRoutes.kt deleted**: The empty file (package declaration only) was removed. Route objects are defined in each sub-screen file.
- **Dashboard ViewModel self-references via DiProvider**: `julesDashboardScreenViewModel` calls `DiProvider.getComponent(JulesComponent::class)` to get use cases, but it is already inside `JulesComponent`. Should use `this` directly.
- **Session ViewModel not in DI component**: `JulesSessionViewModel` is created inline in `JulesSessionDetailScreen` via `viewModel { ... }`, not via the component. This is intentional (keyed by `sessionId`) but differs from other ViewModels.
- **No DataSource layer**: `JulesRepositoryImpl` calls `JulesAPI` directly. The data sources were recently moved from `core/` to `features/jules/` but still bypass a dedicated DataSource interface.
- **Domain models partially redundant**: `WorkflowModel` / `WorkflowStatus` exist as domain models, but the UI also directly uses `Session`, `SessionState`, and `Activity` from core. The mapping happens locally in `JulesSessionDetailScreen.toDomainActivity()`.
- **30s dashboard polling may be aggressive** for battery on mobile (but can now be configured or disabled via `autoRefreshIntervalMs`).

## Tests

`commonTest` coverage (comprehensive suite added alongside the Kobote refactor):

| File | What it tests |
|------|---------------|
| `data/repository/CodingAgentRepositoryRouterTest.kt` | Router dispatches to correct backend; fails fast when Kobote selected but no address; covers all 9 repository methods. |
| `data/repository/CodingAgentRepositoryTest.kt` | `JulesGoogleRepository` and `KoboteRepository` safeCall wrapping; verifies error propagation. |
| `data/repository/FakeCodingAgentRepository.kt` | Shared test double for all use-case tests. |
| `domain/usecase/ApprovePlanUseCaseTest.kt` | Approve calls repo and returns result. |
| `domain/usecase/CreateSessionUseCaseTest.kt` | Create with source context and automation mode; error case. |
| `domain/usecase/GetSessionActivitiesUseCaseTest.kt` | Pagination; empty page. |
| `domain/usecase/GetSessionUseCaseTest.kt` | Session fetch; missing session case. |
| `domain/usecase/GetSessionsUseCaseTest.kt` | List with page size; multi-page scenario. |
| `domain/usecase/ListSourcesUseCaseTest.kt` | Source list returned; error forwarded. |
| `domain/usecase/SendMessageUseCaseTest.kt` | Message send; failure propagation. |
| `ui/dashboard/JulesDashboardViewModelTest.kt` | Initial load, session creation, archive, provider switch side-effects. |
| `ui/session/JulesSessionViewModelTest.kt` | State transitions: initial load, polling, message send, plan approval, archive, PR merge check. |

## AI Tools

`CodingAgentComponent.tools` exposes 8 tools to the in-app AI agent, all registered via `commonFeatureTools()`:

| Tool | Class | Write? | Description |
|------|-------|--------|-------------|
| `list_agent_sessions` | `ListAgentSessionsTool` | No | Lists sessions newest-first; optional `pageSize`/`pageToken` |
| `list_agent_sources` | `ListAgentSourcesTool` | No | Lists available source repos (resource names) |
| `get_agent_session` | `GetAgentSessionTool` | No | Fetches a single session by id, including PRs and full activity history (timestamps, originator, user/agent messages, plan steps, bash command outputs). Accepts optional `GetSessionActivitiesUseCase` — when provided (default in prod), the tool appends the complete activity log after the session summary. |
| `create_agent_session` | `CreateAgentSessionTool` | Yes | Creates a new session; args: `prompt`, `source`, `startingBranch?`, `title?`, `requirePlanApproval?`. If `startingBranch` is omitted, the tool calls `ListSourcesUseCase` to look up the source's default branch automatically — mirrors the dashboard new-session dialog. Returns a clear error if the branch cannot be resolved. |
| `send_agent_message` | `SendAgentMessageTool` | Yes | Sends a message to an existing session |
| `approve_agent_plan` | `ApproveAgentPlanTool` | Yes | Approves the pending plan for a session |
| `cancel_agent_session` | `CancelAgentSessionTool` | Yes | Cancels a running session |
| `check_pr_merged` | `CheckPrMergedTool` | No | Returns whether the session's output PR has been merged |

Write tools (`create_agent_session`, `send_agent_message`, `approve_agent_plan`, `cancel_agent_session`) all set `requiresConfirmation = true`. All tools are thin wrappers over the existing use cases — no business logic in `execute()`.

## See Also

- [review](review.md) — reuses `GitHubAPI` (including the new `getWorkflowRuns` / `getRunArtifacts` endpoints) for PR artifact download
- [ideas](ideas.md) — orchestration layer that creates Jules sessions from Linear issues
- [linear](linear.md) — issue tracker used alongside Jules
- [Architecture Overview](../../../architecture.md)

_Last updated: 2026-07-06 — UI display label renamed from "Jules" to "Agent": `strings_jules.xml` (`jules_dashboard_title`), `strings_ideas.xml` (`idea_start_session_button` → "Start Agent Session"), and `Features.kt` (`JULES.label`). Feature package and code names are unchanged (`features/jules/`, `JulesDashboardRoute`, etc.)._
_Previous: 2026-06-27 — `GetAgentSessionTool` now accepts `GetSessionActivitiesUseCase?` and appends full activity history (timestamps, messages, plan steps, bash outputs). `SessionCard` refactored to use `SelectableItemWrapper` (removed bespoke `SelectionIndicator`). `JulesDashboardContent` uses `ResponsiveSelectionTopAppBar` + `ResponsiveSelectionBottomBar` instead of custom `JulesDashboardTopBar`._
_Previous: 2026-06-23 — `CreateAgentSessionTool` now accepts `listSourcesUseCase` and auto-resolves `startingBranch` from the sources list when the caller omits it; `CodingAgentComponent` passes `listSourcesUseCase` to the tool constructor._
_Previous: 2026-06-19 — Added 8 AI tools (`list_agent_sessions`, `list_agent_sources`, `get_agent_session`, `create_agent_session`, `send_agent_message`, `approve_agent_plan`, `cancel_agent_session`, `check_pr_merged`) in `features/jules/tools/`, registered via `CodingAgentComponent.tools` and `commonFeatureTools()`._
_Previous: 2026-06-15 — `JulesDashboardContentState` extracted to `ui/dashboard/components/` with private sub-composables for each UiState branch._
_Last updated: 2026-06-11 — Multi-provider refactor: `CodingAgentProvider` enum (JULES_GOOGLE | KOBOTE), `CodingAgentRepository` interface, `CodingAgentRepositoryRouter` dispatcher, `KoboteRepository` (Claude on desktop), `JulesGoogleRepository` (renamed from JulesRepositoryImpl). `CodingAgentComponent` replaces `JulesComponent`. Comprehensive commonTest suite added (12 test files covering router, use cases, and ViewModels). `JulesArtifactsScreen` migrated to `AppScaffold`._
_Previous: 2026-05-31 — Dashboard migrated to `AdaptiveThreePaneLayout`; `julesDashboardRoute` gains `onNavigateToReviewPr` callback._
