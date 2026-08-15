---
type: feature
title: Dev Menu
description: An in-app developer panel — accessible via a draggable FAB — for inspecting
  build info, viewing network logs, editing runtime config overrides, and triggering
  debug actions.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/devmenu/]
tags: [demo3, feature, devmenu]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Dev Menu

## Purpose
An in-app developer panel — accessible via a draggable FAB — for inspecting build info, viewing network logs, editing runtime config overrides, and triggering debug actions.

Location: `features/devmenu/`

## Responsibility

**Owns:** the floating dev button overlay, the developer menu overlay/screen, config key-value editor, network log viewer, and build info screen.

**Does not own:** the actual configuration values (delegated to `core.config.Configuration`), network interceptors (logs are read-only here), or any production user-facing flows. The feature is expected to be compiled out or unreachable in release builds.

## Route & Entry Point

The dev menu does not use a top-level `@Serializable` route on the main nav graph. Instead it is overlaid on the root composable. Sub-screens register their own routes:

```kotlin
@Serializable
object ConfigEditor
```

`NavGraphBuilder.configEditorScreenRoute(onNavigateBack, contentPadding)` in `ConfigEditorScreen.kt`. `NavController.navigateToConfigEditor()` is the helper.

`DeveloperMenuOverlay` (in `DeveloperMenuScreen.kt`) is a composable overlay that wraps the entire app shell — it is toggled by `FloatingDevButton` without a nav graph entry.

## Key Types

- `FloatingDevButton` — draggable `FloatingActionButton` composable; drag offset tracked in local `remember` state; uses `Build` icon with tertiary container color.
- `DeveloperMenuOverlay` — animated `AnimatedVisibility` overlay (fade + slide); rendered as a `Surface` dialog at 90% width / 75% height over a scrim.
- `DeveloperMenuScreen` — full `Scaffold`-based screen variant used when navigating to the menu as a standalone screen (not overlay mode).
- `DeveloperMenuComponent` — manual DI component; lazily builds an unauthenticated `LoggingHttpClient.create()`, `DesktopTokenRepositoryImpl`, `DesktopAddressRepository`, `SendTokenToDesktopUseCase`, and the `DeveloperMenuViewModel`. Registered in `DiProvider` by `App.kt` so that `DeveloperMenuViewModel` can be accessed via DI if needed.
- `DeveloperMenuViewModel` — extends plain `androidx.lifecycle.ViewModel` (not `core.ui.ViewModel<T>`); manages `DeveloperMenuState` via a raw `MutableStateFlow`. Handles all action dispatch. Constructor now accepts three injectable dependencies (`onClearCache`, `tokenDataSource`, `onResetGmailConnection`) with production defaults, making it testable without `DiProvider`.
- `DeveloperMenuState` — plain `data class`: `isFloatingButtonVisible`, `isMenuVisible`, `menuItems: List<DevMenuItem>`, `message: String?`, `showSendTokenDialog: Boolean`, `desktopAddress: String`, `sendTokenLoading: Boolean`, `tailscalePeers: List<TailscalePeerEntry>`.
- `DeveloperMenuUiState` — `sealed interface`: `Loading`, `Success(state: DeveloperMenuState)` — present in `DeveloperMenuState.kt` but not currently used in the screen flow (screen observes `DeveloperMenuState` directly).
- `DevMenuAction` — `sealed class` with ten `data object` variants: `ClearCache`, `ToggleWebAppMode`, `ViewBuildInfo`, `ViewNetworkLogs`, `ClearAuthToken`, `ResetApp`, `HideFloatingButton`, `EditConfiguration`, `ResetGmailConnection`, `SendTokenToDesktop`.
- `ConfigEditorViewModel` — extends plain `androidx.lifecycle.ViewModel`; reads all keys from `Configuration.keys()`, exposes `ConfigEditorUiState` (sealed: `Loading`, `Success(ConfigEditorState)`) — now correctly uses a sealed UiState wrapper.
- `ConfigEditorUiState` — `sealed interface`: `Loading`, `Success(state: ConfigEditorState)`.
- `ConfigItem` — `data class`: `key`, `currentValue`, `overrideValue`, `isOverridden: Boolean`.
- `NetworkLogsViewModel` — reads in-memory HTTP logs captured by `LoggingHttpClient`; exposes `NetworkLogsUiState` (sealed: `Loading`, `Success(logs: List<NetworkLogEntry>)`).
- `NetworkLogsUiState` — `sealed interface`: `Loading`, `Success(logs: List<NetworkLogEntry>)`.

## `pushtest/` Sub-Package

A `pushtest/` sub-package under `features/devmenu/` implements the Push Notification Tester — a cross-platform devmenu screen for firing FCM pushes directly from any platform. On Desktop the device picker is auto-populated from `TokenRegistryRepository`; on other platforms only the manual-entry fallback is available.

| File | Role |
|---|---|
| `PushTestComponent.kt` | Manual DI component. Accepts an optional `devicesFlow: StateFlow<List<PushDeviceInfo>>?` and optional `fcmSettingsRepository: FcmSettingsRepositoryInterface?` (both populated on Desktop). Exposes `viewModel`. |
| `PushTestViewModel.kt` | Form state (`selectedTokens: MutableStateFlow<Set<String>>` for multi-select, `title`, `body`, `selectedType`, `link`, `isManualTokenExpanded`, `serviceAccountPath`) as separate `MutableStateFlow`s. Drives `PushTestUiState` (`Idle`, `Sending`, `Results(List<PushSendResult>)`). Sends sequentially to all selected tokens and aggregates per-device results. |
| `PushTestUiState.kt` | Sealed variants above — `Results` replaces the old `Success`/`Error` split. |
| `PushDeviceInfo.kt` | Data class: token, platform, display name. |
| `FcmSender.kt` | `fun interface` with a single `suspend send(token, title, body, type?, link?): Result<String>`. `UnsupportedFcmSender` is the non-Desktop stub returning `UnsupportedOperationException`. Desktop provides `FcmV1Sender` (OAuth2 service account via FCM HTTP v1 API). |
| `FcmSettingsRepositoryInterface.kt` | Interface for persisting the service-account JSON path. Desktop: DataStore-backed `FcmSettingsRepository`. |
| `PushSendResult.kt` | Per-device outcome: `deviceLabel`, `token`, `messageId?`, `error?`. |
| `SendTestPushUseCase.kt` | Delegates to `FcmSender.send(…)`. |
| `ui/PushTestScreen.kt` | Composable screen + previews. |

`PushTestComponent.getInstanceOrNull()` is a convenience helper used by the Desktop server screen to wire the device flow into the component without a hard dependency on DI ordering.

## `sendtoken/` Sub-Package

A `sendtoken/` sub-package under `features/devmenu/` implements the mobile side of the Device Token Registry flow:

| File | Role |
|---|---|
| `TokenRegistrationRequest.kt` | `@Serializable` request model shared with the desktop server. `Platform` enum: `Ios`, `Android`. |
| `DesktopAddressRepository.kt` | DataStore-backed persistence of the last-used desktop server address (`desktop_server_address` key). |
| `SendTokenToDesktopUseCase.kt` | Reads the FCM token, resolves platform, POSTs `TokenRegistrationRequest` to `http://{address}/api/token` via Ktor client. Auto-appends `:{DESKTOP_SERVER_PORT}` if no port is specified. |
| `TailscalePeerEntry.kt` | `data class(name: String, address: String)` — a resolved Tailscale peer that can be tapped in the `SendTokenDialog` to pre-fill the address field. |
| `SendTokenDialog.kt` | Composable dialog. When `peers` is non-empty, shows a "Tailscale peers" section above the manual-entry field — tapping a peer fills in its address. Falls back to plain address entry when no peers are available. |

The `SendTokenToDesktop` `DevMenuAction` triggers this flow. `DeveloperMenuViewModel` owns `DesktopAddressRepository` and `SendTokenToDesktopUseCase` directly (no DI component). The dialog visibility, current address, loading state, and Tailscale peer list are tracked in `DeveloperMenuState` via `showSendTokenDialog`, `desktopAddress`, `sendTokenLoading`, and `tailscalePeers`.

## Architecture

The top-level package is flat (`features/devmenu/`) with two sub-packages: `sendtoken/` and `pushtest/`.

`DeveloperMenuComponent` is registered in `DiProvider` by `App.kt` (`DiProvider.registerComponent(developerMenuComponent)`). The `devMenuViewModel` in `AppComponent` is obtained from `developerMenuComponent.viewModel` rather than constructed inline.

State management uses raw `MutableStateFlow` in both `DeveloperMenuViewModel` and `ConfigEditorViewModel`, not the `core.ui.ViewModel<T>` base class. `ConfigEditorViewModel` and `NetworkLogsViewModel` expose proper sealed `UiState` interfaces (`ConfigEditorUiState`, `NetworkLogsUiState`).

Actions are dispatched through `handleMenuAction(DevMenuAction)` in the VM; navigation actions (`ViewBuildInfo`, `ViewNetworkLogs`, `EditConfiguration`) fall through to the UI/navigation layer via the callback parameter.

## Data Flow

1. `FloatingDevButton.onClick` calls `DeveloperMenuViewModel.toggleMenu()`.
2. `DeveloperMenuOverlay` becomes visible; user selects a `DevMenuItem`.
3. Immediate actions (`ClearCache`, `ToggleWebAppMode`, `ClearAuthToken`, `ResetApp`, `HideFloatingButton`, `ResetGmailConnection`) are handled inside `DeveloperMenuViewModel.handleMenuAction()` — they mutate `Configuration` or call into `DiProvider`-resolved components (`MyClosetComponent`, `GmailConnectComponent`).
4. Navigation actions are passed back to the caller; the host navigates to `ConfigEditor`, `BuildInfo`, or `NetworkLogs` routes.
5. `ConfigEditorViewModel.onSaveOverride(key, value)` calls `Configuration.saveOverride(key, value)` and reloads all config items; a snackbar message is surfaced via `DeveloperMenuState.message`.

## Dependencies

- `core.config.Configuration` — runtime key-value store with override support (`keys()`, `getString()`, `saveOverride()`, `resetOverride()`, `clearAllOverrides()`).
- `core.data.datasource.local.createTokenLocalDataSource` — used by `ClearAuthToken` action.
- `core.data.datasource.remote.LoggingHttpClient` — HTTP log source for `NetworkLogsViewModel`.
- `core.di.DiProvider` — used inside VM action handlers to resolve `MyClosetComponent` and `GmailConnectComponent` at runtime.
- `core.util.platform.Log` — multiplatform logging.
- `features/gmailconnect/GmailConnectComponent` — cross-feature dependency resolved via `DiProvider`; used only for `ResetGmailConnection` action.
- `features/mycloset/MyClosetComponent` — cross-feature dependency resolved via `DiProvider`; used only for cache clearing.

## Known Issues / Drift

- `DeveloperMenuViewModel`, `ConfigEditorViewModel`, and `NetworkLogsViewModel` all extend `androidx.lifecycle.ViewModel` directly instead of `core.ui.ViewModel<T>` — no shared analytics, offline flag, or `updateState` helpers.
- `DeveloperMenuState` is still a plain `data class` with no `Loading`/`Error`/`Success` variants. `DeveloperMenuUiState` sealed interface exists but is not yet wired into the screen's observation. `ConfigEditorViewModel` and `NetworkLogsViewModel` use proper sealed UiState wrappers.
- `DeveloperMenuViewModel`'s injected lambdas (`onClearCache`, `onResetGmailConnection`) call `DiProvider.getComponent` in their default implementations — the implicit runtime dependency on component registration remains, just moved out of the VM body. Tests pass custom lambdas to avoid this.

## See Also

- [`../demo3-core.md`](../core.md) — `ViewModel<T>` base class, `DiProvider`, `Configuration`.
- [`../demo3-features.md`](index.md) — feature conventions (sealed UiState, DiProvider, DataSource layer).
- [`../demo3-app-shell.md`](../app-shell.md) — where `FloatingDevButton` and `DeveloperMenuOverlay` are mounted in the app composable hierarchy.

_Last updated: 2026-05-28 — DeveloperMenuViewModel refactored for testability; ConfigEditorViewModel and NetworkLogsViewModel unit tests added (#654)_
