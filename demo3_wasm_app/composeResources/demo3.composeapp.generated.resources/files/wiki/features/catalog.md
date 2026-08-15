---
type: feature
title: Catalog
description: A scrollable UI component showcase that lets developers interactively
  inspect every design-system primitive in the app.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/catalog/]
tags: [demo3, feature, catalog]
timestamp: '2026-08-01T00:00:00Z'
last_commit: f690d6824
category: feature
---

# Catalog

## Purpose

A developer-facing UI component showcase: a `FiltersCatalog` header pinned above a `LazyColumn` of 15 catalog cards, each demonstrating a distinct component group (buttons, dialogs, WebView, AI chat, card sorter, Revivle-brand UI, icons, typography, etc.). Doubles as the live host for two dev-only sub-features: the Clerk `unsafeMetadata` inspector (only stateful item) and the `pushtest/` FCM test-push tool.

Location: `features/catalog/`

## Responsibility

**Owns:** rendering every shared/reusable UI component in a single scrollable screen; loading Clerk `unsafeMetadata` as a live data sample via `CatalogRepository`; hosting the `pushtest/` sub-feature (FCM push tester).

**Does not own:** production user flows, business logic, persistent state, or any per-item domain models — each sub-catalog composable is otherwise self-contained. Not part of the production navigation graph (registered under the `Catalog` collection tab in `HomeComponent`).

## Route & Entry Point

```kotlin
@Serializable
object Catalog

fun NavGraphBuilder.catalogScreenRoute(contentPadding: PaddingValues = PaddingValues())
fun NavController.navigateToCatalogScreen()
```

Registered in `AppShell.kt` (`DiProvider.registerComponent(CatalogComponent())`) and wired into the NavHost via `catalogScreenRoute(...)` inside the `HomeComponent` collection routes. `pushtest/`'s `PushTestComponent` is registered by `PushNotificationPlugin` (skipped on Desktop, which registers its own with devices + `FcmSender`).

## Key Types

| Type | Description |
|------|-------------|
| `Catalog` | `@Serializable` route object (zero args). |
| `CatalogComponent` | Manual DI container; `by lazy` wires `CatalogRepositoryImpl` → `CatalogScreenViewModel`. |
| `CatalogRepository` (`domain/repository/`) | `suspend fun getUnsafeMetadata(): Map<String, String>?` |
| `CatalogRepositoryImpl` (`data/repository/`) | Delegates to `ClerkUnsafeMetadataDataSourceFactory.create()`. |
| `CatalogScreenViewModel` | Extends `core.ui.ViewModel<CatalogUiState>`; exposes `loadUnsafeMetadata()`. |
| `CatalogUiState` | Sealed interface: `Loading`, `Success(unsafeMetadata: Map<String, String>?)`, `Error(message: String)`. |
| `CatalogScreen` | Root `@Composable`; renders `FiltersCatalog` + `LazyColumn` of 15 sub-catalog items. |
| `components/*` (17 files) | Sub-catalog composables rendered as `LazyColumn` items. Note function names differ from filenames for three: `HorizontalGallery.kt` → `horizontalGallery`, `IconCatalog.kt` → `IconsCatalog`, `TextCatalog.kt` → `TextsCatalog`. Plus `AiChatCatalog` from `platform/ai/ui/`. |
| `ui/` | Image-picker demo pages (`ComprehensiveImagePickerDemo`, `ImagePickerScreen`, `UploadSection`, `DebugInfoSection`). |
| `pushtest/PushTestComponent` | Push tester sub-feature. Lazy-wires `SendTestPushUseCase(fcmSender)` → `PushTestViewModel`; ctor takes optional `devicesFlow`, `FcmSender` (defaults to `UnsupportedFcmSender`), and `FcmSettingsRepositoryInterface`. Registered by `PushNotificationPlugin` on non-Desktop; Desktop registers its own instance with a real `FcmV1Sender`. |
| `pushtest/PushTestViewModel` | MVI-ish; exposes `PushTestUiState` (`Idle`/`Sending`/`Results`/`Error`) plus 8 `MutableStateFlow` form fields (title, body, selectedType, link, selectedTokens, serviceAccountPath, isManualTokenExpanded, devices). |
| `pushtest/SendTestPushUseCase` + `FcmSender` (fun interface) + `UnsupportedFcmSender` | Thin `invoke` wrapper over `FcmSender.send(...)`. Desktop supplies `FcmV1Sender` (OAuth2 service account); other platforms use the stub. |
| `pushtest/PushDeviceInfo`, `PushSendResult`, `FcmSettingsRepositoryInterface` | Value types + persistence interface for the tester. |

## Architecture

Three-layer feature following Clean Architecture boundaries:

```
catalog/
├── CatalogComponent.kt              ← manual DI; Impl → interface → VM
├── CatalogScreen.kt                 ← @Serializable Catalog + catalogScreenRoute
├── CatalogScreenViewModel.kt        ← core.ui.ViewModel<CatalogUiState>
├── data/repository/                 ← CatalogRepositoryImpl
├── domain/repository/               ← CatalogRepository (interface)
├── components/                      ← 17 stateless sub-catalog composables
├── ui/                              ← image-picker demo pages
└── pushtest/                        ← FCM push-tester sub-feature (MVI)
    ├── PushTestComponent.kt
    ├── PushTestViewModel.kt
    ├── PushTestUiState.kt
    ├── SendTestPushUseCase.kt
    ├── FcmSender.kt / FcmSettingsRepositoryInterface.kt / PushDeviceInfo.kt / PushSendResult.kt
    └── ui/PushTestScreen.kt, PushTestCatalogEntry.kt
```

`catalogScreenRoute` resolves the ViewModel via `DiProvider.getComponent(CatalogComponent::class).viewModel`, collects `uiState` with `collectAsStateWithLifecycle()`, wraps `CatalogScreen(state)` in a `Box` with the injected `contentPadding`, and fires `viewModel.loadUnsafeMetadata()` inside `LaunchedEffect(Unit)`.

## Data Flow

1. `catalogScreenRoute` mounts → `LaunchedEffect(Unit) { viewModel.loadUnsafeMetadata() }`.
2. VM sets state to `Loading`, then suspends on `catalogRepository.getUnsafeMetadata()` (Clerk backend).
3. On success: `Success(unsafeMetadata = ...)`. On exception: `Error(message = e.message ?: "Unknown error")`.
4. Only `ClerkUnsafeMetadataCatalog` reacts to state (receives `isLoading` + `metadata`); the other 14 catalog items are stateless and always render.
5. Catalog items with user interaction (Dialog, Share button in Buttons, WebView, RevivleCatalog form inputs) manage their own local `remember` state — none flow back through the ViewModel.

For `pushtest/`, Desktop supplies a `StateFlow<List<PushDeviceInfo>>` from the embedded Ktor Token Registry into `PushTestViewModel`. User selects tokens + edits title/body → `onSend()` iterates each token and invokes `SendTestPushUseCase(fcmSender)`, aggregating a `List<PushSendResult>` back into `Results`.

## Dependencies

- **Own:** `CatalogRepositoryImpl`, `pushtest/SendTestPushUseCase`, `pushtest/UnsupportedFcmSender`, all `components/*` composables.
- **Core:** `core.ui.ViewModel<T>`, `core.di.DiProvider`, `core.ui.components.screenContentPaddingValues`, `core.ui.components.*Text` typography wrappers, `core.data.datasource.remote.auth.ClerkUnsafeMetadataDataSourceFactory`.
- **Cross-module:** `platform.ai.ui.AiChatCatalog` (rendered inline), `shared.revivle.components.*` (Revivle brand components in `RevivleCatalog`), `app.theme.revivle.RevivleTheme`, `app.theme.default.AppTheme`.
- **Cross-feature:** `features.graphqlexample.data.datasource.remote.PixabayAPI` (used indirectly by `CardSorterCatalog` in tests).
- **Compose Multiplatform**, AndroidX Lifecycle, AndroidX Navigation, `kotlinx.serialization`, `kotlinx.coroutines`.
- **Compose Resources:** `Res.string.clerk_unsafe_metadata_title`, `Res.drawable.instagram_outline`/`linkedin_outline`/`tiktok_outline`/`sparkle` (Revivle icons).

## Known Issues / Drift

- **`PushTestViewModel` extends `androidx.lifecycle.ViewModel` directly** (`pushtest/PushTestViewModel.kt:14`) instead of `core.ui.ViewModel<T>` — misses shared analytics/offline hooks and the sealed-`UiState` convention.
- **`PushTestViewModel` exposes 8 separate `MutableStateFlow` form fields** (title, body, selectedType, link, selectedTokens, serviceAccountPath, isManualTokenExpanded, devices) alongside `uiState`, rather than a single sealed `UiState`. Diverges from the sealed-interface pattern the rest of the app uses.
- **Hardcoded user-visible strings in `pushtest/ui/PushTestCatalogEntry.kt:42-49`** ("Push Test", "Send FCM push notifications to registered devices") — should use `stringResource(Res.string.*)`.
- **Hardcoded strings in `components/RevivleCatalog.kt`** ("Revivle UI Components", "Light Mode", "Dark Mode", "Buttons", "Checkboxes & Radio Buttons", "Search & Badge", "Inline Input Fields", "Revivle SVG Icons") — dev-facing, but still counts as convention drift.
- **`CatalogUiState.Error` has no dedicated UI branch** (`CatalogScreen.kt:78-82`) — errors render identically to "no metadata" because only `Loading` and `Success` are matched by `ClerkUnsafeMetadataCatalog`.
- **No stateless `Content(state, onEvent)` extraction** — `CatalogScreen(state)` is the direct render entry; the `Screen`/`Content` split convention isn't applied.
- **No `@Preview` for `CatalogScreen`** — only `PushTestCatalogEntry` has one.
- **Commented-out `CoilImage()` call** in `CatalogScreen.kt:70` — dead code.
- **`AiChatCatalog` cross-module dependency** — reaches into `platform.ai.ui` from a feature module, worth flagging as cross-feature coupling beyond conventions.

## Tests

`commonTest` (`composeApp/src/commonTest/kotlin/com/otiasj/features/catalog/`):

| File | What it tests |
|------|---------------|
| `CatalogScreenViewModelTest.kt` | `CatalogScreenViewModel` state transitions: `Loading` → `Success(metadata)` and `Loading` → `Error(message)` (with null-message fallback). Uses `FakeCatalogRepository`. |
| `components/CardSorterViewModelTest.kt` | `CardSorterViewModel`: card queuing, accept/reject actions, completion detection, error paths (uses `FakePixabayAPI`). |
| `data/repository/CatalogRepositoryImplTest.kt` | `CatalogRepositoryImpl` delegation to `ClerkUnsafeMetadataDataSource`: returns metadata, returns null, propagates exceptions (uses `FakeClerkUnsafeMetadataDataSource`). |
| `pushtest/SendTestPushUseCaseTest.kt` | Use-case success + failure delegation to `FakeFcmSender`. |
| `pushtest/PushTestViewModelTest.kt` | `PushTestViewModel` MVI state: token multi-select, form validation (`canSend`), send flow → `Sending` → `Results`, service-account path persistence via `FakeFcmSettingsRepositoryInterface`. |
| `pushtest/FakeFcmSender.kt` | Test double for `FcmSender`. |
| `pushtest/FakeFcmSettingsRepository.kt` | Test double for `FcmSettingsRepositoryInterface`. |

`androidInstrumentedTest` (`composeApp/src/androidInstrumentedTest/kotlin/com/otiasj/features/catalog/`):

| File | What it tests |
|------|---------------|
| `CatalogScreenshotTest.kt` | Screenshot regression for the Catalog collection tab: logs in, navigates to the Catalog collection, waits for `nav_tab_Catalog`, captures screenshots at dashboard, collection, and catalog views. Extends `ScreenshotTestBase`. |
| `AgentScreenshotTest.kt` | Screenshot regression for the Agent (Jules) tab under the AILift collection: logs in, navigates via `nav_tab_Agent`, captures dashboard/collection/agent screenshots. Extends `ScreenshotTestBase`. |

## See Also

- [`../core.md`](../core.md) — `ViewModel<T>` base class and `DiProvider`.
- [`index.md`](index.md) — feature module overview and conventions.
- [`../platform.md`](../platform.md) — `platform.ai.ui.AiChatCatalog` origin.
- [`../app-shell.md`](../app-shell.md) — where `CatalogComponent` is registered and `catalogScreenRoute` wired into the NavHost.
- [`push.md`](push.md) — production push-notification feature that `pushtest/` complements.

_Last updated: 2026-08-01 — Added `RevivleCatalog` (PR f690d68), corrected component names (`IconsCatalog`/`TextsCatalog`/`horizontalGallery`), added `CatalogScreenshotTest`, refreshed `Known Issues / Drift` with `pushtest/` convention gaps and error-branch UI omission._
_Previous: 2026-07-06_
