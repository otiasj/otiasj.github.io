---
type: feature
title: Review
description: 'GitHub PR review browser: lists your repositories and their open pull
  requests via the real GitHub API, with a detail screen showing changed files, CI
  artifact screenshots, and an embedded AI chat for…'
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/review/]
tags: [demo3, feature, review]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Review

## Purpose
GitHub PR review browser: lists your repositories and their open pull requests via the real GitHub API, with a detail screen showing changed files, CI artifact screenshots, and an embedded AI chat for inline review assistance.

Location: `features/review/`

## Responsibility

Owns the GitHub PR review experience: fetching repositories and open pull requests from the GitHub API, switching the active repository, and navigating to a per-PR detail view. The detail screen renders PR metadata (title, author, branch, changed files with diffs), asynchronously loads CI workflow artifact screenshots (zip download + platform-specific extraction), and embeds `AiChatCatalog` pre-seeded with a PR context prompt for AI-assisted code review. Does NOT own the AI chat component itself (that lives in `platform/ai`).

## Route & Entry Point

```kotlin
@Serializable
object ReviewRoute

fun NavGraphBuilder.reviewRoute(onNavigateBack, onNavigateToReviewDetails, contentPadding)
fun NavController.navigateToReview()

@Serializable
data class ReviewDetailsRoute(val prId: String)

fun NavGraphBuilder.reviewDetailsRoute(onNavigateBack, contentPadding)   // ~5-line adapter over ReviewDetailsPane
fun NavController.navigateToReviewDetails(prId: String)

// Reusable pane composable — embeddable without NavController
@Composable
fun ReviewDetailsPane(prId: String, contentPadding, onClose, ...)
```

The list screen is `ReviewScreen`; the detail screen is `ReviewDetailsScreen`. Both are backed by `ReviewComponent` retrieved from `DiProvider`.

`ReviewDetailsPane` was extracted from `ReviewDetailsScreen` to support embedding as pane 3 in `AdaptiveThreePaneLayout` inside Jules dashboard, Ideas, and Linear. It owns its own VM resolution and `LaunchedEffect(prId) { viewModel.loadPr(prId) }`. `reviewDetailsRoute` is now a ~5-line adapter that delegates to `ReviewDetailsPane`. The pane's `TopAppBar` reads `LocalPaneMode` (provided by `AdaptiveThreePaneLayout` at the pane boundary) and renders a close-X automatically — no `showCloseIcon` parameter needed.

## Key Types

| Type | Description |
|------|-------------|
| `ReviewComponent` | DI container; wires `GitHubAPI` + `downloadClient`, repository, all four use cases, `ReviewViewModel`, and `ReviewDetailsViewModel` |
| `ReviewViewModel` | Manages repo selection and PR list; wraps `GetRepositoriesUseCase` + `GetPullRequestsUseCase` |
| `ReviewDetailsViewModel` | Extends `ViewModel<ReviewDetailsUiState>`; loads PR then asynchronously loads CI artifacts via `DownloadPrArtifactsUseCase`; exposes `mergePr()` which invokes `MergePullRequestUseCase`. No analytics wiring. |
| `ReviewRepositoryImpl` | `ReviewRepository` implementation; fetches repos and PRs via `GitHubAPI`; downloads artifact zips via a separate authenticated Ktor client |
| `ReviewRepository` | Interface: `getRepositories()`, `getPullRequests(repoId)`, `getPullRequest(prId)`, `downloadPrArtifacts(pr)`, `mergePullRequest(prId)` |
| `GetRepositoriesUseCase` | `invoke(): Result<List<Repository>>` |
| `GetPullRequestsUseCase` | `invoke(repoId: String): Result<List<PullRequest>>` |
| `GetPullRequestUseCase` | `invoke(prId: String): Result<PullRequest>` — fetches full PR including changed files |
| `DownloadPrArtifactsUseCase` | `invoke(pr: PullRequest): Result<List<String>>` — fetches CI run, downloads artifact zip, returns local image paths |
| `MergePullRequestUseCase` | `invoke(prId: String): Result<Unit>` — merges a PR via the GitHub API |
| `ZipExtractor` | KMP `expect` function `extractZipImages(zipBytes, cacheKey)`: `actual` implementations for android, desktop, native, wasmJs |
| `ReviewUiState` | Sealed interface: `Loading`, `Success(repositories, selectedRepository, pullRequests, isRefreshing)`, `ErrorState(error, message)` |
| `ReviewDetailsUiState` | Sealed interface: `Loading`, `Success(pullRequest, artifactPaths, isArtifactsLoading, artifactsError, isMerging, isMerged, mergeError)`, `Error(message: String)` |
| `Repository` | Domain model: `id: String`, `name: String`, `fullName: String` |
| `PullRequest` | Domain model implementing `ReviewItemData`: `id`, `title`, `description`, `headRef`, `author`, `repoId`, `number`, `additions`, `deletions`, `changedFiles: List<ChangedFile>`, `url: String?` (GitHub HTML URL), `mergeable: Boolean?` (null while GitHub computes it), `mergeableState: String?` (GitHub's `mergeable_state`: `"clean"`, `"dirty"`, `"unknown"`, `"blocked"`, `"behind"`, `"unstable"`, `"has_hooks"`, `"draft"`) |
| `ChangedFile` | Domain model: `filename`, `additions`, `deletions`, `patch: String?` |
| `ReviewItemData` | Interface (in `ui/ReviewItemCard.kt`): `title`, `author`, `headRef` — common contract for card rendering |
| `ReviewItemCard` | `@Composable` card accepting any `ReviewItemData` |

## Architecture

```
review/
├── ReviewComponent.kt                    # Manual DI; wires GitHubAPI + downloadClient
├── data/
│   ├── ZipExtractor.kt                   # expect fun extractZipImages(...)
│   ├── ZipExtractor.android.kt           # actual — Android zip + bitmap
│   ├── ZipExtractor.desktop.kt           # actual — JVM zip + image
│   ├── ZipExtractor.native.kt            # actual — iOS/native
│   ├── ZipExtractor.wasmJs.kt            # actual — Wasm
│   └── repository/
│       └── ReviewRepositoryImpl.kt       # GitHubAPI + platform download client
├── domain/
│   ├── model/ReviewItem.kt               # Repository + PullRequest + ChangedFile
│   ├── repository/ReviewRepository.kt    # Interface (now includes downloadPrArtifacts)
│   └── usecase/
│       ├── GetRepositoriesUseCase.kt
│       ├── GetPullRequestsUseCase.kt
│       ├── GetPullRequestUseCase.kt
│       ├── DownloadPrArtifactsUseCase.kt
│       └── MergePullRequestUseCase.kt    # NEW — merges PR via GitHub API
└── ui/
    ├── ReviewScreen.kt                   # List screen + nav extensions
    ├── ReviewDetailsScreen.kt            # Detail screen + artifact image display
    ├── ReviewDetailsUiState.kt           # Success now carries artifactPaths + isArtifactsLoading
    ├── ReviewDetailsViewModel.kt         # Two-stage load: PR first, then artifacts
    ├── ReviewItemCard.kt                 # ReviewItemData interface + ReviewItemCard composable
    ├── ReviewUiState.kt                  # Sealed interface for list screen
    └── ReviewViewModel.kt
```

`ReviewViewModel` and `ReviewDetailsViewModel` both extend the core `ViewModel<T>` base class and receive `AnalyticsManager` from `DiProvider.getComponent(AnalyticsModule::class)`.

## Data Flow

### List Screen
1. `reviewRoute` calls `viewModel.loadData()` inside `LaunchedEffect(Unit)`.
2. `loadData()` calls `GetRepositoriesUseCase` → on success, auto-selects `repos.firstOrNull()` and immediately calls `GetPullRequestsUseCase` for that repo.
3. State is set to `ReviewUiState.Success` (or `ErrorState` on failure).
4. User changes repo via dropdown → `viewModel.selectRepository(repoId)` calls `GetPullRequestsUseCase` for the new repo.
5. Tapping a PR card navigates to `ReviewDetailsRoute(prId)`.

### Detail Screen
1. `reviewDetailsRoute` gets `component.reviewDetailsViewModel` from DI.
2. `LaunchedEffect(args.prId)` → `viewModel.loadPr(prId)` → emits `Loading`.
3. `GetPullRequestUseCase` fetches full PR including all changed files.
4. On success → emits `Success(pullRequest, artifactPaths=[], isArtifactsLoading=false)` **and immediately** calls `loadArtifacts(pr)` in a separate coroutine.
5. `loadArtifacts` sets `isArtifactsLoading = true`, then calls `DownloadPrArtifactsUseCase`:
   - Fetches the latest workflow run for the PR's branch via `GitHubAPI.getWorkflowRuns`.
   - Gets artifacts for that run via `GitHubAPI.getRunArtifacts`.
   - Downloads the first artifact's zip as raw bytes via a dedicated authenticated Ktor client.
   - Calls `extractZipImages(zipBytes, pr.id)` — KMP expect/actual — which extracts image files from the zip and returns local file paths.
   - Updates state with `artifactPaths = paths, isArtifactsLoading = false`. If no run or artifact is found, returns an empty list without error.
6. On PR load failure → emits `Error(message)`.
7. `ReviewDetailsContent` renders PR metadata, `DiffFileRow` list, artifact images, and `AiChatCatalog` with PR context prompt. The merge status is rendered via the `MergeStatusRow` composable which switches on `mergeableState` and `mergeable`:

   | Condition | UI |
   |---|---|
   | `isMerged` | ✅ "Merged" badge (`CheckCircle` icon, primary colour) |
   | `mergeable == null` | ⏳ "Checking mergeability…" badge (`HourglassEmpty` icon) |
   | `mergeable == false` or `mergeableState == "dirty"` | ⚠️ "Merge conflict" badge (`Warning` icon, error colour) |
   | `mergeableState == "blocked"` | 🚫 "Blocked" badge (`Block` icon, error colour) |
   | `mergeableState == "behind"` | 🕐 "Behind" badge (`History` icon, surface-variant colour) |
   | `mergeableState == "draft"` | Draft badge (`MergeType` icon, surface-variant colour) |
   | otherwise | **Merge PR** button; tapping calls `viewModel.mergePr()` → `isMerging → true` → `isMerged → true` on success or `mergeError` on failure |

   An **open-in-browser** `IconButton` (launch icon) is shown in the action bar via the `onNavigateToReviewPr` callback.

## Dependencies

- **Core**: `DiProvider`, `AnalyticsModule`, `AnalyticsManager`, `safeCall`, `Error`, `AppScaffold`, `FullScreenLoading`, `ErrorState`
- **Jules data layer**: `GitHubAPI` (also uses `getWorkflowRuns`, `getRunArtifacts`), `GitHubAuthTokenProvider`, `ClerkUnsafeMetadataDataSourceFactory`
- **Platform AI**: `AiChatCatalog` (embedded in detail screen with PR context)
- **Platform HTTP**: `createPlatformHttpClient` with bearer auth for artifact zip downloads
- **Navigation**: `androidx.navigation`, `kotlinx.serialization`
- No cross-feature imports from other feature modules.

## Tests

`commonTest` coverage added in #500 and #506, extended in #520, further extended in #562 and #591:

| File | What it tests |
|------|---------------|
| `domain/repository/FakeReviewRepository.kt` | In-memory stub implementing `ReviewRepository` for test isolation. |
| `domain/usecase/GetPullRequestUseCaseTest.kt` | `GetPullRequestUseCase` success and error paths. |
| `domain/usecase/GetPullRequestsUseCaseTest.kt` | `GetPullRequestsUseCase` — list loading and error handling. |
| `domain/usecase/GetRepositoriesUseCaseTest.kt` | `GetRepositoriesUseCase` — repository list retrieval. |
| `ui/ReviewViewModelTest.kt` | `ReviewViewModel` state transitions: initial load, repo switch, PR list update. |
| `ui/ReviewDetailsViewModelTest.kt` | `ReviewDetailsViewModel` state transitions: PR detail load, artifact loading states (isArtifactsLoading true → paths populated), no-artifacts case, error state; loading states drained correctly in tests (#562). |
| `data/repository/FakeGitHubAPI.kt` | Fake Ktorfit `GitHubAPI` (now also stubs `getWorkflowRuns` + `getRunArtifacts`) for repository-layer isolation (#520). |
| `data/repository/ReviewRepositoryImplTest.kt` | `ReviewRepositoryImpl` unit tests: map API responses to domain models, handle pagination, artifact download path, error paths (#520 / #562). |
| `domain/usecase/DownloadPrArtifactsUseCaseTest.kt` | `DownloadPrArtifactsUseCase` success and failure states; uses Ktor `MockEngine` to simulate GitHub API responses (#591). |

## Known Issues / Drift

- **No analytics events**: `ReviewViewModel` and `ReviewDetailsViewModel` receive `AnalyticsManager` but never call `trackEvent()`.
- **`prId` format is `"owner/repo/number"`**: This string format is used as the navigation route argument and as the ID throughout. It is parsed in `ReviewRepositoryImpl.getPullRequest()` by splitting on `/`.
- **Artifact discovery now scans all completed runs**: `downloadPrArtifacts` fetches up to 20 workflow runs and iterates all `status == "completed"` runs, trying each artifact until one yields non-empty images. Unit-test runs that produce only HTML (no images) are skipped automatically. Returns `emptyList()` if no image artifact is found across all runs. A GitHub API error message surfaced in the run list response is now propagated as an exception rather than silently returning empty.
- **`ZipExtractor` platform implementations vary**: The expect/actual contract returns file paths as strings; callers must render them via the appropriate platform image loader.

## AI Tools

`ReviewComponent.tools` exposes 4 tools via `commonFeatureTools()`:

| Tool | Class | Write? | Description |
|------|-------|--------|-------------|
| `list_repositories` | `ListRepositoriesTool` | No | Lists GitHub repos accessible to the authenticated user |
| `list_pull_requests` | `ListPullRequestsTool` | No | Lists open PRs for a given repo id |
| `get_pull_request` | `GetPullRequestTool` | No | Fetches a single PR with changed files by `prId` (`"owner/repo/number"`) |
| `merge_pull_request` | `MergePullRequestTool` | Yes | Merges a PR via the GitHub API; `requiresConfirmation = true` |

All tools are thin wrappers over the existing use cases in `ReviewComponent`.

## See Also

- [jules](jules.md) — owns `GitHubAPI` used by this feature's repository layer
- [linear](linear.md) — another issue-tracker feature with similar list/detail pattern
- [ai-chat](ai-chat.md) — `AiChatCatalog` embedded in the detail screen

_Last updated: 2026-06-19 — Added 4 AI tools (`list_repositories`, `list_pull_requests`, `get_pull_request`, `merge_pull_request`) in `features/review/tools/`; `ReviewDetailsViewModel` gains `ReviewDetailsViewModelTest`._
_Previous: 2026-06-05 — `PullRequest` gains `mergeableState: String?`; `ReviewDetailsScreen` now renders `MergeStatusRow` with richer merge state handling (checking, dirty/conflict, blocked, behind, draft, clean/merge button)._
_Last updated: 2026-06-03 — `ReviewDetailsScreen` now displays a "Merge conflict" error label when `pr.mergeable == false` (i18n string `review_details_merge_conflict`)._
