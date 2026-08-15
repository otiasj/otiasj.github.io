---
type: feature
title: Item Detail
description: Displays, edits, and creates clothing items with paged swipe-through,
  image management, and comments -- the primary item inspection screen for the Revivle
  marketplace.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/itemdetail/]
tags: [demo3, feature, itemdetail]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Item Detail

## Purpose
Displays, edits, and creates clothing items with paged swipe-through, image management, and comments -- the primary item inspection screen for the Revivle marketplace.

Location: `features/itemdetail/`

## Responsibility

Owns the full item detail lifecycle: viewing item details (marketplace or closet), editing owned items, creating new items with image upload, horizontal-pager swipe navigation between items, image selection/curation (cover, card visibility), and inline comments. Does NOT own the item list views (those belong to `marketplace` and `mycloset` features) or the comment UI components (shared via `features.shared.revivle`).

## Route & Entry Point

```kotlin
@Serializable
data class ItemDetailRoute(val itemId: Long, val source: String = "user")

@Serializable
object CreateItemRoute

fun NavGraphBuilder.myItemScreenRoute(onNavigateBack, navigateToUserCloset, onMakeOffer, onReserve, contentPadding)
fun NavGraphBuilder.createItemScreenRoute(onNavigateBack, contentPadding)
```

Navigation helpers: `NavController.navigateToMyItemScreen(item, source)` and `NavController.navigateToCreateItemScreen()`.

## Key Types

| Type | Description |
|------|-------------|
| `ItemDetailUiState` (sealed interface) | **Exemplary pattern**: `Loading`, `ViewMode`, `EditMode`, `Error` -- the preferred sealed-interface UiState approach |
| `ItemDetailViewModel` | Extends core `ViewModel<ItemDetailUiState>`; manages paging, edit/create mode, image curation, undo stack |
| `ItemDetailUseCase` | Dispatches to repository based on `ItemSource` (Marketplace vs User); also handles create and update |
| `ItemDetailRepository` / `ItemDetailRepositoryImpl` | Interface + implementation over `ClosetApi`, `MarketplaceApi`, `UsersApi` |
| `PagedItemSource` (interface) | Abstraction for paged item lists; implemented by `MarketplacePagedItemSource`, `ClosetPagedItemSource`, and an inner `StaticPagedItemSource` |
| `ItemDetailComponent` | DI component wiring APIs, repositories, use cases, and ViewModels |
| `MyItemMapper` | Extension `MyItem.toItemDetail()` for converting list items to detail models |

## Architecture

### Layers
- **data**: `ItemDetailRepositoryImpl`, `PagedItemSourceImpl` (marketplace + closet adapters)
- **domain**: `ItemDetailRepository` (interface), `ItemDetailUseCase`, `PagedItemSource` (interface), `MyItemMapper`
- **ui**: `ItemDetailViewModel`, `ItemDetailScreen`, `ImageCarousel`, `ImageSelectionDialog`, `OwnerItemDetail`, `UserItemDetail`

### DI
`ItemDetailComponent` registered via `DiProvider`. Creates authenticated HTTP clients, API instances, repository, use case, and ViewModel. Pulls in `MarketplaceComponent`, `MyClosetComponent`, and `ProfileComponent` for paged sources and profile resolution.

### Notable Patterns
- **Sealed interface UiState** with distinct `ViewMode` and `EditMode` variants -- this is the project's preferred pattern and should be used as a reference.
- **Per-page state cache**: `itemStates: MutableMap<Int, MutableStateFlow<ItemDetailUiState>>` allows each pager page to have independent state.
- **Undo stack**: `ArrayDeque<UndoAction>` for image curation swipe actions.
- **Progressive loading**: Shows summary data immediately from the paged source, then fetches full details and owner avatar asynchronously.

## Data Flow

1. Navigation passes `itemId` + `source` (user/marketplace).
2. `initialize()` subscribes to the `PagedItemSource.items` flow to find the item's index.
3. `HorizontalPager` renders pages; `getItemState(index)` lazily loads each item.
4. Summary is shown first via `MyItem.toItemDetail()`, then full details via `ItemDetailUseCase`.
5. Owner detection triggers `ViewMode(isOwner=true)` enabling the edit button.
6. Edit mode: `setEditMode(true)` transitions to `EditMode`; `saveItem()` validates and calls `updateItem` or `createItem`.
7. Image curation: swipe actions update `forItemCard`/cover via `onImageSwiped()`, persisted immediately.

## Dependencies

- **Core**: `ViewModel<T>`, `DiProvider`, `AnalyticsManager`, `Configuration`, `LoggingHttpClient`, `AuthTokenProvider`
- **Core models**: `ItemDetail`, `ItemUpdate`, `ItemImage`, `ItemPage`, `ItemOwnerInfo`
- **Shared**: `RevivleCommentRepository`, `RevivleCommentsViewModel` (from `features.shared.revivle`)
- **Cross-feature**: `MarketplaceComponent` (paged source), `MyClosetComponent` (paged source), `ProfileComponent` (profile repo)
- **Platform**: `ImagePickerManager` (from `platform.imagepicker`)
- **External APIs**: `ClosetApi`, `MarketplaceApi`, `UsersApi`, `CommentsApi`, `AuthenticationApi` (from `com.revivle.api.client`)

## Known Issues / Drift

- **Cross-feature imports**: Depends on `MarketplaceComponent`, `MyClosetComponent`, and `ProfileComponent` for paged sources and user profile. Consider extracting shared interfaces.
- **ViewModel is very large** (~620 lines): Image curation, paging, edit mode, create mode, and undo stack are all in one class. Could benefit from delegation or splitting.
- **`UserItemDetail` is noted as unused** in a TODO comment in the source.
- **`ItemDetailMobileLayout`** (`ui/components/ItemDetailMobileLayout.kt`) delegates its scrollable content to an extracted `ItemDetailMobileList` private composable (PR #857) to resolve oversized-composable lint.
- **No DataSource layer**: `ItemDetailRepositoryImpl` calls API clients directly without an intermediate `RemoteDataSource`. This violates the preferred `DataSource -> Repository -> UseCase` layering.
- **`LinearViewModel` base class mismatch**: `LinearViewModel` extends `androidx.lifecycle.ViewModel` directly, but this feature correctly uses `core.ui.ViewModel<T>`.

## Tests

`commonTest` coverage added in #375:

| File | What it tests |
|------|---------------|
| `FakeItemDetailRepository.kt` | In-memory stub implementing `ItemDetailRepository`. |
| `ItemDetailUseCaseTest.kt` | Use case logic (load, save, delete flows). |
| `ItemDetailViewModelTest.kt` | ViewModel state transitions, edit/create mode switches. |

## See Also

- [marketplace](marketplace.md) -- provides `MarketplacePagedItemSource`
- [mycloset](mycloset.md) -- provides `ClosetPagedItemSource`
- [Architecture Overview](../../../architecture.md)

_Last updated: 2026-06-15 — `ItemDetailMobileLayout` refactored: `ItemDetailMobileList` extracted as a sub-composable._
