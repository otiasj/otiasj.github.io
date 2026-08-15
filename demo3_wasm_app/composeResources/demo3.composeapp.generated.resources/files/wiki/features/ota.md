---
type: feature
title: OTA Updates
description: Over-the-air update layer for Demo3 — checks the desktop dev server for
  new APK builds, shows a global "update available" banner, and lets a developer browse
  and install any advertised version from the peer detail screen.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/ota/]
tags: [demo3, feature, ota]
timestamp: '2026-08-01T00:00:00Z'
category: feature
---

# OTA Updates

## Purpose

Over-the-air update layer for Demo3. The feature checks the Demo3 desktop dev server for newer APK builds, surfaces a global "Update available" banner when one exists, and provides an expandable per-peer card in the Tailscale peer detail screen so a developer can browse every listed build and install any of them (or the newest). It replaces the earlier standalone `OtaVersionBrowser` route — the browsing UI has moved inline into `features/tailscale`, and the OTA transport that used to live in `platform/ota` has been absorbed into this feature.

Location: `features/ota/`

## Responsibility

Owns the OTA transport (`HttpOtaClient` over Tailscale), the shared per-app `OtaUpdateManager` (via `expect fun otaUpdateManager()`), the version-comparison util (`SemVer`), the `OtaUpdatesViewModel` state, and the two Compose surfaces (`OtaUpdatesCard`, `OtaUpdateMonitor`). It also owns the `check_app_version` / `list_app_versions` AI tools that expose OTA state to the AI chat clients on every platform.

It does **not** own the desktop server side (`/ota/*` HTTP endpoints belong to `features/desktopserver`), the platform-specific install mechanism (implemented in each target's `actual` for `otaUpdateManager()`), or the desktop address (resolved via `features/sendtoken`'s `DesktopAddressRepository`). It exports `OtaUpdatesCard` and `OtaUpdateMonitor` for other features to embed, plus its two AI tools via `platform/ai/tools/commonFeatureTools()`.

## Route & Entry Point

```kotlin
class OtaComponent internal constructor() {
    val otaUpdatesViewModel: OtaUpdatesViewModel by lazy {
        OtaUpdatesViewModel(HttpOtaClient(usesTailscale = true), otaUpdateManager())
    }
}
```

There is **no standalone route** — the feature has no `@Serializable *Route` or `NavGraphBuilder` extension. `OtaComponent` is registered by `TailscalePlugin.registerComponents(...)` (`app/plugins/TailscalePlugin.kt:41`). `TailscaleComponent` re-exports `otaUpdatesViewModel` by pulling from `DiProvider.getComponent(OtaComponent::class)`, so `PeerDetailScreen` gets the same instance the plugin registered. `OtaUpdateMonitor` is placed inside `AppShell` (`app/AppShell.kt:504`) so the update banner is available across every authenticated screen. Demo3-only — `TailscalePlugin` is not in the Revivle plugin list.

## Key Types

| Type | Description |
|------|-------------|
| `OtaComponent` | Feature-scoped DI container; lazily builds `OtaUpdatesViewModel` with a Tailscale-routed `HttpOtaClient` and the platform `OtaUpdateManager` |
| `OtaUpdatesViewModel` | Extends `androidx.lifecycle.ViewModel`; exposes `StateFlow<OtaUiState>`; per-peer `fetchOtaVersions`, `downloadOtaVersion`, `downloadLatestOta`; observes `otaUpdateManager.state` and mirrors it into `OtaUiState.otaState` |
| `OtaUiState` | **Data class** (not a sealed interface): `isFetchingOta`, `otaVersions: List<OtaVersionInfo>?`, `otaError: String?`, `otaState: OtaUpdateState` |
| `OtaClient` / `HttpOtaClient` | Domain interface + Ktor implementation; `checkVersion`, `listVersions`, `downloadApk`. Engine is `TailscaleHttpEngineProvider` or `DefaultHttpEngineProvider` depending on `usesTailscale` |
| `OtaUpdateManager` | Domain interface: `state: StateFlow<OtaUpdateState>`, `currentVersionCode/Name`, `checkForUpdate`, `downloadAndInstall`, `clearError`. `otaUpdateManager()` is `expect fun` with per-target `actual` |
| `OtaUpdateState` | Sealed interface: `Idle`, `Checking`, `UpdateAvailable(info)`, `Downloading(progress)`, `ReadyToInstall`, `Error(message)` |
| `OtaVersionInfo` | `filename`, `versionCode`, `buildNumber`, `size`, `lastModified`, `versionName` — payload of `/ota/list-versions` |
| `OtaUpdateInfo` | `versionCode`, `versionName`, `downloadUrl` — payload of `/ota/check-version` and input to `downloadAndInstall` |
| `SemVer` | `object` with `compareVersionNames`, `isUpdateAvailable`, `isInstalledOrNewer` — dotted-string version comparator (strips non-digit suffixes like `-beta`) |
| `OtaUpdatesCard` / `OtaVersionItemRow` | Reusable Compose card + row shown inside `PeerDetailScreen` when the peer is a connected desktop |
| `OtaUpdateMonitor` | Global bottom-anchored Card shown from `AppShell`; renders "Update available" or an error, with Update/Dismiss actions |
| `CheckAppVersionTool` / `ListAppVersionsTool` | Read-only `TypedAiTool`s (`requiresConfirmation = false`) wired into `commonFeatureTools()` |

## UI

**One-line summary.** Two surfaces: a global "Update available" banner (`OtaUpdateMonitor`) anchored to the bottom of every authenticated screen, and an expandable "OTA Updates" card (`OtaUpdatesCard`) in each connected desktop peer's detail screen listing every advertised APK.

Layout — `OtaUpdatesCard` (expanded, Success state):

```
# ┌───────────────────────────────────────────┐
# │ [⬇] OTA Updates      3 APKs available  ⌄  │  (clickable header)
# ├───────────────────────────────────────────┤
# │ [       Download Latest       ]           │  (disabled if latest installed)
# │                                           │
# │ ┌───────────────────────────────────────┐ │
# │ │ demo3 1.2.24                          │ │
# │ │ [TKT-123] [Build: 5] [Version: 27]    │ │  (SuggestionChips)
# │ │ Size: 42.1 MB                         │ │
# │ │ 3 hours ago              [Download]   │ │
# │ └───────────────────────────────────────┘ │
# │ ┌───────────────────────────────────────┐ │
# │ │ demo3-1.2.24-build.002.apk            │ │
# │ │ [Version: 26] [Build: 2]              │ │
# │ │ Size: 42.0 MB     ( Installed )       │ │  (tinted card + Badge)
# │ └───────────────────────────────────────┘ │
# └───────────────────────────────────────────┘
```

Layout — `OtaUpdateMonitor` (bottom-anchored Card):

```
# ┌───────────────────────────────────────────┐
# │ Update available: v1.2.24 (26) ->         │
# │ v1.2.25 (27)         [Update]    [ × ]    │
# └───────────────────────────────────────────┘
```

States for `OtaUpdatesCard`: header shows `Checking...`, `Failed to load`, `N APKs available`, `No updates`, or `Ready` depending on `PeerActionState`. Body shows a `CircularProgressIndicator`, an error row with `Retry`, "No OTA versions found", or the version list. The card is hidden entirely when the peer is offline or not `Connected`. `OtaUpdateMonitor` is hidden unless the manager state is `UpdateAvailable` (and not dismissed) or `Error`. Interactions: card header taps toggle expand/collapse; per-row Download → `downloadOtaVersion(peer, port, version)`; Download Latest → `downloadLatestOta(peer, port)`; Retry → `fetchOtaVersions(peer, port)`; monitor Update → `otaUpdateManager.downloadAndInstall(info)`; monitor Dismiss → suppress until the next version code appears. If `filename` matches a coding-session APK naming convention (via `parseSessionApkName`), the row shows the parsed app name + ticket-identifier chip instead of the raw filename.

## Architecture

```
# ota/
# ├── OtaComponent.kt                       (DI: OtaUpdatesViewModel)
# ├── data/
# │   ├── HttpOtaClient.kt                  (Ktor over Tailscale)
# │   ├── OtaUpdateManagerProvider.kt       (expect fun otaUpdateManager)
# │   ├── CheckVersionResponse.kt           (server DTO)
# │   └── OtaVersionListResponse.kt         (server DTO)
# ├── domain/
# │   ├── OtaClient.kt                      (interface)
# │   ├── OtaUpdateManager.kt               (interface)
# │   ├── OtaUpdateState.kt                 (sealed)
# │   ├── OtaUpdateInfo.kt
# │   ├── OtaVersionInfo.kt
# │   └── SemVer.kt
# ├── tools/
# │   ├── CheckAppVersionTool.kt            (AI tool)
# │   └── ListAppVersionsTool.kt            (AI tool)
# └── ui/
#     ├── OtaUpdatesViewModel.kt            (OtaUiState + VM)
#     ├── OtaUpdateMonitor.kt               (global banner composable)
#     └── components/
#         └── OtaUpdatesCard.kt             (card, header, row, formatFileSize)
```

Wiring: `TailscalePlugin` registers `OtaComponent`; `TailscaleComponent.otaUpdatesViewModel` re-exports it via `DiProvider`. `PeerDetailScreen` embeds `OtaUpdatesCard` for connected non-mobile peers and passes a `PeerActionState` snapshot. `AppShell` embeds `OtaUpdateMonitor`, which instantiates its own `otaUpdateManager()` + `DesktopAddressRepository()` and runs a one-shot `checkForUpdate` on composition. `commonFeatureTools()` (`platform/ai/tools/`) builds a separate `HttpOtaClient` for the AI tool pair.

## Data Flow

1. `OtaUpdateMonitor` composes in `AppShell`; `LaunchedEffect(Unit)` reads the desktop address via `DesktopAddressRepository.getAddress()` and, if non-blank, calls `otaUpdateManager.checkForUpdate(address)` → state becomes `Checking` → `UpdateAvailable(info)` or `Error`.
2. When state is `UpdateAvailable` (and the version code isn't the dismissed one) the banner appears; tapping Update calls `otaUpdateManager.downloadAndInstall(info)` (`Downloading` → `ReadyToInstall`); Dismiss remembers the version code.
3. In `PeerDetailScreen`, `LaunchedEffect(peer.online, peer.status)` calls `otaUpdatesViewModel.fetchOtaVersions(peer, portInput)` for connected non-mobile peers → `HttpOtaClient.listVersions(address, currentVersionCode)` → `OtaUiState.otaVersions`.
4. Per-row Download builds `OtaUpdateInfo(versionCode, versionName = filename, downloadUrl = "$baseUrl/ota/download/$filename")` and delegates to `otaUpdateManager.downloadAndInstall(...)`; failures are logged, not surfaced in the card.
5. Download Latest picks `maxWithOrNull` using `SemVer.compareVersionNames` (then `versionCode` as tiebreak) and delegates to `downloadOtaVersion`.
6. The ViewModel's `init` collects `otaUpdateManager.state` into `OtaUiState.otaState`; `PeerDetailContent` mirrors that to derive `isDownloading` for the card and to render a badge in `RunningServicesCard`.

## Dependencies

- **Own**: `OtaComponent`, `HttpOtaClient` (via `usesTailscale` toggle), platform `otaUpdateManager()` actuals.
- **Core**: `core.data.datasource.remote.DefaultHttpEngineProvider` (fallback engine), `core.util.platform.Log`, `core.util.time.toRelativeTime` (row "3 hours ago"). Does **not** use `core.ui.ViewModel`, `AnalyticsManager`, `safeCall`, or `DiProvider` from inside its own code.
- **Cross-feature**: `features/sendtoken/DesktopAddressRepository` (for the desktop address); `features/codingsession/parseSessionApkName` (row filename parsing); `features/tailscale` (embeds the card in `PeerDetailScreen` and re-exports the VM); `features/desktopserver` (owns the `/ota/*` endpoints on the desktop side).
- **Platform**: `platform/tailscale/TailscaleHttpEngineProvider` (HTTP engine), `platform/tailscale/ui/PeerUi` + `PeerActionState` + `serverAddress` extension; `platform/ai/tools/TypedAiTool`, `jsonSchemaOf`, `commonFeatureTools()` registry (AI tool wiring).
- **Compose Resources**: `ota_browser_title`, `ota_browser_loading`, `ota_browser_error`, `ota_browser_empty`, `ota_browser_retry`, `ota_browser_download`, `ota_browser_download_latest`, `ota_browser_installed`, `ota_browser_version_code`, `ota_browser_build_number`, `ota_browser_file_size` (defined in `strings_ota.xml`; some like `ota_browser_title` are now unused after the standalone route was removed).
- **DI/serialization**: `kotlinx.serialization` (`OtaVersionInfo`, `OtaVersionListResponse`, `CheckVersionResponse`); `kotlinx.datetime.Instant` for the row's relative-time label.

## Known Issues / Drift

- **`OtaUpdatesViewModel` extends `androidx.lifecycle.ViewModel` directly**, not `core.ui.ViewModel<T>` — no shared analytics, no offline flag (`OtaUpdatesViewModel.kt:29`).
- **`OtaUiState` is a data class with boolean/nullable flags**, not the sealed-interface `Loading/Success/Error/Empty` convention (`OtaUpdatesViewModel.kt:19-24`).
- **`OtaUpdateMonitor` bypasses DI** — it calls `otaUpdateManager()` and `DesktopAddressRepository()` directly instead of pulling from `OtaComponent` (`OtaUpdateMonitor.kt:42-43`).
- **`commonFeatureTools()` bypasses `OtaComponent`** — it instantiates its own `HttpOtaClient(usesTailscale = true)` and `DesktopAddressRepository()` instead of reusing the component's ones (`platform/ai/tools/CommonFeatureTools.kt:27-32`).
- **Hardcoded user-visible strings** in `OtaUpdatesCard.kt` (`"OTA Updates"`, `"Checking..."`, `"Failed to load"`, `"$count APKs available"`, `"No updates"`, `"Ready"`, `"No OTA versions found"`, `"Failed to load: $error"`, `"Retry"`, `"Toggle OTA"`) and in `OtaUpdateMonitor.kt` (`"Update available: ..."`, `"Update"`, `"Dismiss"`) — none use `stringResource(Res.string.*)`.
- **`SuggestionChip(onClick = {})`** used as a decorative label; `AssistChip` (or plain text) is a better fit (`OtaUpdatesCard.kt:209-215`).
- **Only one `@Preview`** in the feature — `OtaUpdatesCardPreview` — and it wraps in bare `MaterialTheme` instead of `AppTheme { Surface { ... } }`. No preview for `OtaUpdateMonitor`, no per-state previews (Loading/Error/Empty) (`OtaUpdatesCard.kt:260-278`).
- **No stateless `Content(state, onEvent)` composable** for either UI surface — `OtaUpdateMonitor` reads `otaUpdateManager()` directly during composition, and `OtaUpdatesCard` takes an `OtaUpdatesViewModel`-derived `peerState`.
- **`formatFileSize` is a private helper in `OtaUpdatesCard.kt`** rather than a shared util (`OtaUpdatesCard.kt:247-257`).
- **Download errors are logged, not surfaced** — `downloadOtaVersion`'s `catch` only calls `Log.w`; the user sees no feedback if the download can't be triggered (`OtaUpdatesViewModel.kt:81-83`).
- **No `commonTest` for the ViewModel** — only `SemVerTest` and `OtaToolsTest` exist; the fetch/download flows are untested.
- **Legacy `strings_ota.xml` entries** (e.g. `ota_browser_title`) reference a screen that no longer exists.

## Tests

| File | What it tests |
|------|---------------|
| `ota/domain/SemVerTest.kt` | `compareVersionNames` handles equal, longer-arity, newer/older, and `-beta`-suffixed versions; `isUpdateAvailable` covers name-precedence over code and code tiebreak; `isInstalledOrNewer` covers the mirror cases. |
| `ota/tools/OtaToolsTest.kt` | `CheckAppVersionTool`: happy path, missing address, network failure. `ListAppVersionsTool`: sorts newest-first with `[installed]` marker, empty response, missing address. Uses an inline `FakeOtaClient`. |

No `commonTest` coverage for `OtaUpdatesViewModel` (fetch/download flows), `HttpOtaClient` (URL construction, engine selection), or the Compose surfaces (`OtaUpdatesCard`, `OtaUpdateMonitor`).

## See Also

- [tailscale](tailscale.md) — owns the plugin that registers `OtaComponent` and embeds `OtaUpdatesCard`
- [sendtoken](sendtoken.md) — provides `DesktopAddressRepository`, the source of the desktop server address
- [codingsession](codingsession.md) — provides `parseSessionApkName` for the row filename parser
- [desktopserver](desktopserver.md) — owns the `/ota/check-version`, `/ota/list-versions`, `/ota/download/<file>` Ktor endpoints
- [demo3 app-shell](../app-shell.md) — hosts `OtaUpdateMonitor` and `TailscalePlugin`
- [demo3 platform](../platform.md) — Tailscale HTTP engine used by `HttpOtaClient`
- [Architecture Overview](../../ARCHITECTURE.md)

_Last updated: 2026-08-01 — Rewritten for the post-standalone-route architecture: standalone `OtaVersionBrowser*` route removed; `OtaComponent` added and registered by `TailscalePlugin`; OTA now surfaces as `OtaUpdatesCard` (inside `PeerDetailScreen`) + `OtaUpdateMonitor` (global banner in `AppShell`); `platform/ota` folded into `features/ota/{data,domain}`._
