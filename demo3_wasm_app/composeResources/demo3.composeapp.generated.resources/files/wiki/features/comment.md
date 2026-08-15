---
type: feature
title: Comment
description: Domain-layer scaffold for a decoupled comment feature (items and outfits),
  ported from Revivle web. Not yet wired into the app — the active comment UI still
  lives under features/shared/revivle/.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/comment/]
tags: [demo3, feature, comment, domain-only]
timestamp: '2026-08-01T00:00:00Z'
last_commit: ce16f59e08d2a1ca93fb6b7c81732bda325a1d74
category: feature
---

# Comment

## Purpose

Domain-layer scaffold for a feature-scoped commenting API covering both items and outfits. The intent is to replace the older `features/shared/revivle/*` comment code with a properly isolated feature. Introduced by PR #1295 (`feat(comments): Port domain layer for comments`) on 2026-07-31.

At the time of writing the feature contains **only** its domain surface — no data implementation, no `ui/` layer, no `Component`, no navigation wiring, and no consumers anywhere in `composeApp`. It is not registered by any `AppPlugin` and cannot be invoked from the running app.

Location: `features/comment/`

## Responsibility

**Owns:** Pure domain contracts for commenting on items and outfits — the `Comment`, `Thread`, `PaginatedComments`, `CommentPageContext`, and `CommentEntityType` models; the `CommentRepository` interface; and one use case per repository operation.

**Does NOT own (yet):** Any data source, HTTP mapping, or repository implementation; any Compose UI, `ViewModel`, `UiState`, or previewable content; any DI wiring, route registration, or plugin binding. Those responsibilities currently sit in `features/shared/revivle/` (`RevivleCommentRepositoryImpl`, `RevivleCommentsViewModel`, `RevivleCommentInput`) and are consumed by the `itemdetail` and `outfits` features.

The scaffold's shape signals the target contract for a future data + UI port; nothing in the repo consumes it today.

## Route & Entry Point

_No route or entry point._ The feature exposes no `@Serializable` route object, no `NavGraphBuilder` extension, no `Component`, and no plugin registration. It cannot be navigated to and is not resolvable via `DiProvider.getComponent(...)`.

Intended future contract (once ported):

```kotlin
// Not present in source — placeholder for the future wiring
@Serializable
object CommentRoute
fun NavGraphBuilder.commentRoute(...)
fun NavController.navigateToComment(...)
```

## Key Types

| Type | Description |
|------|-------------|
| `Comment` | Domain model: `id`, `threadId`, `parentId?`, `text`, `status`, `isReported`, `depth`, `entityType`, `itemId?`, `outfitId?`, `userId?`, `createdAt`, `updatedAt`, `replies: List<Comment>?` |
| `Thread` | Comment thread container: `id`, `entityType`, `itemId?`, `outfitId?`, `commentCount`, `createdAt`, `updatedAt` |
| `PaginatedComments` | Wrapper for a page of comments plus a `Pagination` block (`page`, `limit`, `totalItems`, `totalPages`, `hasNext`, `hasPrev`) |
| `CommentPageContext` | Deep-link resolution info: `commentId`, `rootCommentId`, `entityType`, `itemId?`, `outfitId?`, `page`, `indexInPage`, `limit` |
| `CommentEntityType` | Enum: `ITEM`, `OUTFIT` |
| `CommentRepository` | Interface exposing `getCommentsForItem`, `getCommentsForOutfit`, `createCommentForItem`, `createCommentForOutfit`, `getCommentPageContext`, `getComment`, `updateComment`, `deleteComment`, `reportComment`, `getThreadForItem`, `getThreadForOutfit` — all `suspend` returning `Result<T>` |
| `CreateItemCommentUseCase` / `CreateOutfitCommentUseCase` | Wrap the create-comment repo calls; each supports optional `text`, `parentId`, and `imageBytes` |
| `GetItemCommentsUseCase` / `GetOutfitCommentsUseCase` | Paginated fetch (`page`, `limit`) |
| `GetItemCommentThreadUseCase` / `GetOutfitCommentThreadUseCase` | Fetch the parent `Thread` for an entity |
| `GetCommentUseCase` | Fetch one comment, optionally with replies |
| `GetCommentPageContextUseCase` | Resolve a comment id to its page/index for deep-linking |
| `UpdateCommentUseCase` / `DeleteCommentUseCase` / `ReportCommentUseCase` | One-shot mutations |

## UI

_No user-facing screen._ The feature has no `ui/` package. The active comment UI is elsewhere: `features/shared/revivle/ui/RevivleCommentsViewModel.kt` drives it, `features/shared/revivle/ui/components/comments/RevivleCommentInput.kt` provides the composer, and `itemdetail` / `outfits` embed the results inside their own detail screens.

## Architecture

```
comment/
├── docs/
│   └── user_stories.md                     # 5 user stories (view, post, manage, deep-link, report)
└── domain/
    ├── model/
    │   ├── Comment.kt
    │   ├── CommentEntityType.kt
    │   ├── CommentPageContext.kt
    │   ├── PaginatedComments.kt            # + Pagination
    │   └── Thread.kt
    ├── repository/
    │   └── CommentRepository.kt            # 11 suspend methods
    └── usecase/
        ├── CreateItemCommentUseCase.kt
        ├── CreateOutfitCommentUseCase.kt
        ├── DeleteCommentUseCase.kt
        ├── GetCommentPageContextUseCase.kt
        ├── GetCommentUseCase.kt
        ├── GetItemCommentThreadUseCase.kt
        ├── GetItemCommentsUseCase.kt
        ├── GetOutfitCommentThreadUseCase.kt
        ├── GetOutfitCommentsUseCase.kt
        ├── ReportCommentUseCase.kt
        └── UpdateCommentUseCase.kt
```

There is no `data/` layer and no `ui/` layer. The 11 use cases stand alone with no implementation of `CommentRepository` in the codebase.

## Data Flow

_No runtime data flow — the feature is not wired._ The intended flow (per the domain shape and `docs/user_stories.md`) is:

1. A future `CommentScreen` / `CommentViewModel` calls `GetItemCommentsUseCase(itemId, page, limit)` (or the outfit equivalent) on entry → `Loading` → `Success(PaginatedComments)`.
2. Composer submit calls `CreateItemCommentUseCase(itemId, text, parentId, imageBytes)`; a reply passes the parent's `id` as `parentId`.
3. Menu actions on an owned comment call `UpdateCommentUseCase(commentId, text)` or `DeleteCommentUseCase(commentId)` (delete is expected to soft-delete per the user stories).
4. "Report" menu on another user's comment calls `ReportCommentUseCase(commentId)`.
5. Deep link resolution first calls `GetCommentPageContextUseCase(commentId)` to discover `page` and `indexInPage`, then `GetItemCommentsUseCase(itemId, page)` (or outfit) to load the containing page and scroll to `indexInPage`.
6. Every use case funnels its repo call through `core.domain.model.safeCall`, so errors surface as `Result.failure` for the caller to map to a `UiState.Error`.

## Dependencies

- **Own:** None — no data source, no repository implementation, no ViewModel.
- **Core:** `com.otiasj.core.domain.model.safeCall` (used by every use case).
- **Cross-feature:** None. Nothing outside `features/comment/` imports from this package, and this package imports nothing from other features.
- **Compose Resources:** None (no UI).
- **Navigation:** None (no route).

## Known Issues / Drift

- **Feature is entirely unwired — dead code as of 2026-08-01.** No `CommentRepository` implementation, no `Component`, no `AppPlugin` binding. Nothing under `composeApp/src` outside `features/comment/` imports from `com.otiasj.features.comment.*`.
- **Duplicates the active `shared/revivle` comment surface.** `RevivleCommentRepositoryImpl` and the `Revivle*CommentUseCase` set already cover the same operations and are wired into `ItemDetailComponent` and `OutfitComponent`. Without an explicit migration plan (data impl → cut over `itemdetail`/`outfits` → delete Revivle equivalents) the two surfaces will drift.
- **Missing `data/`, `ui/`, and `Component` layers.** Convention (`template.md`, `AGENTS.md`) requires `data/datasource/` + `data/repository/`, a `Screen` / `Pane` / `Content` split with `@Preview`s and a `sealed interface UiState`, and an `XxxComponent` registered by a plugin. None of the three exist.
- **Every use case double-wraps `safeCall`.** Each `invoke(...)` is `safeCall { val result = repository.xxx(...); if (result.isSuccess) result.getOrThrow() else throw result.exceptionOrNull() ?: Exception("Unknown ...") }`. Since `CommentRepository` already returns `Result<T>`, the outer wrap is redundant. Same drift called out on [template](template.md). Fix by trusting the repo's `Result` or dropping `Result` from the repo signature.
- **`imageBytes: ByteArray?` on create use cases lacks a contract** (MIME, size cap, multipart vs base64). Capture as KDoc or a `CommentAttachment` value type before the data layer lands.
- **`Comment.status: String` is stringly-typed.** Should be an enum modelled on Revivle's status vocabulary (see `RevivleComment`).
- **No tests.** `commonTest/kotlin/com/otiasj/features/comment/` does not exist. The parallel Revivle stack is fully covered; mirror its shape when the data + UI land.
- **No package README or KDoc flagging the port status.** A reviewer cannot tell the package is unwired without grepping.

## Tests

No tests yet. The parallel `features/shared/revivle/` implementation has full coverage (`RevivleCommentsViewModelTest`, `RevivleCommentRepositoryImplTest`, `RevivleCommentRemoteDataSourceTest`, `RevivleCommentMapperTest`, and one test per Revivle comment use case) which should be the reference when this feature grows a data + UI layer. See [QA sweep](../index.md) for coverage status.

## See Also

- [shared](shared.md) — hosts the currently-wired `RevivleCommentRepository`, `RevivleCommentsViewModel`, and `RevivleCommentInput` that this feature is meant to eventually replace
- [itemdetail](itemdetail.md) — active consumer of the Revivle comment stack via `ItemDetailComponent.itemCommentRepository`
- [outfits](outfits.md) — active consumer of the Revivle comment stack via `OutfitComponent.commentRepository`
- [template](template.md) — canonical shape that this feature will need to grow into (Component + data + ui + tests)
- [notifications](notifications.md) — one of the notification types is comment-related; a wired comment feature should coordinate mark-read semantics with it

_Last updated: 2026-08-01_
