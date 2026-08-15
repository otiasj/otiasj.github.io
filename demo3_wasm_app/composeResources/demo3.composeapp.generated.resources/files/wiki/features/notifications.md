---
type: feature
title: Notifications
description: Displays the user's notification feed with unread tracking, mark-as-read,
  and pagination.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/notifications/]
tags: [demo3, feature, notifications]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Notifications

## Purpose
Displays the user's notification feed with unread tracking, mark-as-read, and pagination.

Location: `features/notifications/`

## Responsibility
**Owns:** Fetching and displaying notifications, mark-single and mark-all-as-read, unread count polling, pagination.

**Does NOT own:** Push notification delivery, deep-link resolution from notification taps (handled by caller via `resolveNotificationClick` lambda), badge rendering on tabs.

## Route & Entry Point
```kotlin
@Serializable
object NotificationsRoute

fun NavGraphBuilder.notificationsScreenRoute(
    resolveNotificationClick: (Notification) -> (() -> Unit)?,
    contentPadding: PaddingValues = PaddingValues()
)
```
ViewModel obtained via `DiProvider.getComponent(NotificationsComponent::class).notificationsViewModel`.

## Key Types
| Type | Description |
|------|-------------|
| `NotificationsComponent` | DI component; wires API, repository, use cases, ViewModel, and `unreadCountFlow` |
| `NotificationsViewModel` | Core `ViewModel<NotificationsUiState>` -- load, paginate, mark read with optimistic updates |
| `NotificationsUiState` | State: notifications list, loading flags, pagination, markAllRead flag, error |
| `Notification` | Domain model with id, type, title, body, link, isRead, createdAt |
| `NotificationType` | Enum of 13 notification types (offers, transactions, comments, reservations) |
| `NotificationRepository` | Interface with getNotifications, getUnreadCount, markAsRead, markAllAsRead |
| `NotificationRepositoryImpl` | Maps `NotificationsApi` responses to domain models |

## Architecture
**Layers:** `data` (repository impl), `domain/model` + `domain/repository` + `domain/usecase`, `ui` (screen, ViewModel, components).

**DI:** `NotificationsComponent` follows `DiProvider` pattern. Creates own `LoggingHttpClient` + `AuthTokenProvider`.

**Notable patterns:**
- **Unread count polling:** `unreadCountFlow` is a `StateFlow<Int>` built from a `flow { while(true) }` loop with 30-second interval, shared via `stateIn(WhileSubscribed(5000))`. This is exposed for badge display on the tab bar.
- **Optimistic updates:** `markAsRead()` and `markAllAsRead()` update UI immediately, reverting on API failure.
- **Page-based pagination:** Uses simple page number (not `Cursor`), with `hasNextPage` from API response.
- Four focused use cases: `GetNotificationsUseCase`, `GetUnreadCountUseCase`, `MarkNotificationReadUseCase`, `MarkAllNotificationsReadUseCase`.

## Data Flow
1. `init` block calls `loadNotifications()` for page 1.
2. `LazyColumn` `itemsIndexed` triggers `loadMore()` when last item is rendered.
3. Tapping a notification calls `resolveNotificationClick` (caller-provided navigation) and `markAsRead()`.
4. "Mark all read" button appears when any notification is unread; calls `markAllAsRead()`.
5. `unreadCountFlow` polls independently in `NotificationsComponent.componentScope` for badge updates.

## Dependencies
- **Core:** `ViewModel<T>`, `DiProvider`, `LoggingHttpClient`, `AuthTokenProvider`, `Configuration`, `AnalyticsManager`, `safeCall`, `TimeUtils`.
- **Generated API:** `com.revivle.api.client.apis.NotificationsApi`.
- **UI:** `EmptyState`, `ErrorState` (uses simplified string-based overloads), `LazyColumn` (no `CursorPaginationGrid`).
- **No cross-feature imports.**

## Known Issues / Drift
- **UiState in domain package:** `NotificationsUiState` lives in `domain.model` instead of `ui`. This is a minor packaging convention violation -- UI state should reside in the `ui` layer.
- **No DataSource layer:** `NotificationRepositoryImpl` calls `NotificationsApi` directly. Convention requires a `RemoteDataSource` intermediary.
- **Simplified ErrorState usage:** Uses `ErrorState(message, onRetry)` overload instead of the `Error` sealed class used elsewhere.
- **Page-based pagination without Cursor:** Uses raw `Int` page numbers rather than the `Cursor.Page` pattern used by marketplace/mycloset. Minor inconsistency but functional.
- Uses core `ViewModel<T>` and `DiProvider` correctly. No cross-feature imports.

## Tests

`commonTest` refactored to use Turbine in #416, extended in #519:

| File | What it tests |
|------|---------------|
| `ui/NotificationsViewModelTest.kt` | ViewModel state transitions (loading → success/error, unread count polling) using Turbine flow assertions. |
| `NotificationsComponentTest.kt` | Component wiring smoke test — verifies `NotificationsComponent` can be instantiated and resolves its ViewModel and repository dependencies without error (#519). |

## See Also
- [mycloset](mycloset.md) -- similar list+pagination pattern
- [onboarding](onboarding.md) -- similarly self-contained feature

_Last updated: 2026-05-16_
