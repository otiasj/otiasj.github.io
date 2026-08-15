---
type: feature
title: Messaging
description: Buyer-seller real-time conversations for the Revivle closet marketplace.
  UI layer restored and wired into PortedFeaturesPlugin; accessible from the desktop
  dev launcher.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/messaging/]
tags: [demo3, feature, messaging, revivle]
timestamp: '2026-07-03T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Messaging

> **Status: Active (dev launcher).** UI restored — `MessagingScreen.kt`, `MessagingViewModel.kt`, and `MessagingUiState.kt` are back. `MessagingComponent` is registered by `PortedFeaturesPlugin` (not `RevivlePlugin`) and is reachable from the desktop-only `PORTED_FEATURES_COLLECTION` dev launcher.

## Purpose
Real-time buyer–seller messaging: conversations between buyers and sellers about closet items, backed by the Revivle REST API. Currently wired into the ported-features dev launcher rather than the main Revivle shell.

Location: `features/messaging/`

## Current State

| Layer | Status |
|-------|--------|
| `ui/` | **Restored** — `MessagingScreen.kt`, `MessagingViewModel.kt`, `MessagingUiState.kt` present |
| `domain/model/` | Present — `Conversation`, `Message`, `ConversationItem`, `ConversationParticipant`, `MessagingDefaults`, `PaginatedConversations`, `PaginatedMessages`, `PaginationInfo`, `UnreadCount` |
| `domain/repository/` | Present — `MessagingRepository` interface |
| `domain/usecase/` | Present — 7 use cases (see below) |
| `data/repository/` | Present — `MessagingRepositoryImpl` wrapping generated `MessagingApi` |
| `MessagingComponent` | Fully wired — provides `messagingViewModel: MessagingViewModel`; registered by `PortedFeaturesPlugin` |
| Tests | `commonTest/MessagingViewModelTest.kt`, `MessagingRepositoryImplTest.kt`, `MessagingUseCasesTest.kt`; `FakeMessagingRepository`; `desktopTest/MessagingVisualDiffTest.kt` |

## Route & Entry Point

```kotlin
@Serializable object MessagingRoute

fun NavController.navigateToMessaging()
fun NavGraphBuilder.messagingRoute(onNavigateBack, contentPadding)
```

Registered inside `PortedFeaturesPlugin.homeRoutes`. Accessible from `PORTED_FEATURES_COLLECTION` (desktop only) via the "Messaging" launcher entry. The `"inbox"` bottom-nav entry in `Features.kt` still routes to `NotificationsRoute` (unchanged).

## Key Types

| Type | Description |
|------|-------------|
| `MessagingComponent` | Full DI component; wires `MessagingApi`, `AuthTokenProvider`, `LoggingHttpClient`, `MessagingRepository`, all 7 use cases, and `MessagingViewModel`. Registered by `PortedFeaturesPlugin`. |
| `MessagingViewModel` | Extends `ViewModel<MessagingUiState>`. Polling-based unread count (30 s loop), optimistic message send with rollback, per-conversation read-deduplication, pagination. |
| `MessagingUiState` | Sealed: `Loading`, `Empty`, `Success(conversations, activeConversationId, activeConversation, messages, pagination, unreadCount, currentUserId?, isRefreshing, isSendingMessage, isLoadingMessages, isLoadingMoreMessages, hasMoreMessages)`, `Error(error?, message?)`. |
| `MessagingScreen` | Two-pane Compose screen: conversation list on the left, active thread on the right. `LazyColumn` for both lists; `EditTextField` + send button for message input. Own-bubble detection falls back to `temp-` prefix on optimistic messages (see `PORTING_ISSUES.md › missing-current-user-usecase`). |
| `MessagingRepository` | Interface — conversation CRUD, paginated message history, send, mark-as-read, unread count |
| `MessagingRepositoryImpl` | Data impl wrapping generated `MessagingApi` |
| `Conversation` | Domain model: id, participants, lastMessage, itemReference, unreadCount, createdAt |
| `Message` | `id`, `conversationId`, `senderId`, `content`, `createdAt`, `isSystemMessage` |
| `ConversationItem` | Closet item embedded in a conversation (id, title, imageUrl, price) |

## Domain Use Cases

Ably realtime observe-variants were removed when the UI was re-ported; the current layer uses REST polling only:

| Use Case | Description |
|----------|-------------|
| `GetConversationsUseCase` | Paginated conversation list |
| `GetConversationUseCase` | Single conversation by ID |
| `GetMessagesUseCase` | Paginated message history for a conversation |
| `CreateConversationUseCase` | Create a new conversation |
| `SendMessageUseCase` | Send a message to a conversation |
| `GetUnreadCountUseCase` | Fetch aggregate unread count |
| `MarkConversationAsReadUseCase` | Mark a conversation as read |

## UiState Flow

1. `MessagingViewModel` starts in `Loading`.
2. `getConversationsUseCase` → `Success` (or `Empty`/`Error`).
3. User taps conversation → `Success.copy(activeConversationId, isLoadingMessages=true)`.
4. `getMessagesUseCase` loads thread → `Success.copy(messages, pagination)`.
5. User sends → optimistic message appended, `isSendingMessage=true`; on error rolled back.
6. Unread count polled every 30 s via a background `Job`; updates `Success.unreadCount`.

## Dependencies

- **Core:** `LoggingHttpClient`, `AuthTokenProvider`, `Configuration.myClosetApiBaseUrl`, `AnalyticsManager`
- **Generated API:** `com.revivle.api.client.apis.MessagingApi`
- **Known limitations:** `currentUserId` remains `null` until a current-user use case is injected (`PORTING_ISSUES.md › missing-current-user-usecase`); Ably realtime SDK not available on KMP (`porting_issues.json › ably-realtime-sdk`).

## Tests

| File | What it tests |
|------|---------------|
| `commonTest/…/MessagingRepositoryImplTest.kt` | Repository layer |
| `commonTest/…/MessagingUseCasesTest.kt` | Domain use cases |
| `commonTest/…/MessagingViewModelTest.kt` | ViewModel state transitions using `FakeMessagingRepository` |
| `commonTest/…/FakeMessagingRepository.kt` | Test double |
| `desktopTest/…/MessagingVisualDiffTest.kt` | Desktop screenshot visual diff (integration) |

User stories are in `features/messaging/docs/user_stories.md`; porting issues in `docs/porting_issues.json`.

## See Also
- [app-shell](../app-shell.md) — `PortedFeaturesPlugin` and `PORTED_FEATURES_COLLECTION`
- [notifications](notifications.md) — current `"inbox"` bottom-nav route
- [mycloset](mycloset.md) — `ConversationItem` surfaces closet item metadata

_Updated: 2026-07-03 — UI fully restored (`MessagingScreen`, `MessagingViewModel`, `MessagingUiState`). `MessagingComponent` re-wired with ViewModel and registered by `PortedFeaturesPlugin`. Full test suite added (`MessagingRepositoryImplTest`, `MessagingUseCasesTest`, `MessagingViewModelTest`, `FakeMessagingRepository`). Feature accessible from desktop `PORTED_FEATURES_COLLECTION` launcher._
_Previous: 2026-06-25 — UI layer deleted (commit ac3a27c). `MessagingComponent` unregistered from `RevivlePlugin`. Domain/data layers preserved._
_Created: 2026-06-24 — New feature: Revivle messaging (commit 0aa58b3)._
