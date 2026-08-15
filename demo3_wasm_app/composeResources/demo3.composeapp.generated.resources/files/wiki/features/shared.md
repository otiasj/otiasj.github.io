---
type: feature
title: Shared Feature
description: Brand-scoped shared components — Revivle comment CRUD and item-action
  use cases, plus AiLift UI primitives — that are consumed by other features rather
  than navigated to directly.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/shared/]
tags: [demo3, feature, shared]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Shared Feature

## Purpose
Brand-scoped shared components — Revivle comment CRUD and item-action use cases, plus AiLift UI primitives — that are consumed by other features rather than navigated to directly.

Location: `features/shared/`

## Responsibility

`shared` is not a user-facing feature. It is a home for cross-feature logic that is tied to a specific brand (Revivle or AiLift) and therefore cannot live in `core`. It exposes reusable ViewModels, use cases, data sources, and UI components that multiple features wire together in their own components.

## Route & Entry Point

None. `shared` has no route and is never registered in the NavHost. Consuming features (e.g., `itemdetail`, `marketplace`) instantiate `RevivleCommentsViewModel` or embed `RevivleCommentsSection` directly.

## Key Types

### `shared/revivle/`

| Type | Location | Purpose |
|---|---|---|
| `RevivleAuthTokenProvider` | `data/` | Implements `AuthTokenProvider`; reads the Revivle API token from Clerk's unsafe metadata under key `REVIVLE_TOKEN`. |
| `RevivleCommentRemoteDataSource` | `data/datasource/` | Wraps `CommentsApi`; supports get/create/delete/update/report for both item and outfit comment endpoints. |
| `RevivleCommentRepositoryImpl` | `data/repository/` | Maps `PaginatedResponseComment` and `Comment` DTOs to `RevivleComment` domain objects via `RevivleCommentMapper`. |
| `RevivleCommentRepository` | `domain/repository/` | Interface contract for the above. |
| `RevivleComment` | `domain/model/` | Domain model: `id`, `text`, `author: ItemOwnerInfo?`, `createdAt/updatedAt: Instant`, `replies`, `parentId`, `depth`, `isDeleted`, `isReported`. |
| `GetRevivleCommentsUseCase` | `domain/usecase/` | Paginated fetch — `(targetId, isOutfit, page, limit)`. |
| `CreateRevivleCommentUseCase` | `domain/usecase/` | Creates a root comment or reply (`parentId` optional). |
| `UpdateRevivleCommentUseCase` | `domain/usecase/` | Edits comment text by ID. |
| `DeleteRevivleCommentUseCase` | `domain/usecase/` | Soft-delete by comment ID. |
| `ReportRevivleCommentUseCase` | `domain/usecase/` | Reports a comment with an optional reason string. |
| `ArchiveItemUseCase` | `domain/` (itemactions) | Moves a `MyItem` to `ItemPage.Gone` via `MyItemRepository`. |
| `KeepItemUseCase` | `domain/` (itemactions) | Moves a `MyItem` back to `ItemPage.Main`. |
| `ListItemUseCase` | `domain/` (itemactions) | Adds `ItemPage.ForSale` to a `MyItem` while retaining `ItemPage.Main`. |
| `RevivleCommentsUiState` | `ui/` | Plain `data class` (not sealed): `comments`, `isLoading`, `isLoadingMore`, `hasMore`, `currentPage`, `error`, `replyingTo`, `editingComment`, `commentText: TextFieldValue`, `isSubmitting`, `currentUserId`, `reportingCommentId`, `deletingCommentId`. |
| `RevivleCommentsViewModel` | `ui/` | Extends `ViewModel<RevivleCommentsUiState>`; orchestrates all comment CRUD, reply threading, and optimistic refresh. |
| `RevivleCommentsSection` | `ui/components/comments/` | Composable embedding the full comment thread UI (list + input + dialogs). |
| `RevivleCommentItem` | `ui/components/comments/` | Single comment row with reply/edit/delete/report affordances. Accepts `modifier: Modifier = Modifier`. Internally composed of private sub-composables: `CommentAvatar`, `CommentContent`, and `CommentActionsMenu`. |
| `RevivleCommentInput` | `ui/components/comments/` | Text field + submit button with optional reply/edit context banner. |
| `ReportCommentDialog` | `ui/components/comments/` | Confirmation dialog for reporting a comment. |

### `shared/ailift/`

The AiLift sub-package contains UI-only components (no domain layer). All types are in `ui/components/`:

| Type | Purpose |
|---|---|
| `ActiveSessionIndicator` | Animated pulsing dot (uses `rememberInfiniteTransition`) to show an active AI session. |
| `PlanGeneratedCard` | Card rendering a `WorkflowPlan` with collapsible `WorkflowPlanStep` rows and an optional approve button; depends on types from `features/jules`. |
| `CollapsiblePlanStepRow` | Expandable step row with step-number badge, title, and optional description. |
| `ActivityEventCards` | Renders individual `WorkflowActivity` event feed items. |
| `ColoredDiffView` / `DiffUtils` | Diff rendering utilities for displaying code or text changes. |
| `BranchDropdown` / `SourceDropdown` | Dropdowns for git branch/source selection. |
| `PriorityIcons` | Icon set for priority levels. |
| `PullRequestCard` | Card rendering a pull request summary. |
| `DiffFileRow` | Collapsible row composable showing a single changed file from a diff — filename, `+`/`-` counts, and an expandable diff body with syntax-coloured lines. Extracted from `features/jules` and `features/review` in #589 so both screens share the same component. Accepts `filename: String`, `additions: Int`, `deletions: Int`, and `diffContent: String?`; uses `AnimatedVisibility` for expand/collapse. |

## Architecture

Both sub-packages follow the same layered structure used across Demo3:

```
shared/revivle/
├── data/
│   ├── RevivleAuthTokenProvider.kt
│   └── datasource/  repository/
├── domain/
│   ├── model/  repository/  usecase/  mappers/
│   └── (itemactions — ArchiveItemUseCase, KeepItemUseCase, ListItemUseCase)
└── ui/
    ├── RevivleCommentsUiState.kt
    ├── RevivleCommentsViewModel.kt
    └── components/comments/

shared/ailift/
└── ui/components/   (UI primitives only)
```

The `ailift` sub-package is deliberately shallow — it holds composable building blocks that the `jules` feature (or others) assemble into full screens.

## Data Flow

**Comment display (Revivle):**
1. Consumer calls `RevivleCommentsViewModel.loadComments(targetId, isOutfit)`.
2. VM calls `GetRevivleCommentsUseCase.execute(targetId, isOutfit, page=1, limit=20)`.
3. Use case delegates to `RevivleCommentRepository` → `RevivleCommentRemoteDataSource` → `CommentsApi`.
4. Response mapped via `RevivleCommentMapper` to `List<RevivleComment>`; state updated to include `comments`, `hasMore`, `currentPage`.
5. `RevivleCommentsSection` observes state and renders `RevivleCommentItem` rows.

**Comment mutation:**
- Submit/edit/delete each call their respective use case, then re-call `loadComments` after a 300 ms delay to refresh the list. Updates are not fully optimistic — the list reloads on success.

**Reply threading:**
- `onReplyToComment` enforces two-level threading: if the tapped comment has a `parentId` (i.e., it is already a reply), the new comment targets that `parentId`; otherwise it targets the comment's own `id`. The `@handle` prefix is pre-filled into `commentText`.

**Item actions (Revivle):**
- `ArchiveItemUseCase`, `KeepItemUseCase`, and `ListItemUseCase` call `MyItemRepository.updateItemPages(itemId, pages)` directly. No caching or optimistic update.

## Dependencies

- `core` — `AuthTokenProvider`, `ClerkUnsafeMetadataDataSource`, `UserRemoteDataSource`, `AnalyticsManager`, `ViewModel`, `PaginatedResult`, `safeCall`, `ItemPage`, `ItemOwnerInfo`
- `features/mycloset` — `MyItem`, `MyItemRepository` (item-action use cases only)
- `features/jules` — `WorkflowPlan`, `WorkflowPlanStep` (AiLift `PlanGeneratedCard` only)
- `revivle-api-client` — `CommentsApi`, `AuthenticationApi`, generated request/response models

## Known Issues / Drift

- `RevivleCommentsViewModel.fetchCurrentUser` makes two sequential network calls (Clerk `getCurrentUser` + Revivle `authMeGet`) on every `loadComments` call. On failure it falls back to the Clerk user ID, which will cause `isOwner` checks to produce wrong results since the Revivle internal user ID differs from the Clerk user ID.
- Comment mutations call `loadComments` after a hardcoded `delay(300)`. There is no loading indicator during this window, so the UI appears to have submitted but shows stale data briefly.
- The `ailift` sub-package contains no domain or data layer. If AiLift components ever need to fetch data, the package will need to grow a full layer stack; the current structure does not scaffold that.
- Item-action use cases (`ArchiveItemUseCase`, etc.) live under `shared/revivle/domain/` in a sub-package named `itemactions`, but they have no dependency on the Revivle API — they only use `MyItemRepository`. Their placement here is a structural mismatch that could confuse future contributors.

## Tests

`commonTest` additions in #425 (item-action use cases) and #522 (RevivleComments ViewModel), extended in #558:

| File | What it tests |
|------|---------------|
| `shared/revivle/domain/FakeMyItemRepository.kt` | In-memory stub for `MyItemRepository`; shared across multiple feature test suites. |
| `shared/revivle/itemactions/ArchiveItemUseCaseTest.kt` | Archive action: success, not-found, network error paths. |
| `shared/revivle/itemactions/KeepItemUseCaseTest.kt` | Keep action state transitions. |
| `shared/revivle/itemactions/ListItemUseCaseTest.kt` | List-for-sale action, including price validation. |
| `shared/revivle/fakes/FakeAuthenticationApi.kt` | Fake `AuthenticationApi` for comment-layer tests that require an authenticated user context (#522). |
| `shared/revivle/fakes/FakeRevivleCommentRepository.kt` | In-memory stub for `RevivleCommentRepository` (#522). |
| `shared/revivle/ui/RevivleCommentsViewModelTest.kt` | `RevivleCommentsViewModel` state transitions: load comments, post comment, delete, user ownership checks, sequential-call timing (#522, added by Jules agent). |
| `shared/revivle/domain/usecase/CreateRevivleCommentUseCaseTest.kt` | Create comment use case: success, API error, auth error paths (#558). |
| `shared/revivle/domain/usecase/DeleteRevivleCommentUseCaseTest.kt` | Delete use case: success, not-found, permission denied (#558). |
| `shared/revivle/domain/usecase/GetRevivleCommentsUseCaseTest.kt` | Get comments: pagination, empty list, error propagation (#558). |
| `shared/revivle/domain/usecase/ReportRevivleCommentUseCaseTest.kt` | Report use case: success and error paths (#558). |
| `shared/revivle/domain/usecase/UpdateRevivleCommentUseCaseTest.kt` | Update use case: success, not-found, validation (#558). |

## See Also

- `features/template` — canonical feature skeleton to follow when adding new sub-packages
- `features/jules` — primary consumer of `shared/ailift/` UI components
- `features/transactions` — uses `CalculateFeeUseCase` (self-contained); compare with `RevivleCommentsViewModel` for VM patterns
- `core/data/datasource/remote/auth/` — `AuthTokenProvider`, `ClerkUnsafeMetadataDataSource`

_Last updated: 2026-06-28 — `RevivleCommentItem` refactored: extracted private `CommentAvatar`, `CommentContent`, and `CommentActionsMenu` sub-composables to fix oversized composable lint; added `modifier: Modifier = Modifier` parameter; switched previews to `@ThemePreviews` / `@CombinedThemePreviews`._
_Previous: 2026-06-03 — `RevivleCommentsViewModelTest` expanded with comprehensive sequential-call timing and user-ownership coverage._
