---
type: feature
title: Desktop Server
description: Kotlin Multiplatform feature that hosts the desktop-only Ktor server exposed
  to mobile clients over Tailscale (aiproxy, tools, coding-session, kobote, ota, backup)
  and contributes the Peer Detail "Android Studio Connection" and "Advanced Options" cards.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/desktopserver/,
  Applications/Demo3/composeApp/src/desktopMain/kotlin/com/otiasj/features/desktopserver/]
tags: [demo3, feature, desktopserver, desktop-server, tailscale, mcp, kobote]
timestamp: '2026-08-01T00:00:00Z'
category: feature
---

# Desktop Server

## Purpose

Owns the `features/desktopserver/` module: the embedded Ktor CIO server that runs inside the Desktop (JVM) build, every router it hosts (`/api/ai/*`, `/api/tools`, `/api/codingsession`, `/v1alpha/*`, `/api/ota/*`, `/api/database`, `/api/backup`, `/health`), the Tailscale TCP bridge that publishes it onto the tailnet, and — on every platform — the two client-side cards (`AndroidStudioConnectionCard`, `AdvancedOptionsCard`) plus `DesktopMcpViewModel` that surface a peer's server on the Tailscale Peer Detail screen.

Location: `features/desktopserver/`. Adjacent narrative page: [`../desktop-server.md`](../desktop-server.md).

## Responsibility

**Owns:** Ktor server lifecycle and router registration (`DesktopServerManager`, `DesktopServerRouter`), the exposed HTTP endpoints, the Android Studio MCP direct client (`AndroidStudioDirectClient` at `127.0.0.1:9092`), the self-hosted Claude coding-agent service (`KoboteAgentService`), the coding-session orchestrator state machine, OTA/database/workspace/backup repositories, the localhost-only bearer token for `/api/tools` (`McpTokenManager` → `~/.demo3/mcp_token`), the Tailscale userspace TCP proxy, and the mobile-side `DesktopMcpViewModel` that talks to a peer's server.

**Does NOT own:** the peer list, session status, or auto-connect flow (owned by `features/tailscale`); the AI Chat UI, backend registries, or tool schemas (owned by `features/aichat` + `platform.ai`); Linear ticket state (`features/linear`); the client-side Coding Session flow (owned by `features/codingsession`); the FCM token-registration UI (owned by `features/sendtoken`).

## Route & Entry Point

```kotlin
expect class DesktopServerComponent() {
    val desktopMcpViewModel: DesktopMcpViewModel
}

// Desktop actual additionally exposes:
//   fun start(port: Int = getPort())
//   fun stop()
//   fun attachTailscaleNode(node: TailscaleNode)
//   val serverState: StateFlow<ServerState>
//   fun registerRouter(router: DesktopServerRouter)
//   fun getExposedTools(): List<ExposedToolInfo>
//   val {databaseRepository, otaRepository, workspaceRepository,
//        tokenRegistryRepository, asClient, codingSessionOrchestrator}
```

This feature has **no `@Serializable` route of its own** — its Compose surface is embedded into `features/tailscale/ui/PeerDetailScreen.kt`. `DesktopServerComponent` is registered by `TailscalePlugin.registerComponents(...)` via `DiProvider.registerComponent(DesktopServerComponent())`. On desktop, `TailscaleWarmupCoordinator` then calls `component.start()` and `attachTailscaleNode(node)` once the userspace tailnet is up.

## Key Types

| Type | Description |
|------|-------------|
| `DesktopServerComponent` (expect / actual) | Manual DI container. Common actual (Android/iOS/wasm): only `desktopMcpViewModel`. Desktop actual: also owns Ktor lifecycle, router list, `AndroidStudioDirectClient`, `CodingSessionOrchestrator`, `KoboteAgentService`, all desktop-side repositories, and `serverState: StateFlow<ServerState>`. |
| `DesktopMcpViewModel` + `DesktopMcpUiState` | Client VM used from Peer Detail. Fetches `/api/ai/as-status` (`AndroidStudioClientState`), lists remote backends via `NetworkLlmBackendRegistry`, runs per-backend benchmarks, and registers/unregisters the FCM token against a peer through `SendTokenToDesktopUseCase`. |
| `DesktopServerManager` | Boots Ktor CIO on `0.0.0.0:{port}`, installs JSON `ContentNegotiation`, logs every request into `NetworkLogRepository`, resolves the Tailscale IPv4 (`100.x.x.x`), and hosts `attachTailscaleProxy(node)`. |
| `ServerState` | Sealed interface: `Running(ip, port, tailscaleIp: String?)`, `Stopped`, `Error(message)`. |
| `DesktopServerRouter` | SPI — `fun Application.registerRoutes()`. Implemented by every sub-router below. |
| `DesktopAiProxyRouter` | `/api/ai/*` — backends, models, benchmark, Android Studio proxy (`as-status`, `as/command/{name}`), SSE chat sessions with proxied tool-confirmation coordination. |
| `ToolsRouter` + `McpTokenManager` | `/api/tools`, `/api/tools/execute` — localhost-only, bearer-token-gated. Token mirrored to `~/.demo3/mcp_token` (owner-read only) for local CLI (MCP bridge) clients. |
| `CodingSessionRouter` + `CodingSessionOrchestrator` | `/api/codingsession` — ticket → worktree → agent → APK → merge state machine (see [`codingsession.md`](./codingsession.md)). |
| `KoboteRouter` + `KoboteAgentService` | `/v1alpha/*` — self-hosted Claude coding loop that speaks Jules's `v1alpha` wire contract, so mobile treats it as another Jules provider. |
| `OtaRouter` + `OtaRepository` | `/api/ota/*` — APK folder discovery + signed download. |
| `DatabaseRouter` + `DatabaseRepository` | `/api/database` — in-memory K/V store for dev tooling. |
| `BackupRouter` | `/api/backup` — encrypted `AppDatabase` snapshot upload/download. |
| `WorkspaceRepository` | Backs the `/api/tools` file/gradle tools with the markdown-tracked `~/.kobote/workspace_folders.md` list. |
| `AndroidStudioDirectClient` + `AndroidStudioClientState` | HTTP client + serializable state for the local Android Studio MCP server. `AndroidStudioClientState { url, status: Connected/Connecting/Disconnected, message, tools, projects }` is what mobile receives on `/api/ai/as-status`. |
| `TailscaleTcpProxy` / `TailscaleTcpProxyHandle` | Bridges `TailscaleNode.listen(port)` → `127.0.0.1:port`. Handle-based so `close()` can shut the listener socket *first* to unblock the native, non-cancellable `accept()` call, then join the coroutine. Resilient: accept failures back off and, past a threshold, the listener is torn down and recreated. |
| `AndroidStudioConnectionCard`, `AdvancedOptionsCard`, `ToolInfoRow`, `LabelValueRow`, `AndroidStudioClientStatusBadge` | Reusable Compose cards used by `PeerDetailScreen`. |

## UI

**One-line summary.** Two Compose cards embedded in the Tailscale Peer Detail screen: `AndroidStudioConnectionCard` (MCP-bridge status + expandable tools list) and `AdvancedOptionsCard` (collapsible section with port input and Register/Unregister Token buttons, only when the peer is online + Connected).

```
┌─── AndroidStudioConnectionCard ────────────────────────────┐
│ Android Studio Connection                    ✓ Connected   │
│ URL (read-only)                                            │
│ http://127.0.0.1:9092                                      │
│                                          [ ↻ Refresh ]     │
│ ────────────────────────────────────────────────────────── │
│ ▼ 12 tools                                                 │
│    read_file — Reads a file's contents.                    │
│    list_dir  — Lists a directory.                          │
└────────────────────────────────────────────────────────────┘

┌─── AdvancedOptionsCard (peer online + Connected) ──────────┐
│ ▸ Advanced Options                                     ▼   │
│ Desktop server proxy                          Port [8080]  │
│ [ Register Token ]   [ Unregister Token ]                  │
│ Registered server: 100.64.0.1:8080                         │
│ Token registered                                           │
└────────────────────────────────────────────────────────────┘
```

**States.** `Connected` shows the check-badge + tools; `Connecting` shows the info badge + message; `Disconnected` shows a red error message and an empty tools list. `AdvancedOptionsCard` collapses to just the header when not expanded; while `isTokenLoading` a spinner replaces both buttons; a `tokenMessage` starting with `"Error"` renders in `colorScheme.error`, otherwise `colorScheme.primary`.

**Interactions.** Refresh → `desktopMcpViewModel.fetchBackends(peer)` (re-polls `/api/ai/as-status` and the backend list in parallel). Tools-row tap toggles expand/collapse. Port field updates `portInput` (which the peer address resolver uses). Register/Unregister → `sendTokenUseCase(resolvedAddress)`; on success `DesktopAddressRepository.saveAddress(...)` persists the peer:port for the "Registered server:" caption.

## Architecture

```
desktopserver/
├── DesktopServerComponent.kt              (commonMain expect + platform actuals)
├── ui/
│   ├── DesktopMcpViewModel.kt             (client VM, used by Tailscale PeerDetail)
│   ├── ConnectedTools.kt                  (AndroidStudioConnectionCard + parts)
│   └── components/AdvancedOptionsCard.kt
├── mcp/AndroidStudioClientState.kt        (serializable domain shared with clients)
└── (desktopMain only)
    ├── DesktopServerManager.kt, DesktopServerRouter.kt, ServerState.kt
    ├── TailscaleTcpProxy.kt
    ├── aiproxy/{DesktopAiProxyRouter, ProxyToolConfirmationCoordinator}.kt
    ├── tools/{McpTokenManager, ToolsRouter}.kt
    ├── mcp/{AndroidStudioDirectClient, DirectAndroidStudioTool}.kt
    ├── codingsession/{Orchestrator, Router, BuildRunner, GitHubMergeGateway}.kt
    ├── kobote/{KoboteAgentService, KoboteRouter, KoboteAgentClient, ShellRunner, ...}
    ├── workspace/{WorkspaceRepository, ui/WorkspaceCard}
    ├── ota/{OtaRepository, OtaRouter, ui/OtaCard}
    ├── database/{DatabaseRepository, DatabaseRouter}
    ├── tokenregistry/{TokenRegistryRepository, TokenRegistryRouter, ui/…}
    └── backup/BackupRouter.kt
```

Startup flow: `TailscalePlugin.registerComponents` registers `DesktopServerComponent`. On desktop, `TailscaleWarmupCoordinator` calls `component.start(port)` → `DesktopServerManager.start()` binds Ktor and `McpTokenManager.start()` mints a bearer token; `startTailscaleMonitor` then polls `100.x.x.x` interfaces. When the userspace node is ready `attachTailscaleNode(node)` calls `attachTailscaleProxy(node)`, which cancels the poller and starts `startTailscaleTcpProxy(node, port, port, scope)`.

## Data Flow

1. **Server up (desktop).** `TailscalePlugin` → `DesktopServerComponent.start()` → `DesktopServerManager.start()` binds Ktor `0.0.0.0:port`, writes MCP token to `~/.demo3/mcp_token`, `_serverState.value = Running(ip, port, tailscaleIp)`.
2. **Attach tailnet.** `TailscaleWarmupCoordinator` → `component.attachTailscaleNode(node)` → `DesktopServerManager.attachTailscaleProxy(node)` → cancels the poller → `startTailscaleTcpProxy` listens on the userspace node and pipes bytes to `127.0.0.1:port`.
3. **Client — status.** User taps a Tailscale peer → `PeerDetailScreen` calls `desktopMcpViewModel.fetchBackends(peer)`. VM composes `http://<peer.serverAddress(portInput)>` and fires `GET /api/ai/as-status` (populates `asClientState`) in parallel with `NetworkLlmBackendRegistry.tryCreate(address).getAvailableBackends()`; per-backend model lookups are timed and stored in `PeerBackendInfo`.
4. **Server — status.** `DesktopAiProxyRouter` calls `DesktopServerComponent.asClient.checkStatus()` → probes `http://127.0.0.1:9092/projects` → returns `AndroidStudioClientState { status, tools, projects }`.
5. **Client — token.** Register/Unregister → `sendTokenUseCase(resolvedAddress)` POSTs the FCM token to the peer; on success `DesktopAddressRepository.saveAddress` persists the peer address for the "Registered server:" caption.
6. **Client — benchmark.** `testBackendSpeed(peer, backend)` picks the first model and calls `registry.benchmarkBackend(...)`; the returned tokens/sec is written back into the matching `PeerBackendInfo.speedResult`.

## Dependencies

- **Own:** `AndroidStudioDirectClient`, `AndroidStudioClientState`, `KoboteAgentService`, `CodingSessionOrchestrator`, `BuildRunner`, `GitHubMergeGateway`, `OtaRepository`, `WorkspaceRepository`, `TokenRegistryRepository`, `DatabaseRepository`, `McpTokenManager`, `TailscaleTcpProxyHandle`, `ProxyToolConfirmationCoordinator`.
- **Core:** `DiProvider`, `LoggingHttpClient`, `NetworkLogRepository`, `createLocalDataSource`, `Configuration.desktopServerPort`, `BuildKonfig.{DESKTOP_SERVER_PORT, ANDROID_STUDIO_MCP_URL}`, `Log`, `TimeUtils`, `AppDatabase`, `ClerkUnsafeMetadataDataSourceFactory`.
- **Cross-feature:** pulls `TailscaleComponent` from DI for `sendTokenUseCase`; uses `LinearComponent` (via `LinearIssueTracker`), `GitHubAPI`/`GitHubAuthTokenProvider` (from `features/jules`), `platformBackupManager` (from `features/backup`), `platform.ai.{DesktopLlmBackendRegistry, NetworkLlmBackendRegistry, AiChatClient, ToolConfirmationAware}`, `platform.ai.tools.{ToolRegistry, defaultToolRegistry, commonFeatureTools}`, `platform.auth.DesktopAuthBridge`, `platform.tailscale.ui.{PeerUi, PeerActionState, serverAddress, PeerBackendInfo}`, `tailscale.{TailscaleNode, TailscaleServerSocket}`.
- **Compose Resources:** `Res.string.desktop_server_{android_studio_connection, url_readonly, connection_error, refreshing, refresh_status, refresh, tools_count, no_tools, status_connected, status_connecting, status_disconnected, expand_tools, collapse_tools}` (used by `ConnectedTools.kt`; `AdvancedOptionsCard.kt` hard-codes its own labels — see Drift).
- **Navigation:** none — no route of its own; UI is embedded in `PeerDetailScreen`.

## Known Issues / Drift

- **Hard-coded user-visible strings in `AdvancedOptionsCard.kt`.** `"Advanced Options"`, `"Toggle Advanced"`, `"Desktop server proxy"`, `"Port"`, `"Register Token"`, `"Unregister Token"`, `"Registered server: ..."` are inline `Text(...)` values (lines 51, 57, 94, 102, 115, 118, 125) instead of `stringResource(Res.string.*)`. Violates the "NEVER hardcode user-visible strings" rule.
- **`DesktopMcpViewModel` extends `androidx.lifecycle.ViewModel` directly** (line 47). Bypasses `core.ui.ViewModel<T>`, so it inherits neither the shared analytics hooks nor the offline flag the rest of Demo3 relies on.
- **Boolean-flag `DesktopMcpUiState`.** Flat data class with `isTokenLoading`, `isFetchingAsStatus`, `isFetchingBackends`, `backendsError`, `testingBackendSpeedId` etc. instead of a sealed interface with `Loading`/`Success`/`Error` variants — the `sealed interface UiState` migration hasn't reached this feature.
- **No `@Preview` for `AndroidStudioConnectionCard`.** Only `AdvancedOptionsCard` has one. The convention asks for one preview per `UiState` variant — Connected, Connecting, Disconnected all need a preview.
- **`AdvancedOptionsCardPreview` uses `MaterialTheme` instead of `AppTheme { Surface { ... } }`** (line 144). Inconsistent with the wrap-in-AppTheme rule.
- **`TokenRegistryRouter` is dead code.** Defined at `tokenregistry/TokenRegistryRouter.kt` but never `registerRouter(...)`-ed in `DesktopServerComponent.init { }`. The current token-registration path runs through `features/sendtoken` + `TailscaleComponent.sendTokenUseCase`.
- **`DesktopMcpViewModel.asMcpPort`.** Public `val asMcpPort: Int` parsed from `BuildKonfig.ANDROID_STUDIO_MCP_URL` (lines 76–82) is unreferenced by any caller — dead surface area, likely leftover from an earlier port-picker UI.
- **`AndroidStudioDirectClient` base URL is hard-coded** to `http://127.0.0.1:9092` in `DesktopServerComponent.asClient` (line 72), instead of reading the same `BuildKonfig.ANDROID_STUDIO_MCP_URL` that the ViewModel parses — the two can drift if that port changes.
- **`DesktopMcpViewModel.httpClient` is never closed.** The `LoggingHttpClient` is created `by lazy` with no `onCleared` hook — minor leak on VM disposal.
- **No `commonTest` for `DesktopMcpViewModel`.** All tests live in `desktopTest`; the shared client VM is uncovered.

## Tests

| File | What it tests |
|------|---------------|
| `desktopTest/.../TailscaleTcpProxyE2ETest.kt` | Userspace `TailscaleNode.listen` → `127.0.0.1:port` → Ktor round-trip; exercises the accept-failure recovery loop and listener recreation. |
| `desktopTest/.../codingsession/CodingSessionOrchestratorTest.kt` | State-machine transitions of `CodingSessionOrchestrator` (create → coding → building → apk-ready → merging → done, plus failure paths). |
| `desktopTest/.../codingsession/CodingSessionBuildTest.kt` | `BuildRunner` gradle invocation and APK detection. |
| `desktopTest/.../codingsession/SessionApkFileNameTest.kt` | Session-scoped APK filename derivation. |
| `desktopTest/.../codingsession/CodingSessionMergeTest.kt` | Merge phase driven through `GitHubMergeGateway` (mocked `GitHubAPI`). |
| `desktopTest/.../codingsession/GitHubRemoteParsingTest.kt` | `git remote -v` output parsed into owner/repo. |
| `desktopTest/.../workspace/WorkspaceRepositoryTest.kt` | Markdown-backed folder persistence in `~/.kobote/workspace_folders.md`. |
| `desktopTest/.../kobote/CliAgentEngineTest.kt` | `ClaudeCliAgentEngine` / `AgyCliAgentEngine` shell invocation shape + streaming parsing. |
| `desktopTest/.../kobote/KoboteSourceParsingTest.kt` | Jules-wire `Source` decode helpers used by `KoboteRouter`. |
| `desktopTest/.../mcp/AndroidStudioDirectClientTest.kt` | HTTP probe + tool-definition parsing against a mocked `127.0.0.1:9092`. |
| `desktopTest/.../ota/OtaRepositoryTest.kt` | APK folder scan, semver parse, session-APK matching. |
| `desktopTest/.../aiproxy/ProxyToolConfirmationCoordinatorTest.kt` | Client-side confirmation coordinator that the `/api/ai/sessions/{id}/confirmations` route drives. |

`commonTest` coverage for `DesktopMcpViewModel` is missing.

## See Also

- [`../desktop-server.md`](../desktop-server.md) — narrative overview of the whole desktop tooling stack (Push Tester, Device Token Registry background).
- [`../desktop-api-guide.md`](../desktop-api-guide.md) — API reference for the endpoints exposed here.
- [`./codingsession.md`](./codingsession.md) — client-side coding-session UI; this feature owns the server-side orchestrator behind it.
- [`../app-plugin.md`](../app-plugin.md), [`../app-shell.md`](../app-shell.md) — `TailscalePlugin` is what registers `DesktopServerComponent`.
- [Architecture Overview](../../../ARCHITECTURE.md)

_Last updated: 2026-08-01_
