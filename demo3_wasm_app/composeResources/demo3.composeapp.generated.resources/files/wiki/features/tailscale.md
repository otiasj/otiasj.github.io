---
type: feature
title: Demo3 — Tailscale Feature
description: Embeds a KMP Tailscale node into the app, exposing a connection dashboard
  to browse and manage the device's Tailscale mesh — peer list, IP addresses, direct
  vs relay status.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/tailscale/,
  Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/platform/tailscale/]
tags: [demo3, feature, tailscale]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Demo3 — Tailscale Feature

## Purpose
Embeds a KMP Tailscale node into the app, exposing a connection dashboard to browse and manage the device's Tailscale mesh — peer list, IP addresses, direct vs relay status.

Location: `features/tailscale/`
Added: commit `ccde9515` (Tailscale integration with KMP library, #344) + `90f034d9` (routing fix)

## Responsibility

**Owns:** the navigation route, DI component, auth-token provider, and the screen composable that wraps the shared `platform/tailscale/` dashboard.

**Does not own:** the Tailscale node lifecycle or the dashboard UI state machine — those live in `platform/tailscale/` so they can be reused across surfaces without a feature dependency.

## Navigation Route

```kotlin
@Serializable
object Tailscale
```

`NavController.navigateToTailscale()` — helper extension.
`NavGraphBuilder.tailscaleRoute(onNavigateBack, contentPadding)` — registered in `HomeComponent.addHomeRoutes`.

Retrieves `TailscaleComponent` from `DiProvider` and passes `component.tailscaleViewModel` to `TailscaleScreen`.

## Plugin

`TailscalePlugin` (in `app/plugins/TailscalePlugin.kt`) is now the canonical entry point for Tailscale in Demo3. In `registerComponents` it:
1. Registers `TailscaleComponent` via `DiProvider.registerComponent`.
2. Registers `TailscaleHttpEngineProvider` as the `HttpEngineProvider` DI key — this routes every `LoggingHttpClient` HTTP request through the Tailscale userspace node for Tailscale-addressed hosts, and falls back to the OS stack for everything else.

`TailscalePlugin.featureCollections()` returns a single `FeatureCollection("tailscale", …)` containing `FeatureDefinitions.TAILSCALE`. `homeRoutes` registers `tailscaleRoute` in the inner NavHost.

## DI Component

`TailscaleComponent` (internal constructor) — manual DI component registered via `TailscalePlugin`. Wraps native library init in a `NodeInit(node?, error?)` lazy value; if `createTailscaleNode()` returns a `FailedTailscaleNode` or throws, the error string is forwarded to the ViewModel and repository rather than crashing.

## Client Auto-Connect Coordinator

`ClientAutoConnectCoordinator` (in `features/tailscale/commonMain`) handles automatic Tailscale connection for **client** platforms (Android, iOS, Wasm). It is constructed in `TailscaleComponent` when running on mobile/web and runs for the full component lifetime.

**5-step connection flow on login:**
1. Start the Tailscale node with the user's auth key.
2. Wait for `ConnectionState.Connected`.
3. Discover the desktop server by probing all online peers in parallel (with exponential backoff, 5s → 5min, indefinite retries).
4. Register the FCM push token with the discovered desktop address via `SendTokenToDesktopUseCase`.
5. Warm the LLM backend cache via `NetworkLlmBackendRegistry.tryCreate(address)?.loadAvailableAgents()`.

On logout: unregisters the FCM token and stops the Tailscale node.

`stop()` cancels the coordinator job. `onConnectionSuccess`/`onConnectionFailure` callbacks are optional hooks (default no-op).

## Warmup Coordinator

`TailscaleWarmupCoordinator` (in `features/tailscale/commonMain`) provides automatic lifecycle management for the Tailscale node tied to the user's auth state on **desktop**:

```kotlin
class TailscaleWarmupCoordinator(
    private val authRepository: AuthRepository,
    private val tokenProvider: AuthTokenProvider,
    private val addressRepository: DesktopAddressRepository,
    private val sendTokenUseCase: SendTokenToDesktopUseCase,
    private val node: TailscaleNode?,
    private val scope: CoroutineScope
)
```

`start()` launches a coroutine that collects `authRepository.isUserLoggedIn()`. When the user is logged in and a node is available, it fetches the auth key, calls `node.start(TailscaleConfig(hostname="KmpSampleApp", authKey=key))`, waits for `ConnectionState.Connected`, then runs `runDiscoveryProbe()` — a parallel probe across all online peers to find a live desktop address. When the user logs out, it calls `node.stop()`. `stop()` cancels the coordinator job.

`runDiscoveryProbe()` probes all online peers in parallel via `LoggingHttpClient`, attempting an HTTP GET on each peer's known address. The first successful address is saved via `addressRepository` so the Send Token dialog pre-fills the desktop address automatically. This eliminates manual address entry after the Tailscale node connects.

The coordinator is constructed and started in `TailscaleComponent` so it runs for the full lifetime of the component.

| Lazy property          | Type                          | Role                                                        |
|------------------------|-------------------------------|-------------------------------------------------------------|
| `tokenProvider`        | `TailscaleAuthTokenProvider`  | Reads Tailscale auth key from Clerk unsafe metadata         |
| `tailscaleRepository`  | `TailscaleRepository`         | Domain interface — `getPeers(): List<TailscalePeer>`. Backed by `TailscaleRepositoryImpl`. Used by the sendtoken devmenu action to populate the peer picker. |
| `sendTokenUseCase`     | `SendTokenToDesktopUseCase`   | Token-registration use case. When `nodeInit.node != null`, backed by `TailscaleDesktopTokenRepository` (sends via `node.httpPost()`); otherwise falls back to `DesktopTokenRepositoryImpl` (Ktor over OS network). This makes token registration work even when the desktop is reachable only through the Tailscale userspace identity. |
| `tailscaleViewModel`   | `TailscaleDashboardViewModel` | Single-source-of-truth for dashboard UI. Receives `sendTokenUseCase` so the "Send token to desktop" action in the dashboard uses the Tailscale-aware path. |

`TailscaleRepository` / `TailscalePeer`:

```kotlin
interface TailscaleRepository {
    suspend fun getPeers(): List<TailscalePeer>
}

data class TailscalePeer(val name: String, val ipAddress: String)
```

`TailscaleRepositoryImpl` delegates to the native `TailscaleNode`; returns an empty list if the node is `null` (library not loaded).

## Platform Connection Hook

`TailscaleConnectedNotifier.kt` (in `features/tailscale/commonMain`) declares:

```kotlin
expect fun notifyTailscaleConnected(node: TailscaleNode)
```

Called by `TailscaleDashboardViewModel` whenever the Tailscale node transitions to `ConnectionState.Connected`. Platform actuals:

| Platform | Actual | Behaviour |
|---|---|---|
| Desktop | `TailscaleConnectedNotifier.desktop.kt` | `DiProvider.getComponentOrNull(DesktopServerComponent::class)?.attachTailscaleNode(node)` — starts the `TailscaleTcpProxy` so the Ktor server becomes reachable via the Tailscale identity |
| Android | `TailscaleConnectedNotifier.android.kt` | No-op |
| iOS / native | `TailscaleConnectedNotifier.native.kt` | No-op |
| Wasm | `TailscaleConnectedNotifier.wasmJs.kt` | No-op |

This hook decouples the `features/tailscale` module from `features/desktopserver` — no direct import is needed; the wiring happens through `DiProvider` at runtime.

## Auth

`TailscaleAuthTokenProvider` implements `AuthTokenProvider`. Reads the Tailscale auth key from `ClerkUnsafeMetadataDataSource` under the key `TAILSCALE_AUTH_KEY`. Returns `null` if blank — the dashboard treats `null` as "no saved key" and shows the connect form without pre-filling the auth key field.

## Screen

`TailscaleScreen` (in `ui/TailScaleScreen.kt`) is a thin composable:

1. Wraps the app scaffold (`AppScaffold` with back nav and `tailscale_screen_title`).
2. Collects `viewModel.uiState` as state with lifecycle.
3. Delegates rendering entirely to `TailscaleDashboard` from `platform/tailscale/`.

There is no in-feature state machine; all business logic is in the ViewModel.

## Platform Layer — `platform/tailscale/`

The actual Tailscale node and UI state live in `platform/tailscale/ui/`. A new `TailscaleHttpClientEngine` has been added to `platform/tailscale/`:

### `TailscaleHttpClientEngine`

A Ktor `HttpClientEngine` that routes HTTP(S) requests through the Tailscale userspace node instead of the OS network stack. Accepts a `TailscaleNode?` and a `fallbackEngine`. If the target host is a Tailscale IP (100.x.x.x range or a Tailscale magic DNS name) and `node != null`, it calls `node.dial(host, port)` to obtain a `TailscaleConnection`, serialises the HTTP request manually (request line + headers + body), writes it via `conn.write()`, and streams the response status, headers, and body bytes progressively and asynchronously. Supports chunked transfer encoding (`Transfer-Encoding: chunked`) decoding in `TailscaleConnectionReader.writeChunkedTo` so the client receives the decoded message payload directly. Robustly handles single newlines in headers and chunk delimiters. Non-Tailscale hosts fall through to `fallbackEngine.execute(data)`. Used internally by `TailscaleDesktopTokenRepository` and can be wired wherever a Tailscale-routed HTTP client is needed.

### `TailscaleDashboardViewModel`

Drives a `DashboardUiState` covering:

| Field           | Type              | Meaning                                |
|-----------------|-------------------|----------------------------------------|
| `connectionState` | `ConnectionState` | Disconnected / Connecting / NeedsLogin / Connected / Error |
| `status`        | `TailscaleStatus?`| Peer list + self info when connected   |
| `isRefreshing`  | `Boolean`         | Pull-to-refresh indicator              |
| `error`         | `String?`         | Non-fatal banner error                 |
| `initError`     | `String?`         | Fatal: native lib failed to load       |
| `savedAuthKey`  | `String?`         | Pre-fills the connect form             |

Key operations: `connect(hostname, authKey?)`, `disconnect()`, `refreshStatus()`, `reconnect()` (repeats last config), `retryInit()` (re-attempts native init).

Internally calls `createTailscaleNode()` from the KMP library, then `observeConnectionState()` collects the `connectionState` flow and auto-refreshes status on `Connected` transitions. A guard prevents the node's initial `Disconnected` emission from overwriting an in-progress `Connecting` state.

### `TailscaleDashboard`

`@Composable` that receives the full `DashboardUiState` plus callbacks. Renders:

- `ConnectionHeader` — coloured status card with a dot indicator.
- State-based body via `Crossfade`: `DisconnectedView` (hostname + auth key form + connect button), `ConnectingView` (spinner), `NeedsLoginView` (URL + open-browser button), `ConnectedList` (pull-to-refresh peer list + tailnet info + disconnect button).
- `PeerCard` — expandable; shows OS, IP, online dot, connection badge (`Direct` in green or `Relay via <name>` in orange).
- `InitErrorView` / `ErrorView` — full-screen error with retry button.
- Optional error banner at the bottom for non-fatal errors.

Strings are in `strings_tailscale.xml` (commonMain composeResources). Two new string resources were added in "Screenshots and platform tests" (2026-05-15) to support the updated `ConnectionHeader` and reconnect action labels.

### External Library

`io.github.otiasj:tailscale-kmp:0.6.0` — KMP wrapper around the Tailscale Go mobile library. Provides `TailscaleNode`, `createTailscaleNode()`, `ConnectionState`, `TailscaleConfig`, `TailscaleStatus`, `PeerInfo`, `openUrl()`, `node.listen(port)` (accept Tailscale-network TCP connections), `node.dial(ip, port)`, `node.httpPost(host, port, path, body)`, and `node.getIPs()`.

## Bundled Native Library

The Tailscale native library is bundled under `desktopMain/resources/natives/` for multiple platforms, extracted at JVM startup by `NativeLibraryExtraction`:

| Platform | Resource path | File |
|---|---|---|
| macOS Apple Silicon | `natives/darwin-arm64/` | `libtailscale.dylib` |
| macOS Intel | `natives/darwin-amd64/` | `libtailscale.dylib` |
| Linux x86-64 | `natives/linux-amd64/` | `libtailscale.so` |
| Windows x86-64 | `natives/windows-amd64/` | `libtailscale.dll` |
| Windows ARM64 | `natives/windows-arm64/` | `libtailscale.dll` |

No system-level library installation is needed on any of these platforms. `NativeLibExtractor.extractTailscale(userHome, osName, osArch)` (in `desktopMain/app/main.kt`) selects the correct resource by normalising the OS name and architecture; the extracted file is cached in `~/.demo3/natives/`. For Windows, `arm64`/`aarch64` maps to `windows-arm64` and `amd64`/`x86_64` maps to `windows-amd64`. `desktopTest/NativeLibraryExtractionTest.kt` covers all five platforms: macOS Intel, macOS ARM64, Linux x86-64, Windows x64 (`testExtractionWindowsAmd64`), Windows ARM64 (`testExtractionWindowsArm64`), plus unsupported-platform null-return behaviour.

## LLM Backend Benchmarking in Dashboard

`TailscaleDashboard` and `TailscaleDashboardViewModel` now live in `commonMain` (not just `desktopMain`). The ViewModel gains per-peer LLM backend probing:

- `DashboardUiState.peerStates: Map<String, PeerActionState>` tracks backend fetch + benchmark state per peer.
- `PeerActionState` holds `backends: List<PeerBackendInfo>?` (backend name, models, `latencyMs`, `speedResult`).
- Selecting a peer triggers `fetchBackendsForPeer(peerId)`, which calls the peer's AI proxy and then benchmarks each discovered backend via `LlmBackendRegistry.benchmarkBackend(backend, model)`.
- `LlmLatencyIndicator` (in `platform/tailscale/ui/component/`) renders a coloured `ms` badge per peer card: green (<200 ms), orange (<1 000 ms), red (≥1 000 ms).

`TailscaleDashboardViewModel` accepts an optional `injectedNode: TailscaleNode?`, `injectedInitError: String?`, `sendTokenUseCase`, and `addressRepository: DesktopAddressRepository`.

## Integration

`Features.DEMO3_COLLECTION` now includes `FeatureDefinitions.TAILSCALE` as the second item (after Template, before Catalog). This makes the Tailscale screen accessible via the Demo3 feature dashboard on all platforms.

## Known Issues / Constraints

- `TailscaleDashboard` uses `PullToRefreshBox` for the peer list; `onReconnect` callback exposed in its signature.
- `isOffline` is hardcoded to `false` in `tailscaleRoute` — marked with `//fixme`.
- `modifier` parameter in `TailscaleScreen` call to `TailscaleDashboard` is commented out — inner padding may not apply correctly.
- The feature is registered on all platforms (Android, iOS, Desktop, Wasm), but `createTailscaleNode()` may fail on platforms where the native lib is absent — the ViewModel surfaces this as `initError`.

## See Also

- [`../demo3-platform.md`](../platform.md) — `platform/tailscale/` sub-module detail.
- [`../demo3-app-shell.md`](../app-shell.md) — `Features.DEMO3_COLLECTION` and DI registration.
- [`../demo3-core.md`](../core.md) — `DiProvider`, `AuthTokenProvider`.

_Last updated: 2026-07-05 — Windows desktop Tailscale support: `libtailscale.dll` bundled for `windows-amd64` and `windows-arm64`; `NativeLibraryExtractionTest` expanded with `testExtractionWindowsAmd64` and `testExtractionWindowsArm64`. `tailscale-kmp` bumped from `0.4.0` to `0.6.0`. `NativeLibExtractor` (in `main.kt`) now correctly routes Windows ARM64 (`aarch64`) to `windows-arm64` before the `amd64` branch._
_Previous: 2026-07-04 — Native library bundled for three platforms: `darwin-arm64`, `darwin-amd64` (Intel Mac), and `linux-amd64`. `NativeLibraryExtractor.extractTailscale(userHome, osName, osArch)` selects the correct resource; `NativeLibraryExtractionTest` expanded with coverage for macOS Intel, Linux x86-64, and unsupported-platform cases._
_Previous: 2026-07-03 — `libtailscale.dylib` bundled in `desktopMain/resources/natives/darwin-arm64/`; `NativeLibraryExtractionTest` added. `TailscaleDashboard` + `TailscaleDashboardViewModel` moved to `commonMain`. `DashboardUiState` gains per-peer `peerStates` map with `PeerBackendInfo` (latency, speed) for LLM backend benchmarking. `LlmLatencyIndicator` component added. `TailscaleTcpProxyE2ETest` added to `desktopTest`._
_Previous: 2026-06-19 — Added `ClientAutoConnectCoordinator`: 5-step auto-connect flow for client platforms (start node → wait connected → discover desktop via exponential-backoff probing → register FCM → warm LLM backend cache). Complements the existing `TailscaleWarmupCoordinator` (desktop)._
_Previous: 2026-06-05 — Refactored TailscaleHttpClientEngine to support progressive streaming responses and chunked transfer encoding decoding, bypassing the connection-blocking readAll read. Fixed newline boundary-parsing bug._
_Last updated: 2026-06-04 — Added `TailscaleWarmupCoordinator`: auto-starts node on login, awaits `Connected`, runs parallel peer discovery probe, saves desktop address; stops node on logout. `TailscaleWarmupCoordinatorTest` added to `commonTest`._
_Last updated: 2026-06-02 — `TailscalePlugin` now binds `HttpEngineProvider` DI key to `TailscaleHttpEngineProvider`, routing all `LoggingHttpClient` traffic through Tailscale for 100.x/ts.net hosts; desktop server confirmed working over Tailscale; Tailscale HTTP client refactored_
