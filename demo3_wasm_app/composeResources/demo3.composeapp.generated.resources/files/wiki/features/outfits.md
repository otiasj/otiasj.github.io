---
type: feature
title: Outfits
description: Social outfit feed allowing users to browse, create, edit, and delete
  outfit posts with comments and pager-based detail viewing.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/outfits/]
tags: [demo3, feature, outfits]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Outfits

## Purpose
Social outfit feed allowing users to browse, create, edit, and delete outfit posts with comments and pager-based detail viewing.

Location: `features/outfits/`

## Responsibility
**Owns:** Outfit feed with tabbed views (Discover, Following, Mine), outfit detail with horizontal pager, outfit CRUD (create with image upload, edit description/date, delete), comment integration via shared comments module.

**Does NOT own:** Comment CRUD logic (delegated to `features.shared.revivle`), user authentication, closet item management, image storage.

## Route & Entry Point
```kotlin
@Serializable object OutfitFeed
@Serializable data class OutfitDetail(val outfitId: Int, val feedType: String? = null)

fun NavGraphBuilder.outfitFeedRoute(
    navigateToOutfitDetail: (OutfitItem, OutfitFeedType) -> Unit,
    navigateToUserCloset: (String) -> Unit,
    contentPadding: PaddingValues = PaddingValues()
)

fun NavGraphBuilder.outfitDetailRoute(
    onNavigateBack: () -> Unit,
    onNavigateToUserCloset: (String) -> Unit,
    contentPadding: PaddingValues = PaddingValues()
)
```
ViewModels obtained via `DiProvider.getComponent(OutfitComponent::class)`.

## Key Types
| Type | Description |
|------|-------------|
| `OutfitComponent` | DI component; wires API, DataSource, repository, 7 use cases, 3+ ViewModels |
| `OutfitFeedViewModel` | Core `ViewModel<OutfitFeedUiState>` -- tabbed feed with per-tab state, pagination |
| `OutfitDetailViewModel` | Core `ViewModel<OutfitDetailUiState>` -- pager-based detail, edit, delete, owner check |
| `CreateOutfitViewModel` | **Drift:** extends `androidx.lifecycle.ViewModel` directly -- image pick + upload |
| `OutfitFeedUiState` | State with `Map<OutfitFeedType, OutfitTabState>` for per-tab isolation |
| `OutfitItem` | Domain model: id, imageUrl, description, owner, likes, comments, dates |
| `OutfitRemoteDataSource` | DataSource wrapping `OutfitsApi` with `safeCall` |
| `PagedOutfitSource` | Interface for swipe-through data sources (feed-backed or static list) |

## Architecture
**Layers:** `data/datasource` (remote DataSource), `data/repository`, `domain/model` + `domain/mappers` + `domain/usecase`, `ui` (3 screens, 3 ViewModels, components).

**DI:** `OutfitComponent` follows `DiProvider` pattern. Creates `LoggingHttpClient.createAuthenticated(tokenProvider)`, instantiates `OutfitsApi`, `CommentsApi`, `AuthenticationApi`. Provides `feedViewModel`, `detailViewModel`, `commentsViewModel` as singletons; `createCreateOutfitViewModel(imagePickerManager)` as factory method.

**Notable patterns:**
- **Per-tab state map:** `OutfitFeedUiState.tabStates` maps each `OutfitFeedType` to an independent `OutfitTabState`.
- **Pager-based detail:** `OutfitDetailViewModel` manages a `HorizontalPager` with `PagedOutfitSource` interface. Two implementations: `FeedViewModelSource` (backed by feed VM's state flow) and `StaticPagedOutfitSource` (for club outfits etc.).
- **Per-page item states:** Detail VM caches `MutableStateFlow<OutfitDetailUiState>` per pager index, fetching full details lazily.
- **Image upload:** `CreateOutfitViewModel` uses `ImagePickerManager` (platform-specific) and `FormPart<InputProvider>` for multipart upload.
- **Comments integration:** Delegates to `RevivleCommentsViewModel` from `features.shared.revivle`.

## Data Flow
**Feed:**
1. `init` loads Discover tab. Tab switches call `selectTab()` which lazily loads if first visit.
2. Scroll-to-end triggers `loadMore()`. Pull-to-refresh triggers `refresh()`.
3. Create dialog opens in-screen; on success refreshes Mine + Discover tabs.

**Detail:**
1. `initialize(outfitId, feedType)` sets up pager source (feed-backed or static or single).
2. `onPageChanged(index)` syncs VM state and loads comments for visible outfit.
3. Edit mode toggles inline form; delete shows confirmation dialog.
4. `loadMore()` on pager source triggers when within 5 items of the end.

## Dependencies
- **Core:** `ViewModel<T>`, `DiProvider`, `LoggingHttpClient`, `AuthTokenProvider`, `Configuration`, `UserRemoteDataSource`, `PaginatedResult`, `Cursor`, `Error`, `safeCall`.
- **Generated API:** `OutfitsApi`, `CommentsApi`, `AuthenticationApi`.
- **Shared feature:** `features.shared.revivle` for `RevivleCommentsViewModel`, `RevivleCommentRepository`, comment use cases, comment UI components.
- **Platform:** `ImagePickerManager` (expect/actual), `ShareButton`.
- **UI:** `CursorPaginationGrid`, `GradientFloatingActionButton`, `InitialLoadingState`, `ErrorState`, `HorizontalPager`.

## Known Issues / Drift
- **`CreateOutfitViewModel` extends `androidx.lifecycle.ViewModel` directly** instead of core `ViewModel<T>`. Manages its own `MutableStateFlow` + `_uiState`. Must be migrated to core base class.
- **`CreateOutfitViewModel` created via factory method** (`createCreateOutfitViewModel(imagePickerManager)`) rather than being a singleton on the component. This is intentional for the `ImagePickerManager` lifecycle, but differs from other VMs.
- **Detail VM holds reference to Feed VM:** `OutfitDetailViewModel` takes `feedViewModel` as constructor parameter for pager data sourcing. This creates a tight coupling between the two VMs.
- **Shared revivle feature coupling:** Heavy dependency on `features.shared.revivle` for comments. Acceptable as a shared module, but the `AuthenticationApi` is passed directly to `RevivleCommentsViewModel`.
- **No sealed interface for UiState:** Feed and detail use plain `data class` states rather than `sealed interface` with Loading/Success/Error variants.
- `OutfitFeedViewModel` and `OutfitDetailViewModel` correctly use core `ViewModel<T>`.

## Tests

`commonTest` data-layer suite added in #420 and #411:

| File | What it tests |
|------|---------------|
| `fakes/FakeOutfitRepository.kt` | In-memory stub implementing `OutfitRepository`. |
| `data/datasource/OutfitRemoteDataSourceTest.kt` | Remote data source mapping and error handling. |
| `data/repository/OutfitRepositoryImplTest.kt` | Repository delegation and caching logic. |
| `domain/usecase/CreateOutfitUseCaseTest.kt` | Create flow including validation. |
| `domain/usecase/DeleteOutfitUseCaseTest.kt` | Delete + cache invalidation. |
| `domain/usecase/GetFollowingOutfitsUseCaseTest.kt` | Feed pagination for followed users. |
| `domain/usecase/GetOutfitDetailUseCaseTest.kt` | Single outfit fetch with error paths. |
| `domain/usecase/GetPublicOutfitsUseCaseTest.kt` | Public feed pagination. |
| `domain/usecase/GetUserOutfitsUseCaseTest.kt` | Per-user outfit listing. |
| `domain/usecase/UpdateOutfitUseCaseTest.kt` | Update flow and optimistic state. |
| `ui/CreateOutfitViewModelTest.kt` | Create ViewModel state machine. |
| `ui/OutfitDetailViewModelTest.kt` | Detail ViewModel state: loading, success, comments. |
| `ui/OutfitFeedViewModelTest.kt` | Feed ViewModel pagination and tab switching. |

## See Also
- [mycloset](mycloset.md) -- similar tab-based feeds, pagination patterns
- [marketplace](marketplace.md) -- similar grid display with CursorPaginationGrid
- [notifications](notifications.md) -- pagination pattern reference

_Last updated: 2026-06-24 — `OutfitDetailScreen`: `Scaffold` + `TopAppBar` replaced with `AppScaffold(title="", isOffline=false, onNavigateBack)`. `Icons.Default.ArrowBack` import removed (navigation icon now owned by `AppScaffold`)._
