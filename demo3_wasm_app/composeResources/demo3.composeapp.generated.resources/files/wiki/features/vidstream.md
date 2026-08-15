---
type: feature
title: VidStream
description: Demo of real-time video streaming over WebSocket using a mock frame source,
  a bounded FIFO buffer, and full clean-architecture layering.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/vidstream/]
tags: [demo3, feature, vidstream]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# VidStream

## Purpose
Demo of real-time video streaming over WebSocket using a mock frame source, a bounded FIFO buffer, and full clean-architecture layering.

Location: `features/vidstream/`

## Responsibility

Generates mock video frames at a configurable frame rate (1–30 FPS), buffers them locally, and transmits them as `VideoMessage` JSON payloads over a WebSocket connection to a remote server. It also tracks live statistics (frames sent, buffer utilisation, connection quality) and surfaces error/recovery state to the UI.

## Route & Entry Point

- Route object: `VideoStream` (`@Serializable object VideoStream` in `ui/VideoStreamScreen.kt`)
- Navigation helper: `NavController.navigateToVideoStreamScreen()`
- DI entry point: `VideoStreamComponent` — constructed with no external dependencies; wires `LoggingHttpClient` + Ktor `WebSockets` plugin, `WebSocketManager`, `MockFrameDataSource`, `FrameBuffer`, `VideoStreamRepositoryImpl`, and `VideoStreamViewModel` via lazy properties.

## Key Types

| Type | Layer | Role |
|------|-------|------|
| `VideoStreamComponent` | DI | Feature-scoped object graph |
| `VideoStreamViewModel` | UI | Holds `VideoStreamUIState`, drives start/stop/config actions |
| `VideoStreamUIState` | UI | Snapshot: `streamingState`, `statistics`, `serverUrl`, `frameRate`, error/dialog flags |
| `VideoStreamScreen` | UI | Compose screen registered under `VideoStream` route |
| `VideoStreamRepository` | Domain | Interface: `startStreaming`, `stopStreaming`, `updateConfig`, `getStreamingState`, `getStatistics`, `forceConnectionRecovery` |
| `VideoStreamRepositoryImpl` | Data | Delegates to `VideoStreamManager`; guards config with a `Mutex` |
| `VideoStreamManager` | Data | Core coordinator: WebSocket lifecycle, frame generation, buffer loop, session management |
| `MockFrameDataSource` | Data | Emits `MockFrame` objects via a `Flow` at the configured FPS |
| `FrameBuffer` | Data | Thread-safe FIFO queue (capacity 50); drops oldest frame on overflow; exposes `FrameBufferStatistics` |
| `VideoStreamingState` | Data | Sealed: `Idle`, `ConnectingToServer`, `Streaming(framesSent, connectionQuality, bufferSize)`, `Error(error, canRetry)` |
| `VideoStreamingStatistics` | Data | Aggregated counters + computed rates (`processingSuccessRate`, `streamingHealthScore`, etc.) |
| `VideoStreamError` | Data | Sealed `Throwable` subtypes: `WebSocketConnectionFailed`, `FrameEncodingFailed`, `MockDataSourceFailed`, `BufferOperationFailed`, `InvalidConfiguration`, `ServerError` |
| `VideoStreamErrorHandler` | Domain | Maps errors to `RecoveryAction` (retry, warn, stop, reduce rate, clear buffer); tracks consecutive error counts |
| `VideoMessage` | Data | Serialisable payload wrapping a `MockFrame` for wire transmission. Uses standard `@Serializable` + `@SerialName` (WasmJs KSerializer workaround removed after `kotlinxSerialization` downgrade to 1.8.1). |
| `VideoStreamConfig` | Data | Value object: `serverUrl`, `frameRate`, `sessionId`, `clientId` |
| `ConnectionQuality` | Data | Enum: `UNKNOWN`, `POOR`, `FAIR`, `GOOD`, `EXCELLENT` |
| `RecoveryAction` | Domain | Sealed: `Retry`, `RetryAfterDelay`, `ShowError`, `ContinueWithWarning`, `Stop`, `ReduceFrameRate`, `ClearBuffer`, `ShowWarningWithOptions` |

## Architecture

Clean architecture with three layers inside the feature package:

```
ui/          VideoStreamScreen, VideoStreamViewModel, VideoStreamUIState
domain/      VideoStreamRepository (interface), VideoStreamErrorHandler, RecoveryAction
data/        VideoStreamManager, VideoStreamRepositoryImpl, FrameBuffer,
             MockFrameDataSource, MockFrame, VideoMessage, VideoStreamConfig,
             VideoStreamingState, VideoStreamingStatistics, VideoStreamError
```

`VideoStreamComponent` is the manual DI root and is resolved via `DiProvider`.

## Data Flow

1. `VideoStreamViewModel.startStreaming()` validates `VideoStreamConfig` then calls `VideoStreamRepository.startStreaming(config)`.
2. `VideoStreamRepositoryImpl` stores config under a `Mutex` and delegates to `VideoStreamManager.startStreaming()`.
3. `VideoStreamManager` sets state to `ConnectingToServer`, starts `WebSocketManager.connect()` asynchronously, then launches WebSocket state monitoring, message monitoring, and a 5-second connection timeout coroutine.
4. On `WebSocketState.Connected`: `VideoStreamManager` sends a `start_session` JSON message, receives the server-assigned `session_id`, then calls `MockFrameDataSource.startGeneratingFrames(fps)`.
5. `MockFrameDataSource` emits `MockFrame` objects into a `Flow`; `startFrameProcessingLoop()` collects them and enqueues each into `FrameBuffer`.
6. A parallel frame-consumer coroutine dequeues frames, wraps them in `VideoMessage`, and sends them via `WebSocketManager.sendSerializableMessage()` at `MessagePriority.HIGH`.
7. A statistics coroutine updates `_streamingStatistics` every second; `VideoStreamViewModel` observes both `getStreamingState()` and `getStatistics()` as `StateFlow`s and projects them into `VideoStreamUIState`.
8. On error, `VideoStreamErrorHandler` selects a `RecoveryAction`; the VM surfaces it as a dialog or inline warning.

## Dependencies

- `core/data/datasource/remote/websocket`: `WebSocketManager`, `WebSocketUseCase`, `WebSocketState`, `WebSocketMessage`, `MessagePriority`
- `core/data/datasource/remote`: `LoggingHttpClient`
- `core/ui`: base `ViewModel`
- `core/util/platform`: `Log`
- `core/util/time`: `TimeUtils`
- Ktor: `ktor-client-websockets`
- KotlinX: `kotlinx-serialization-json`, `kotlinx-coroutines`

## UI Components

The `ui/VideoStreamScreen.kt` was refactored to delegate rendering to five purpose-built composables under `ui/components/`:

| File | Role |
|---|---|
| `ConfigurationSection.kt` | Server URL + frame rate inputs. |
| `ConnectionStatusCard.kt` | Connection state badge (connecting / streaming / error). |
| `FrameVisualizationCanvas.kt` | Canvas-based live frame visualisation. |
| `StatisticsCard.kt` | Frames sent, buffer utilisation, health score. |
| `StreamingControlButtons.kt` | Start / stop buttons with loading state. |

`VideoStreamScreen` assembles these components inside a scrollable `Column`, passing state down from `VideoStreamUIState` and routing actions back up through `VideoStreamViewModel`.

## Known Issues / Drift

- `startConnectionTimeoutMonitoring()` falls back to calling `startSession()` directly at the 5-second mark if still `ConnectingToServer`; this is a workaround for a suspected WebSocket state-change delivery deadlock and is flagged with comments in `VideoStreamManager`.
- The backoff delay calculation in `VideoStreamErrorHandler.calculateBackoffDelay()` always returns `min(4, 30) = 4` seconds due to a bug (`baseDelay * baseDelay` instead of `baseDelay * 2^retryAttempt`).
- `moveWidget()` in `WidgetEditorScreenViewModel` is declared but has no implementation (empty body).
- Server session ID is derived locally (`"session_${now()}"`) until the server responds; the real ID is patched in when a `"status"/"connected"` message arrives, which means the first few frames may carry a placeholder session ID.
- ~~`VideoMessage`/`VideoMetadata` used hand-rolled `KSerializer` workarounds for a WasmJs FIR bug~~ — resolved. Both now use plain `@Serializable`+`@SerialName` after `kotlinxSerialization` was downgraded to 1.8.1 (see `demo3-build.md`).

## See Also

- `features/websocket/` — lower-level WebSocket demo that `vidstream` builds on top of
- `core/data/datasource/remote/websocket/WebSocketManager.kt` — shared WebSocket infrastructure
- `platform/widget/` — unrelated, but also uses `StateFlow`-based server-driven rendering

_Last updated: 2026-04-30_
