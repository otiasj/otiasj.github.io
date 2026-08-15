---
type: feature
title: WebSocket
description: Minimal real-time WebSocket demo that lets the user connect to a server,
  send text or binary messages, and watch live incoming traffic.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/websocket/]
tags: [demo3, feature, websocket]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# WebSocket

## Purpose
Minimal real-time WebSocket demo that lets the user connect to a server, send text or binary messages, and watch live incoming traffic.

Location: `features/websocket/`

## Responsibility

Provides an interactive UI for establishing a WebSocket connection, sending predefined or freeform text/binary messages, and displaying the full conversation log in real time. Acts as a thin exercise screen for the core `WebSocketUseCase` infrastructure.

## Route & Entry Point

- Route object: `WebSocket` (`@Serializable object WebSocket`)
- Navigation helper: `NavController.navigateToWebSocketScreen()`
- Graph registration: `NavGraphBuilder.webSocketScreenRoute(onNavigateBack, contentPadding)`
- Entry composable: `WebSocketScreen(viewModel, state)`

The route is part of the Scanner collection in the main nav graph.

## Key Types

| Type | Role |
|---|---|
| `WebSocket` | Serializable nav route object |
| `WebSocketComponent` | DI component; lazily constructs `WebSocketUseCase` via `LoggingHttpClient` + `WebSocketManager` |
| `WebSocketViewModel` | Holds `WebSocketUIState`; drives connect/disconnect/send; polls queue stats every second |
| `WebSocketUIState` | Data class: connection state, server URL, message text, received messages list, `QueueStatistics`, `MessageType` |
| `MessageType` | Enum — `TEXT` or `BINARY` |
| `WebsocketMessages` | Singleton holding five `PredefinedMessage` entries (Ping, Status, Start, Image, End Session) used in the dropdown selector |

## Architecture

Unidirectional data flow with a single `StateFlow<WebSocketUIState>` exposed from `WebSocketViewModel`. The ViewModel extends `com.otiasj.core.ui.ViewModel`. The screen collects state with `collectAsStateWithLifecycle()` and forwards all user actions to named ViewModel methods.

`WebSocketComponent` is resolved at composition time via `DiProvider.getComponent(WebSocketComponent::class)` and is not injected at the graph level — each `composable<WebSocket>` call creates a fresh `viewModel { }` scope.

## Data Flow

1. User sets server URL → `viewModel.updateServerUrl(url)`
2. User taps Connect → `viewModel.connect()` appends a random nonce to the URL and calls `WebSocketUseCase.connect(url)`
3. `webSocketUseCase.webSocketState` flow updates `WebSocketUIState.webSocketState` (`Idle → Connecting → Connected / Error`)
4. Incoming messages arrive on `webSocketUseCase.incomingMessages`; text frames are prefixed `[RECEIVED]`, binary frames are decoded as UTF-8 or shown as hex
5. User selects a predefined message from `WebsocketMessages.messages` or types freeform text, chooses `MessageType`, taps Send → `WebSocketUseCase.sendTextMessageFromInput` / `sendBinaryMessageFromInput`; on success the sent message is echoed into the log with `[SENT]`
6. A background `Job` (`queueStatsUpdateJob`) polls `webSocketUseCase.getQueueStatistics()` every second and writes `QueueStatistics` into state
7. `onCleared` calls `preserveConnectionState()`, then `disconnect()`, then `cleanup()` so state can be restored across configuration changes via `restoreConnectionState()`

## Dependencies

- `com.otiasj.core.data.datasource.remote.websocket.WebSocketUseCase` — all network operations
- `com.otiasj.core.data.datasource.remote.websocket.WebSocketManager` — Ktor WebSocket session management
- `com.otiasj.core.data.datasource.remote.websocket.WebSocketState` — sealed state: `Idle`, `Connecting`, `Connected(messagesSent, messagesReceived, successRate)`, `Error`
- `com.otiasj.core.data.datasource.remote.websocket.WebSocketMessage` — sealed: `Text(content)`, `Binary(data)`
- `com.otiasj.core.data.datasource.remote.LoggingHttpClient` — Ktor HTTP client with logging
- `io.ktor.client.plugins.websocket.WebSockets` — Ktor WebSocket plugin
- `com.otiasj.core.di.DiProvider` — service locator for `WebSocketComponent`

## Known Issues / Drift

- `moveWidget` is declared in `WidgetEditorScreenViewModel` (wrong file referenced in the description); the WebSocket feature itself has no known drift.
- `QueueStatistics` is displayed in state but there is no visible UI panel for it in `WebSocketScreen` — the data is collected but not rendered.
- Binary message input field and `MessageType` toggle are wired in the ViewModel but the `WebSocketScreen` composable only surfaces the text path; the binary UI is not yet visible.
- Default server URL is hardcoded to `ws://otiasj.ddns.net:9091/ws/` — no persistence across process death.

## See Also

- `core/data/datasource/remote/websocket/` — `WebSocketManager`, `WebSocketUseCase`, `WebSocketState`, `WebSocketMessage`, `QueueStatistics`
- `core/data/datasource/remote/LoggingHttpClient`
- Scanner nav graph registration (wherever `webSocketScreenRoute` is called)

_Last updated: 2026-04-22_
