---
type: feature
title: Push
description: Domain-only feature that manages device push-token registration and routes
  notification taps to in-app destinations — no UI screens or navigation routes.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/push/]
tags: [demo3, feature, push]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Push

## Purpose
Domain-only feature that manages device push-token registration and routes notification taps to in-app destinations — no UI screens or navigation routes.

Location: `features/push/`

## Responsibility

Handles the full push notification lifecycle on the shared (KMP common) side:

1. **Token management** — registers and unregisters the device's push token with the Revivle backend via `DeviceTokensApi`, detecting platform (Android / iOS) automatically.
2. **Notification routing** — receives tap events from platform-native code (Android FCM service, iOS AppDelegate) and emits typed `PushNavigationEvent`s that the Compose `NavHost` can collect and act on.
3. **Link resolution** — maps a notification's `link` URL path and `type` string to a concrete `NavController` navigation call.

There are no `@Composable` screens, no `@Serializable` route objects, and no entries in the app's `NavGraph` belonging to this feature.

## Route & Entry Point

None. This feature is wired at the app level:

- `PushTokenComponent` is registered with `DiProvider` during app startup.
- Platform code calls `PushTokenComponent.registerTokenOnLogin()` / `unregisterTokenOnLogout()` directly.
- Platform notification tap handlers call `PushNotificationRouter.onNotificationTapped(link, type)`.
- The Compose `NavHost` collects `PushNotificationRouter.navigationEvents` and calls `PushLinkResolver.navigate(navController, link, type)`.

## Key Types

| Type | Role |
|---|---|
| `PushTokenComponent` | DI container + lifecycle entry point; exposes `registerPushToken` and `unregisterPushToken`; provides Swift-friendly `getInstanceOrNull()` |
| `RegisterPushTokenUseCase` | Suspending use case; calls `getToken()` lambda then `DeviceTokenRepository.register(token)` |
| `UnregisterPushTokenUseCase` | Mirror of register; calls `DeviceTokenRepository.unregister(token)` |
| `DeviceTokenRepository` | Interface: `register(token)` / `unregister(token)` returning `Result<Unit>` |
| `DeviceTokenRepositoryImpl` | Calls `DeviceTokensApi` with a `DeviceTokenRegisterRequest` / `DeviceTokenDeleteRequest` |
| `PushNotificationRouter` | Singleton `object`; holds a `MutableSharedFlow<PushNavigationEvent>` with buffer of 1; platform calls `onNotificationTapped()`, UI collects `navigationEvents` |
| `PushNavigationEvent` | Data class: `link: String`, `type: String?` |
| `PushLinkResolver` | Singleton `object`; maps `(link, type)` to `NavController` actions using `NotificationType` enum |

## Architecture

```
PushTokenComponent.kt        DI container / lifecycle entry point
PushNotificationRouter.kt    Singleton event bus (SharedFlow)
PushLinkResolver.kt          Pure routing logic (no state)
domain/repository/
  DeviceTokenRepository.kt   Interface
domain/usecase/
  RegisterPushTokenUseCase.kt
  UnregisterPushTokenUseCase.kt
data/
  DeviceTokenRepositoryImpl.kt  Calls DeviceTokensApi
```

The feature deliberately has no ViewModel — all objects are either use cases (stateless, suspend-based) or singletons (`PushNotificationRouter`, `PushLinkResolver`). `PushTokenComponent` owns a `CoroutineScope(SupervisorJob() + Dispatchers.Main)` for the `registerTokenOnLogin` / `unregisterTokenOnLogout` fire-and-forget launchers.

## Data Flow

### Token registration (login)
```
Platform login success
  → PushTokenComponent.registerTokenOnLogin()
    → componentScope.launch { RegisterPushTokenUseCase.execute() }
      → getToken() (platform lambda, e.g. FCM token fetch)
      → DeviceTokenRepositoryImpl.register(token)
        → DeviceTokensApi.registerDeviceToken(DeviceTokenRegisterRequest(token, platform))
```

### Notification tap routing
```
Platform notification tap (Android FCM / iOS AppDelegate)
  → PushNotificationRouter.onNotificationTapped(link, type)
    → _navigationEvents.tryEmit(PushNavigationEvent(link, type))
      → NavHost LaunchedEffect collects event
        → PushLinkResolver.navigate(navController, link, type)
          → resolves NotificationType, extracts ID from last URL path segment
          → navController.navigate(ItemDetailRoute(...)) or NotificationsRoute or navigateToOutfitDetail(...)
```

### Platform detection
`PushTokenComponent` reads `getPlatform().name.lowercase()` to set `DeviceTokenRegisterRequest.Platform` (`.Android` or `.Ios`); defaults to Android for unknown platforms.

## Dependencies

- `DeviceTokensApi` (Revivle generated client) — `POST /device-tokens`, `DELETE /device-tokens`
- `LoggingHttpClient.createAuthenticated(tokenProvider)` — authenticated Ktor client
- `Configuration.myClosetApiBaseUrl`
- `features/notifications/domain/model/NotificationType` — enum for routing decisions
- `features/notifications/ui/NotificationsRoute` — fallback navigation target
- `features/itemdetail/ui/ItemDetailRoute` — primary deep-link target
- `features/outfits/ui/navigateToOutfitDetail` — outfit deep-link target
- `core/di/DiProvider` — component lookup from Swift via `getInstanceOrNull()`

## Known Issues / Drift

- `RegisterPushTokenUseCase` lives in package `com.revivle.features.push.domain.usecase` (note `com.revivle` prefix) while `UnregisterPushTokenUseCase` lives in `com.otiasj.features.push.domain.usecase`. This package inconsistency is a leftover and could cause confusion when searching by package.
- `PushNotificationRouter` uses `tryEmit` with `extraBufferCapacity = 1`. A tap that arrives before the NavHost has started collecting will be delivered; a second tap arriving within the same frame will be dropped silently.
- `PushTokenComponent` platform detection uses a loose string-contains check (`"android"`, `"ios"`) rather than a `expect/actual` platform enum — fragile if `getPlatform().name` changes format.
- No retry logic on token registration failure; errors are logged but not surfaced to the user or reported to analytics.

## Tests

Comprehensive `commonTest` suite added in #423, extended in #559:

| File | What it tests |
|------|---------------|
| `data/DeviceTokenRepositoryImplTest.kt` | Repository registration/unregistration flows, token caching, error handling. |
| `PushTokenComponentTest.kt` | Component wiring smoke test: verifies `PushTokenComponent` resolves its repository and use cases without error (#559). |

## See Also

- `features/notifications/` — notification list UI and `NotificationType` enum
- `features/profile/` — `PushTokenComponent.unregisterTokenOnLogout()` should be called on sign-out
- `features/itemdetail/` — primary deep-link destination
- `features/outfits/` — outfit deep-link destination
- `.wiki/apps/demo3/features/profile.md`

_Last updated: 2026-05-20_
