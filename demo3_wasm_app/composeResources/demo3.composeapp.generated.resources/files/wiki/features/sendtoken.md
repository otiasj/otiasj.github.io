---
type: feature
title: Send Token
description: Registers and de-registers this device's FCM push token with a desktop
  dev server so that the desktop push-tester can deliver notifications back to the
  phone.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/sendtoken/]
tags: [demo3, feature, sendtoken]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Send Token

## Purpose

Registers and de-registers this device's FCM push token with a desktop dev server so that the desktop push-tester can deliver notifications back to the phone. It is the client half of the desktop-server token registry (`desktopMain` `tokenregistry`). The interesting part is transport: the token can be sent either over the OS network stack (Ktor) or over the embedded Tailscale userspace network, so registration works even when the desktop peer is reachable only through the Tailscale identity and not the system VPN interface.

Location: `features/sendtoken/`

## Responsibility

Owns the `DesktopTokenRepository` abstraction and its two transports, the `SendTokenToDesktopUseCase` that resolves the FCM token plus platform and forwards it, and the `DesktopAddressRepository` that persists the last-used desktop address. It does **not** own Tailscale node lifecycle (that is the `tailscale` feature) nor the server-side token registry (that lives in `desktopMain`). It is a support library — it has no route or `AppPlugin` of its own; its types are wired and consumed by the `tailscale` feature (`TailscaleComponent`, `TailscaleWarmupCoordinator`, `ClientAutoConnectCoordinator`, `TailscaleDashboardViewModel`).

## Route & Entry Point

No `@Serializable` route and no `NavGraphBuilder` extension — this feature is not a navigable destination. It is instantiated inside `features/tailscale/TailscaleComponent`:

```kotlin
private val sendTokenUseCase: SendTokenToDesktopUseCase by lazy {
    val repo = nodeInit.node?.let { TailscaleDesktopTokenRepository(it) }
        ?: DesktopTokenRepositoryImpl(LoggingHttpClient.create())
    SendTokenToDesktopUseCase(repo)
}
```

The use case is then injected into the Tailscale dashboard ViewModel and the warmup / auto-connect coordinators. There is no `Component` class in this package; DI is handled entirely by `TailscaleComponent`.

## Key Types

| Type | Description |
|------|-------------|
| `DesktopTokenRepository` | Interface: `sendToken(address, token, platform, deviceName)` and `removeToken(address, token)`, both returning `Result<Unit>`. |
| `DesktopTokenRepositoryImpl` | Ktor transport. POST/DELETE `/api/token` over the OS network. Appends `BuildKonfig.DESKTOP_SERVER_PORT` when the address has no `:port`. |
| `TailscaleDesktopTokenRepository` | Tailscale transport. Same endpoints but sent via `TailscaleNode.httpPost`/`httpDelete` over the userspace node. |
| `SendTokenToDesktopUseCase` | Resolves the FCM token (`getFcmToken()` by default) and maps the platform name to `Platform.Android`/`Platform.Ios`, then calls the repository. Fails fast if no token. |
| `DesktopAddressRepository` | Persists/reads the last desktop address under key `desktop_server_address` via `LocalDataSource`. |
| `TokenRegistrationRequest` | `@Serializable` request body: `token`, `platform` (`Ios`/`Android` enum), nullable `deviceName`. |
| `TailscaleHttpResponse` | `data class(statusCode, body)` returned by the raw Tailscale HTTP helpers. |
| `TailscaleNode.httpPost` / `httpDelete` | Extension functions that hand-serialise an HTTP/1.1 request (`Connection: close`) over a `TailscaleNode.dial()` connection and parse the status line + body. |
| `SendTokenDialog` | Composable address-picker dialog (peer list + manual entry). Defined here but not currently wired to any caller — see Known Issues. |
| `TailscalePeerEntry` | `data class(name, address)` for the dialog's peer rows. Also only used by the dialog. |

## UI

**One-line summary.** An `AlertDialog` that lets the user pick a Tailscale peer or type an IP/hostname, then confirms to send the auth token to that desktop. (Currently dead surface — see Known Issues.)

**Summary.** Modal dialog for choosing the desktop address (from a Tailscale peer list or manual entry) before registering the device's push token.

**Layout (with peers).**
```
┌────────────────────────────────────┐
│ Send Auth Token                    │
│                                    │
│ Tailscale Peers                    │
│ ┌────────────────────────────────┐ │
│ │ macbook-pro                    │ │
│ │ 100.64.0.2                     │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ home-server                    │ │
│ │ 100.64.0.3                     │ │
│ └────────────────────────────────┘ │
│                                    │
│ Or enter manually                  │
│ [ Enter IP or hostname           ] │
│                                    │
│              [ Cancel ]  [ Send ]  │
└────────────────────────────────────┘
```

**States.**
- Default → peer list (scrollable, max 240dp) + manual `OutlinedTextField`. Selected peer row is tinted with `primaryContainer`.
- No peers → peer section is hidden; only the manual text field shows.
- Loading → fields/buttons disabled, dismiss suppressed, centered `CircularProgressIndicator` below the field.

**Interactions.**
- Peer row tap → sets `currentAddress` to that peer's address.
- Text field edit → updates `currentAddress`.
- Send (enabled when address non-blank and not loading) → `onConfirm(currentAddress)`.
- Cancel / scrim tap (when not loading) → `onDismiss()`.

**Notes.** All labels come from `Res.string.send_token_*`. The dialog is self-contained (no ViewModel); state is held in a local `remember`. It is currently dead surface — no production composable instantiates it (only the three `@Preview`s do).

## Architecture

```
sendtoken/
├── DesktopTokenRepository.kt          # interface
├── DesktopTokenRepositoryImpl.kt      # Ktor (OS network) transport
├── TailscaleDesktopTokenRepository.kt # Tailscale userspace transport
├── TailscaleHttp.kt                   # httpPost/httpDelete extensions + parser
├── SendTokenToDesktopUseCase.kt       # token + platform resolution
├── DesktopAddressRepository.kt        # persists last address
├── TokenRegistrationRequest.kt        # @Serializable body + Platform enum
├── TailscalePeerEntry.kt              # dialog row model
└── SendTokenDialog.kt                 # address-picker dialog (currently unwired)
```

Transport selection happens once in `TailscaleComponent`: a live `TailscaleNode` yields the Tailscale-routed repository; absence falls back to the Ktor one. Both implement the same interface, so the use case is transport-agnostic.

## Data Flow

1. Caller (Tailscale coordinator or dashboard) invokes `SendTokenToDesktopUseCase(address, deviceName)`.
2. Use case resolves the FCM token via `getFcmToken()`; if null → `Result.failure("No FCM token available on this device")`.
3. Platform name (`getPlatform().name`) is mapped: `startsWith("Android")` → `Android`, else `Ios`.
4. `desktopTokenRepository.sendToken(...)` serialises a `TokenRegistrationRequest` and POSTs to `/api/token` (Tailscale or Ktor).
5. Response: HTTP 200 → `Result.success(Unit)`; other status → `Result.failure("Server returned <code>")`; thrown exception → `Result.failure(e)`.
6. `removeToken(address)` follows the same token-resolution path, then DELETEs `/api/token?token=<encoded>`.
7. `DesktopAddressRepository.saveAddress/getAddress` persists the chosen address out of band for reuse.

## Dependencies

- **Own**: `DesktopTokenRepositoryImpl`, `TailscaleDesktopTokenRepository`, `DesktopAddressRepository`, `SendTokenToDesktopUseCase`.
- **Core**: `LocalDataSource` / `createLocalDataSource` (address persistence), `Log` and `Platform`/`getPlatform` from `core.util.platform`, `BuildKonfig.DESKTOP_SERVER_PORT`.
- **Cross-feature**: consumed by `features/tailscale` (`TailscaleComponent` constructs the repos and use case); depends on `com.otiasj.tailscale.TailscaleNode`/`TailscaleConnection` (embedded Tailscale library) and `platform.push.getFcmToken`.
- **Compose Resources**: `send_token_dialog_title`, `send_token_dialog_cancel`, `send_token_dialog_confirm`, `send_token_dialog_placeholder`, `send_token_peers_section_title`, `send_token_manual_section_title` (in `strings_tailscale.xml`).
- **Navigation**: none. `kotlinx.serialization` is used only for the request body.

## Known Issues / Drift

- **`SendTokenDialog` is dead surface.** No production composable references it (grep across the repo finds only its three `@Preview`s). `tailscale.md` describes a "sendtoken devmenu action to populate the peer picker", but no such wiring exists in `features/devmenu/` — the dialog and `TailscalePeerEntry` are unused.
- **No `sealed interface UiState`.** The dialog uses a plain `loading: Boolean` flag rather than Loading/Success/Error variants. Acceptable for a stateless dialog, but it diverges from the convention if it were ever promoted to a screen.
- **No `Content(state, onEvent)` extraction.** The dialog is already stateless and previewable, so this is informational rather than a defect.
- **Manual URL encoding.** `TailscaleDesktopTokenRepository.encodeUrl()` percent-encodes only `% + & =`; adequate for FCM tokens but not a general-purpose encoder.

## Tests

| File | What it tests |
|------|---------------|
| `sendtoken/SendTokenToDesktopUseCaseTest.kt` | Use case: null-token failure, repo-failure propagation, Android/iOS platform mapping, deviceName pass-through. Defines `FakeDesktopTokenRepository` and `FakePlatform`. |
| `sendtoken/DesktopTokenRepositoryImplTest.kt` | Ktor transport via `MockEngine`: success on 200, failure on 500, network-exception handling. |
| `sendtoken/TailscaleDesktopTokenRepositoryTest.kt` | Tailscale transport: 200 success, non-200 failure, exception, DELETE token encoding, port fallback to `BuildKonfig.DESKTOP_SERVER_PORT`. |
| `sendtoken/TailscaleHttpTest.kt` | `httpPost`/`httpDelete` request serialisation and response parsing. Defines `MockTailscaleConnection`. |
| `sendtoken/DesktopAddressRepositoryTest.kt` | Address persistence via `FakeLocalDataSource`. |

No test exists for `SendTokenDialog` (no ViewModel to cover; it is unwired).

## See Also

- [tailscale](tailscale.md) — owns the Tailscale node and wires this feature's repositories and use case
- [push](push.md) — FCM token source (`getFcmToken()`) consumed by the use case
- [demo3-desktop-server](../desktop-server.md) — server-side token registry that receives these registrations
- [Architecture Overview](../../../ARCHITECTURE.md)

_Last updated: 2026-06-17_
