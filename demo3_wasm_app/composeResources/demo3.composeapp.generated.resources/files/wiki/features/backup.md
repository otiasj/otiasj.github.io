---
type: feature
title: Backup
description: Cross-platform encrypted backup with CRDT-based peer sync over Tailscale.
  UI is embedded in the Tailscale peers screen — no own route.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/backup/,
  Applications/Demo3/composeApp/src/androidMain/kotlin/com/otiasj/features/backup/,
  Applications/Demo3/composeApp/src/desktopMain/kotlin/com/otiasj/features/backup/,
  Applications/Demo3/composeApp/src/iosMain/kotlin/com/otiasj/features/backup/,
  Applications/Demo3/composeApp/src/wasmJsMain/kotlin/com/otiasj/features/backup/,
  Applications/Demo3/composeApp/src/desktopMain/kotlin/com/otiasj/features/desktopserver/backup/]
tags: [demo3, feature, backup, tailscale, sync]
timestamp: '2026-08-08T00:00:00Z'
category: feature
---

# Backup

## Purpose
Cross-platform encrypted backup and peer-to-peer sync system. Every platform can serialize its registered data ("targets") into a single encrypted blob, persist it locally, and merge it with another device's blob over a direct Tailscale connection using state-based CRDT merging — no central backend involved.

Location: `features/backup/` (**not** `platform/backup/` — despite backup being a cross-cutting concern like the modules documented in [`platform.md`](../platform.md), its code lives under `features/` as a self-contained slice with its own DI component).

## Route & Entry Point

None. This feature has no `@Serializable` route and is not in any `NavHost`. Its UI (`BackupSyncCard`) is embedded directly inside `PeerBackupSection` on the Tailscale **Peers** screen (`features/tailscale/ui/PeersScreen.kt`), rendered once per peer (including "self", i.e. the local device vs. the paired Desktop server).

- `BackupComponent` is registered with `DiProvider` from `TailscalePlugin.registerComponents()` (`app/plugins/TailscalePlugin.kt`).
- `TailscaleComponent.backupSyncViewModel` resolves `BackupComponent`'s `BackupSyncViewModel` lazily — the two features are wired together at the component level, not via navigation.
- `AppShell.kt` calls `platformBackupManager().initialize(tokenProvider)` on login (and again after a specific auth-state transition) to load/generate the AES master key and attempt an automatic local restore.

## Key Types

| Type | Where | Role |
|---|---|---|
| `PlatformBackupManager` | `domain/PlatformBackupManager.kt` | Interface implemented per platform (`expect fun platformBackupManager()`). Registers targets, owns the AES master key, and reads/writes the encrypted backup file. |
| `BackupTarget` | `data/BackupTarget.kt` | Interface for a pluggable backup source: `serialize()`, `restore(bytes)`, default `merge(incoming)` (last-write-wins: adopts incoming if non-empty, else keeps local), optional `onChanged: Flow<Unit>` + `notifyChanged()` for reactive auto-backup. |
| `LocalDataSourceBackupTarget` | `data/LocalDataSourceBackupTarget.kt` | Target over `LocalDataSource` (key-value prefs). Overrides `merge()` with real per-key CRDT logic: adds/removes keys present on only one side, and for `tasklist_items_v1` specifically, merges the two `TaskItem` lists element-by-element using `updatedAt` (LWW) rather than replacing the whole blob. |
| `DatabaseBackupTarget` / `DesktopDatabaseBackupTarget` / `IosDatabaseBackupTarget` | platform actuals | Whole-file target wrapping the app's SQLite DB file. No custom `merge()` — falls back to `BackupTarget`'s default (whichever side wins, wins wholesale; no row-level merge for the DB blob). |
| `BackupEnvelope` / `BackupMetadata` | `data/BackupEnvelope.kt` | Plaintext wire framing: `"DEMO3BAK"` magic bytes + big-endian length-prefixed JSON `BackupMetadata` (`schemaVersion`, `timestamp`, `appVersionCode`) + the encrypted payload bytes. `unwrap()` returns `null` on bad magic/short input. |
| `BackupPayload` | `data/BackupManagerProvider.kt` | `@Serializable data class(targets: Map<uniqueId, Base64String>)` — the JSON that gets AES-encrypted. |
| `BackupSyncManager` | `data/BackupSyncManager.kt` | Client-side: POSTs the local encrypted backup to a peer's `/api/backup/sync`, writes back and restores whatever merged bytes the peer returns. |
| `ClerkMetadataSync` | `data/ClerkMetadataSync.kt` | Reads/writes the shared AES-256 master key from/to Clerk's `unsafe_metadata.backup_key` (base64) via `GET`/`PATCH https://{clerkHost}/v1/me` — this is how the same key ends up on every one of a user's devices. Also hosts a hand-rolled `Base64` object (encode/decode) shared by the whole feature — not `kotlin.io.encoding.Base64`. |
| `BackupSyncViewModel` / `BackupUiState` | `ui/BackupSyncViewModel.kt` | Drives the 4-step sync UI (`SyncStep` list) and exposes `localBackupMetadata` + `taskCount` for the "local state" summary. |
| `BackupSyncCard` | `ui/BackupSyncCard.kt` | Stateless Compose card: header + sync-all button, local backup summary, live step-by-step progress list, and the list of reachable sync peers. |

## Architecture

```
features/backup/
├── BackupComponent.kt          # DI: exposes BackupSyncViewModel
├── data/
│   ├── PlatformBackupManager*  # platform actuals: android/desktop/ios/wasmJs
│   ├── BackupManagerProvider.kt  # expect fun platformBackupManager()
│   ├── BackupTarget.kt
│   ├── LocalDataSourceBackupTarget.kt
│   ├── BackupEnvelope.kt
│   ├── BackupSyncManager.kt     # client → desktop server POST /api/backup/sync
│   └── ClerkMetadataSync.kt     # master-key exchange via Clerk unsafe_metadata + Base64 codec
├── domain/
│   └── PlatformBackupManager.kt # the interface itself
└── ui/
    ├── BackupSyncViewModel.kt
    └── BackupSyncCard.kt

features/desktopserver/backup/
└── BackupRouter.kt              # server side: POST /api/backup/sync (CRDT merge + history rotation)
```

Deviates from the standard `data/domain/ui` feature template (see [`template.md`](template.md)): there's no `domain/usecase/` or `domain/model/` layer, and `domain/` holds only the `PlatformBackupManager` interface (the `data/` package also directly hosts platform-neutral types like `BackupTarget`, `BackupEnvelope`, `BackupPayload` that would normally live in `domain/model/`).

## Data Flow

### Local backup (per device)
```
PlatformBackupManager.backup()
  → serialize() every registered BackupTarget → BackupPayload(targets: Map<id, base64>)
  → AES/CBC/PKCS5Padding encrypt with the Clerk-synced master key (random 16-byte IV prepended)
  → BackupEnvelope.wrap(metadata, encryptedPayload)
  → write atomically: .tmp → validate (decrypt round-trip) → rename over the real file,
    previous file kept as .bak until the new one is confirmed good (Android/Desktop only)
```

### Auto-backup on local change
Android/Desktop/iOS actuals subscribe to every registered target's `onChanged` flow, `debounce(500ms)`, then call `backup()` followed by `triggerRemoteSync()` (only fires if a `TailscaleComponent` node exists **and** is `Connected`, using the last-saved `DesktopAddressRepository` address). Two independent triggers feed this:

- The default `main_database` target (`DatabaseBackupTarget`/`DesktopDatabaseBackupTarget`/`IosDatabaseBackupTarget`) is notified from the generic repository layer — `AndroidRepository.kt` / `DesktopRepository.kt` / `IosRepository.kt` call `notifyChanged()` on it after DB-affecting writes, so essentially any app database mutation can trigger a debounced auto-backup.
- The `tasklist_settings` `LocalDataSourceBackupTarget` (registered once by `TasklistComponent.kt`) is notified from `TasklistRepositoryImpl.kt` after saving tasks, and — reusing the same target/uniqueId rather than registering its own — from `WeatherLocationRepositoryImpl.kt` after saving the weather widget's location.

### Manual peer sync (`BackupSyncViewModel.syncBackup`)
Driven from the Peers screen's "Sync All" button, tracked as 4 `SyncStep`s shown live in `BackupSyncCard`:

```
1. Preparing local database         (artificial 300ms delay for UX pacing)
2. Generating local backup payload  → backupManager.backup()
3. Connecting and sending to peer(s)
     for each target peer:
       BackupSyncManager.sync("{peerIp}:{port}")
         → POST http://{peer}/api/backup/sync
             Authorization: Bearer {Clerk JWT}
             body: local encrypted BackupEnvelope bytes
4. Applying merged results          → writeBackupBytes(mergedBytes) → restore()
```

If the tapped peer is "self" (the local device, as opposed to a specific remote peer row), sync fans out to **every online peer of the opposite kind** — mobile syncs to all online desktop servers, desktop syncs to all online non-desktop peers.

### Server-side merge (`BackupRouter`, desktop only)
`POST /api/backup/sync` on the embedded Ktor server:

1. **Authorize** — decode the JWT's `sub` claim (no signature verification — trusts the Tailscale network boundary) and require it match `DesktopAuthBridge.currentUser?.id`; `401`/`403` otherwise.
2. **Unwrap** the client's `BackupEnvelope`; `400` on bad magic bytes.
3. **Schema check** — reject (`400`) if the client's `schemaVersion` is newer than the server's `AppDatabase.Schema.version`.
4. **Decrypt** the client payload using the server's own master key (`platformBackupManager().getMasterKey()`); `500` if the server has no key yet.
5. **CRDT merge per target** — for the union of client target IDs and the server's registered target IDs, call `localTarget.merge(clientBytes)` (falls back to whichever side has data if a target only exists on one side, or if `merge()` throws).
6. **Re-encrypt** the merged `BackupPayload` with a fresh IV and wrap it in a new `BackupEnvelope`.
7. **Persist + rotate history** — writes to `~/.demo3/backup.bin`, first copying the previous file into `~/.demo3/backup_history/backup_{timestamp}.bin` and pruning that directory down to the 5 most recent files.
8. **Respond** `200 OK` with the merged envelope bytes — the client writes and restores from this response (step 4 above).

Full endpoint reference (request/response shape) belongs alongside the other desktop-server routes: see [`desktop-server.md`](../desktop-server.md#feature-10--backup-sync-api).

## Security Model

- **Master key**: 256-bit AES key, generated on first `initialize()` call on whichever device logs in first, then stored in Clerk's `unsafe_metadata.backup_key` (base64) so every device for that user fetches the *same* key on `initialize()`. Cached locally afterward (`Preferences` on Desktop, `SharedPreferences` on Android, `NSUserDefaults` on iOS) so subsequent app launches don't need a network round-trip.
- **Encryption**: AES/CBC/PKCS5Padding everywhere, 16-byte random IV prepended to the ciphertext, per platform: `javax.crypto` (Android/Desktop), CommonCrypto `CCCrypt` (iOS).
- **Sync-endpoint auth**: the desktop `/api/backup/sync` route only checks that the JWT's unverified `sub` claim matches the currently-logged-in Clerk user on that server — there is **no signature verification** of the JWT. The real trust boundary is the Tailscale network (only devices on the same tailnet can reach the port at all).
- **Payload integrity on write**: Android/Desktop `writeBackupBytes()` validates the incoming bytes decrypt successfully *before* committing over the previous file, and restores the `.bak` copy if the swap or the subsequent `restore()` fails.

## Platform Implementations

| Platform | File | Notes |
|---|---|---|
| Android | `androidMain/…/PlatformBackupManager.android.kt` | Full impl. Backup file: `context.filesDir/backup.bin` (+ `.tmp`/`.bak`). Default target: `DatabaseBackupTarget` (whole SQLite file). |
| Desktop | `desktopMain/…/PlatformBackupManager.desktop.kt` | Full impl, same atomic-write pattern. Backup file: `~/.demo3/backup.bin`. Default target: `DesktopDatabaseBackupTarget`. Also the only platform that hosts the sync **server** (`BackupRouter`). |
| iOS | `iosMain/…/PlatformBackupManager.ios.kt` | Full impl using CommonCrypto (`CCCrypt`) instead of `javax.crypto`. Backup file: app Documents directory `backup.bin`; DB target reads from Application Support `app_database.db`. No atomic tmp/bak swap (writes directly). |
| Wasm | `wasmJsMain/…/PlatformBackupManager.wasmJs.kt` | Stub — `registerTarget` is a no-op, `initialize`/`backup`/`restore` all return `true` without doing anything. No `getMasterKey`/`getTargets`/`getBackupBytes`/`writeBackupBytes` (not part of the interface's Wasm surface used). |

## Dependencies

- `core/data/datasource/remote/auth/AuthTokenProvider` — supplies the Clerk JWT used both for the Clerk metadata API and the `/api/backup/sync` bearer header.
- `core/data/db/AppDatabase.Schema.version` — the schema-version gate that blocks restoring/merging a newer-schema backup into an older app.
- `features/tailscale/` (`TailscaleComponent`, `PeersScreen`) — hosts the only UI entry point and supplies the peer list / connection state used for both manual and automatic sync.
- `features/sendtoken/DesktopAddressRepository` — supplies the last-known desktop server address for automatic background sync.
- `features/tasklist/` — registers the `tasklist_settings` `LocalDataSourceBackupTarget` and notifies it on save; `features/weather/` reuses the same target/uniqueId to back up its saved location instead of registering its own.
- `features/desktopserver/` (`DesktopServerComponent`, `DesktopServerRouter`) — hosts `BackupRouter` on the embedded Ktor server.

## Known Issues / Drift

- Feature lives at `features/backup/`, not `platform/backup/` — earlier wiki revisions documented it under `platform.md` by mistake; corrected here.
- `BackupRouter`'s JWT check only compares the unverified `sub` claim; it does not verify the Clerk JWT signature. Acceptable given the Tailscale-only trust boundary, but worth flagging if this endpoint is ever exposed beyond the tailnet.
- Whole-file `DatabaseBackupTarget`/`DesktopDatabaseBackupTarget`/`IosDatabaseBackupTarget` targets have no real CRDT merge — only `LocalDataSourceBackupTarget` does. A concurrent DB write on two devices before a sync will silently drop one side's DB changes (whichever side's `merge()` — i.e. default last-write-wins — loses).
- Wasm has no real backup/restore/sync at all; the UI only renders meaningfully on Android/Desktop/iOS.
- `WeatherLocationRepositoryImpl` looks up the backup target by the literal uniqueId `"tasklist_settings"` rather than registering its own target — an unrelated feature piggybacking on tasklist's target by name is fragile (renaming or removing the tasklist target silently stops weather-location backup).

## Tests

| File | What it tests |
|------|---------------|
| `commonTest/…/backup/data/BackupCrdtTest.kt` | `LocalDataSourceBackupTarget.merge()`: insertion/update merging by `updatedAt` (`testMergeInsertionsAndUpdates`) and tombstone/deletion merging (`testTombstoneMerging`). |

No test coverage for `BackupEnvelope` framing, `BackupSyncManager`/`BackupRouter` network round-trip, or the encryption/decryption path on any platform.

## See Also

- [`features/tasklist.md`](tasklist.md) — primary `BackupTarget` consumer.
- [`desktop-server.md`](../desktop-server.md#feature-10--backup-sync-api) — `/api/backup/sync` endpoint reference and its place among the other desktop server routers.
- [`platform.md`](../platform.md) — `platform/tailscale/` (`TailscaleDashboardViewModel`, connection state) that gates automatic sync.

_Last updated: 2026-08-08 — page created; corrects prior mis-location under `platform.md` and documents the UI layer, DI wiring, server-side `/api/backup/sync` route, auto-sync-on-change behavior, and backup-history rotation that were previously undocumented._
