---
type: feature
title: Webpage
description: Embeds the Revivle web app inside a native WebView, bridging authentication
  via a short-lived server ticket and surfacing a native Clerk user button on demand.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/webpage/]
tags: [demo3, feature, webpage]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Webpage

## Purpose
Embeds the Revivle web app inside a native WebView, bridging authentication via a short-lived server ticket and surfacing a native Clerk user button on demand.

Location: `features/webpage/`

## Responsibility

Authenticates the current user against the backend, exchanges the session for a one-time `webview-ticket`, then loads the web app at `/auth/mobile-bridge?ticket=…` inside a platform WebView. It also handles two-way communication: the web page can trigger native UI (Clerk user button) via custom URL schemes, and OAuth deep-link callbacks from the OS are forwarded back into the WebView as redirect URLs.

## Route & Entry Point

- Route object: `WebPage` (`@Serializable object WebPage` in `WebpageScreen.kt`)
- Navigation helper: `NavController.navigateToWebpageScreen()`
- DI entry point: `WebpageComponent(authTokenProvider: AuthTokenProvider)` — constructed externally and registered with `DiProvider`; exposes `webpageScreenViewModel` lazily (also pulls `AnalyticsManager` from `AnalyticsModule`).

## Key Types

| Type | Role |
|------|------|
| `WebpageComponent` | Feature DI root; holds `AuthTokenProvider` |
| `WebpageScreenViewModel` | Drives the UI state machine; fetches the ticket, builds `WebViewConfig`, handles OAuth callbacks |
| `WebpageUIState` | Sealed interface: `Loading`, `Error`, `NeedsNativeAuth`, `SignedOut`, `Loaded(webviewConfig, webViewState)` |
| `WebViewConfig` | Platform abstraction: `url`, `showNavigationControls`, `showLoadingIndicator`, `openExternalUrl`, `urlChangeCallback` |
| `WebViewState` | Platform abstraction: mutable holder with a `loadUrl` lambda for imperative navigation |
| `NativeClerkUserButton` | `expect` Composable — shown/hidden in response to `revivle://showuserbutton` / `revivle://hideuserbutton` URL scheme signals; calls `onSignedOut` when the user signs out |
| `WebviewTicketResponse` | Private `@Serializable` data class wrapping the `ticket` string from `/api/auth/webview-ticket` |

## Architecture

Clean architecture, three-layer: domain → data → UI.

```
features/webpage/
  WebpageComponent.kt                          — DI root; wires repository + use case + VM
  WebpageScreenViewModel.kt                    — ViewModel + UIState
  NativeClerkUserButton.kt                     — expect declaration
  domain/
    repository/WebpageRepository.kt            — interface: getWebviewTicket(): String
    usecase/GetWebviewTicketUseCase.kt          — invokes repository, returns ticket string
  data/
    repository/WebpageRepositoryImpl.kt        — Ktor POST to /api/auth/webview-ticket
```

`WebpageComponent` lazily constructs the chain: `LoggingHttpClient.createAuthenticated(authTokenProvider)` → `WebpageRepositoryImpl` → `GetWebviewTicketUseCase` → `WebpageScreenViewModel`.

Platform WebView integration is provided by `platform/webview/` (outside this feature).

## Data Flow

1. Screen calls `viewModel.loadWebApp()` on first composition.
2. `WebpageScreenViewModel` checks `AuthTokenProvider.getToken()`; if null, transitions to `NeedsNativeAuth`.
3. On valid token, `LoggingHttpClient.createAuthenticated(authTokenProvider)` POSTs to `${Configuration.webAppBaseUrl}/api/auth/webview-ticket`.
4. The `ticket` from the response is appended to the bridge URL: `/auth/mobile-bridge?ticket=…`.
5. A `WebViewConfig` is built with a `urlChangeCallback` that intercepts `revivle://showuserbutton` and `revivle://hideuserbutton` to toggle `_showNativeUserButton: MutableStateFlow<Boolean>`.
6. An `openExternalUrl` lambda in `WebViewConfig` routes out-of-app OAuth flows through `createOAuthBrowserLauncher().launchOAuth(url)`.
7. `observeOAuthCallbacks()` collects from `DeepLinkHandler.oauthCallbacks`; on `OAuthCallbackResult.Success` or `Failure`, it calls `webViewState.loadUrl?.invoke(...)` to redirect the WebView to the result path.

## Dependencies

- `core/data/datasource/remote`: `LoggingHttpClient`
- `core/data/datasource/remote/auth`: `AuthTokenProvider`
- `core/data/analytics`: `AnalyticsManager`
- `core/config`: `Configuration` (provides `webAppBaseUrl`)
- `core/di`: `DiProvider`, `AnalyticsModule`
- `core/ui`: base `ViewModel`
- `platform/webview`: `WebViewConfig`, `WebViewState`
- `platform/oauth`: `DeepLinkHandler`, `OAuthCallbackResult`, `createOAuthBrowserLauncher`
- Ktor: `ktor-client-core` (for the ticket POST)
- KotlinX: `kotlinx-serialization`
- Clerk SDK (platform-specific, consumed via `NativeClerkUserButton` actuals)

## Recent Changes

`WebpageScreen.kt` updated in "Port back from revivle":
- Sign-out callback split into `onSignedOut` (external caller) and `onNativeSignedOut` (defaults to `onSignedOut` but can be overridden to perform web-app cleanup first before proceeding). The new flow is: web page clears its own state → then `onNativeSignedOut` triggers. The ViewModel exposes `performNativeSignOut(onSignedOut)` so it can call `clearWebViewStorage` (via the new `platform/webview/ClearWebViewStorage.kt` expect/actual) before handing off.
- Previews wrapped in `RevivleTheme` for accurate theming.
- New `@Preview` composables added: `WebpageScreenPreview` (full-screen loaded state) and `WebpageLayoutPreview` (layout-only, with stub web content).

## Known Issues / Drift

- `NativeClerkUserButton.kt` is only an `expect` declaration in common; if a platform actual is missing, the feature will not compile for that target.
- The `SignedOut` state is declared in `WebpageUIState` but is never emitted by `WebpageScreenViewModel`; no code path currently transitions to it.
- Error recovery is minimal: both an unauthenticated user and a network failure land on the generic `Error` state with no retry action.

## See Also

- `platform/webview/` — `WebViewConfig` and `WebViewState` platform abstractions
- `platform/oauth/` — `DeepLinkHandler` and OAuth browser launcher
- `core/data/datasource/remote/auth/AuthTokenProvider` — token lifecycle

_Last updated: 2026-05-21_
