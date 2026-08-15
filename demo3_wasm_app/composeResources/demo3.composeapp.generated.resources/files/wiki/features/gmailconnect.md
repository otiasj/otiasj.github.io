---
type: feature
title: Gmail Connect
description: Full-stack OAuth onboarding flow that authorises the app to access a
  user's Gmail account via the Revivle backend integration API.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/gmailconnect/]
tags: [demo3, feature, gmailconnect]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Gmail Connect

## Purpose
Full-stack OAuth onboarding flow that authorises the app to access a user's Gmail account via
the Revivle backend integration API.

Location: `features/gmailconnect/`

## Responsibility

Guides the user through a Gmail OAuth connection: bootstraps the authenticated user record in the
backend, retrieves an OAuth URL, opens it in the platform browser, handles the deep-link callback,
and navigates to onboarding on success. Also supports disconnect and sync-trigger operations via
the repository layer.

## Route & Entry Point

Route string: `"gmail_connect"` (constant `GMAIL_CONNECT_ROUTE`).

```kotlin
// Register
NavGraphBuilder.gmailConnectScreenRoute(
    onNavigateToOnboarding = { ... },
    onNavigateToHome = { ... }
)

// Navigate
navController.navigateToGmailConnect()   // clears back-stack to start destination
```

The composable pulls `GmailConnectComponent` from `DiProvider`, reads
`component.gmailConnectViewModel`, and observes both `uiState` (StateFlow) and `events`
(SharedFlow) via `LaunchedEffect`.

## Key Types

| Class / Interface | Layer | Role |
|---|---|---|
| `GmailConnectComponent` | DI | Manual DI wiring; switches real vs mock via `useMocks` flag |
| `GmailConnectViewModel` | UI | Drives state machine; emits one-shot `GmailConnectEvent`s |
| `GmailConnectUiState` | UI | Sealed interface: `Idle`, `Bootstrapping`, `Connecting`, `Canceling` |
| `GmailConnectEvent` | UI | Sealed class: `OpenOAuthUrl`, `NavigateToOnboarding`, `NavigateToHome` |
| `BootstrapUserUseCase` / `BootstrapUserUseCaseImpl` / `MockBootstrapUserUseCase` | Domain | Creates user record in backend after Clerk auth |
| `GetGmailConnectionStatusUseCase` / `GetGmailConnectionStatusUseCaseImpl` / `MockGetGmailConnectionStatusUseCase` | Domain | Polls current Gmail connection status |
| `StartGmailConnectUseCase` / `StartGmailConnectUseCaseImpl` / `MockStartGmailConnectUseCase` | Domain | Initiates OAuth, returns `GmailConnectResult.Success(authUrl)` |
| `GmailRepository` (interface) | Domain | startConnect / getConnectionStatus / disconnect / triggerSync |
| `GmailRepositoryImpl` | Data | Wraps datasource calls in `safeCall {}` error handling |
| `GmailRemoteDataSource` (interface) | Data | Raw API surface |
| `GmailRemoteDataSourceImpl` | Data | Calls generated `IntegrationsGmailApi` Ktor client |
| `GmailConnectResult` | Domain model | `Success(authUrl, state?)` or `Error(message)` |
| `GmailStatus` | Domain model | Connection metadata; computed `syncStatus: SyncStatus` enum |
| `BootstrapResult` | Domain model | `Success` or `Error(message)` |

## Architecture

Clean architecture with three explicit layers and a manual DI component:

```
GmailConnectScreen (Compose)
    └── GmailConnectViewModel : ViewModel
            ├── StartGmailConnectUseCase(Impl|Mock)
            └── OAuthBrowserLauncher (platform)

GmailConnectComponent (DI)
    ├── GmailRemoteDataSource → GmailRemoteDataSourceImpl
    │       └── IntegrationsGmailApi (generated Ktor client)
    ├── GmailRepository → GmailRepositoryImpl
    └── Use cases (real or mock, controlled by useMocks flag)
```

Every use case follows the `interface + Impl + Mock` pattern, allowing UI-only development without
a running backend.

## Data Flow

**Happy path — connect Gmail:**

1. User taps "Continue" → `GmailConnectViewModel.onConnectGmailClicked()`.
2. State transitions to `Connecting`.
3. `StartGmailConnectUseCaseImpl.invoke()` calls `GmailRepositoryImpl.startConnect(successUrl, failureUrl)`.
4. Repository delegates to `GmailRemoteDataSourceImpl.startConnect()` → `IntegrationsGmailApi.integrationsGmailConnectStartPost()`.
5. On success, `GmailConnectResult.Success(authUrl)` bubbles up; ViewModel emits `GmailConnectEvent.OpenOAuthUrl(authUrl)`.
6. Screen's `LaunchedEffect` calls `OAuthBrowserLauncher.launchOAuth(url)` (platform Custom Tabs / ASWebAuthenticationSession).
7. User authenticates; Google redirects to `revivle://oauth/gmail/success` deep link.
8. `DeepLinkHandler.oauthCallbacks` emits `OAuthCallbackResult.Success`.
9. ViewModel receives callback (via `observeOAuthCallbacks()`), emits `GmailConnectEvent.NavigateToOnboarding`.
10. Screen navigates to onboarding.

**Error paths:** `OAuthCallbackResult.Failure` sets `Idle(error=…)`; `GmailConnectResult.Error` also
sets `Idle(error=…)`. Errors surface as `SnackbarHostState` messages. User can dismiss via
`onErrorDismissed()` which clears `error` without changing the loading sub-state.

## Dependencies

- `core/data/datasource/remote/auth` — `AuthTokenProvider`, `LoggingHttpClient`
- `core/config` — `Configuration.myClosetApiBaseUrl`
- `core/domain/model` — `safeCall` extension
- `platform/oauth` — `OAuthBrowserLauncher`, `DeepLinkHandler`, `OAuthCallbackResult`
- `revivle-api-client` (generated) — `IntegrationsGmailApi`, `GmailConnectionStatus`,
  `IntegrationsGmailConnectStartPost200Response`, `AuthenticationApi`
- `core/di` — `DiProvider`

## Known Issues / Drift

- `BootstrapUserUseCase` is defined in this package and its `Impl` references `AuthenticationApi`,
  but it is **not wired** into `GmailConnectComponent` or `GmailConnectViewModel`. The bootstrap
  step appears to be a planned or formerly used hook that is currently dead code in the feature.
- `GmailConnectUiState.Bootstrapping` is defined and rendered (`InitialLoadingState`) but the
  ViewModel never transitions into that state — `_uiState` starts as `Idle`.
- `triggerSync` is declared on `GmailRepository` and implemented in `GmailRepositoryImpl` /
  `GmailRemoteDataSourceImpl`, but there is no use case or ViewModel surface for it within this
  feature module.
- Deep-link registration (URL scheme `revivle://oauth/gmail/*`) must be configured per-platform in
  `AndroidManifest.xml` and the iOS `Info.plist`; missing registration silently drops the callback.

## Tests

`commonTest` coverage added in #375 and extended in #512, further extended in #564 / #565:

| File | What it tests |
|------|---------------|
| `FakeGmailRepository.kt` | In-memory stub implementing `GmailRepository`. |
| `GmailRepositoryTest.kt` | Unit tests for repository behaviour via the fake. |
| `FakeStartGmailConnectUseCase.kt` | Stub for `StartGmailConnectUseCase`. |
| `data/datasource/FakeAuthenticationApi.kt` | Fake Ktorfit `AuthenticationApi` for data-layer isolation (#512). |
| `domain/usecase/BootstrapUserUseCaseTest.kt` | Tests for `BootstrapUserUseCase`: success, already-bootstrapped, API error paths (#512). |
| `ui/GmailConnectViewModelTest.kt` | ViewModel state machine: Idle → Connecting → Connected / Error; OAuth callback handling; `observeOAuthCallbacks` coverage added in #565. |
| `GmailConnectComponentTest.kt` | Component wiring smoke test (#564). |
| `domain/model/BootstrapResultTest.kt` | Domain model equality and serialization (#564). |
| `domain/model/GmailConnectResultTest.kt` | Domain model edge cases (#564). |
| `ui/GmailConnectEventTest.kt` | UI event sealed-class coverage (#564). |

## See Also

- `platform/oauth/DeepLinkHandler.kt` — shared deep-link dispatch
- `platform/oauth/OAuthBrowserLauncher.kt` — platform expect/actual browser launcher
- `features/gallery/` — simpler feature for paging reference
- `core/data/datasource/remote/auth/` — token provider used by the HTTP client

_Last updated: 2026-05-20_
