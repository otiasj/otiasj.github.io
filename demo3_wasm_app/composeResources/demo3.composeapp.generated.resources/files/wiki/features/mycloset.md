---
type: feature
title: My Closet
description: Manages the authenticated user's personal closet -- item browsing, filtering,
  page tabs (Main, For Sale, Pending, Gone), bulk actions with undo, follow, and
  viewing another user's public closet.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/mycloset/]
tags: [demo3, feature, mycloset]
timestamp: '2026-08-01T00:00:00Z'
last_commit: 0353fbfc730bb103dc859b8af855a6a3aea018f9
category: feature
---

# My Closet

## Purpose
The authenticated user's personal clothing closet. Presents items across four page tabs (Main / For Sale / Pending / Gone), a filter/sort/search bar, cursor-paginated grid, per-item and bulk actions with 5-second undo, a user banner with follow/sign-out, and doubles as the read-only viewer for another user's public closet via the `PublicCloset` route.

Location: `features/mycloset/`

## Responsibility
**Owns:** page-tab navigation across closet views, filter/sort/search state (with debounced search), cursor-based pagination, per-item and bulk item actions (archive / list / unlist / keep) with undo, `ClosetItemUiModel` mapping (per-page action lists + price display), lifecycle-aware auto-refresh on `ON_RESUME`, closet-stats banner, follow/unfollow, and sign-out flow.

**Does NOT own:** the item detail screen, item creation, the pending-swipe screen, the marketplace, comments (delegated to `features/shared/revivle`), or profile editing. Bulk-action item mutations delegate to shared `ArchiveItemUseCase` / `KeepItemUseCase` / `ListItemUseCase` in `features.shared.revivle.itemactions`.

## Route & Entry Point
```kotlin
@Serializable object MyCloset                                    // own closet
@Serializable data class PublicCloset(val userId: String)        // another user

fun NavController.navigateToMyClosetScreen(userId: String? = null)

fun NavGraphBuilder.myClosetScreenRoute(
    onSelectionModeChange: (Boolean) -> Unit,
    navigateToItemDetail: (ClosetItemUiModel) -> Unit = {},
    navigateToPendingSwipe: () -> Unit = {},
    navigateToSplash: () -> Unit = {},
    navigateToCreateItem: () -> Unit = {},
    contentPadding: PaddingValues = PaddingValues(),
)
```

Registered by `RevivlePlugin.registerComponents` via `DiProvider.registerComponent(MyClosetComponent())`; both routes are wired in `RevivlePlugin.homeRoutes` and resolve their ViewModel through `DiProvider.getComponent(MyClosetComponent::class).myClosetViewModel`.

## Key Types
| Type | Description |
|------|-------------|
| `MyClosetComponent` | Feature-scoped DI container; owns `LoggingHttpClient`, `ClosetApi`, `UsersApi`, `MyItemRepositoryImpl`, `ClosetOptionsRepositoryImpl`, its use cases, and the `MyClosetViewModel`. Reaches into `ProfileComponent` and `AnalyticsModule` via `DiProvider`. |
| `MyClosetViewModel` | Extends core `ViewModel<MyClosetScreenUiState>`; drives tabs, filters, pagination, per-item and bulk actions, undo, follow, sign-out. |
| `MyClosetScreenUiState` | Composite root state: `closet: MyClosetUiState`, `filters: MyClosetFilterUiState`, `search: SearchUiState`, `selectedPageAction: List<ItemAction>`, plus `isOffline`, `showSignOutDialog`, `isSigningOut`, `isUserSignedOut`. |
| `MyClosetUiState` | Closet content state: banner fields (`userId`, `userName`, `userAvatar`, counts, `totalClosetValue`, `isFollowing`), `items`, cursor pagination flags, `selectedPage: ClosetPage`, `error`, `lastBulkAction`. |
| `MyClosetFilterUiState` | Current `ItemFilters`, `hasActiveFilters`, `isSearching`, and the available filter option lists (`availableYears/Brands/Categories/Sizes/Colors/AgeGenders`, `priceRange`). |
| `BulkActionType` / `LastBulkAction` | Enum + record captured after a bulk mutation to power the 5-second undo bar. |
| `ClosetPage` | Enum wrapping `ItemPage` with a display name — `MAIN` ("All"), `FOR_SALE` ("Listed"), `GONE` ("Archive"), `PENDING` ("Pending"). |
| `ItemFilters` | Query DTO: `pageName`, `search`, `brand`, `category`, `size`, `color`, `ageGender`, `year`, `minPrice`, `maxPrice`, `sortBy`, `sortOrder`, plus `userId` for public-closet queries. |
| `ClosetItemUiModel` / `ClosetItemUiModelMapper` | UI wrapper over `MyItem` adding a per-page action list and price display; mapper has one `transformXxxPageItem` per `ClosetPage`. |
| `MyItemRepository` (core) / `MyItemRepositoryImpl` | Repository backed by `ClosetApi`; routes to `closetPublicUsersUserIdPagesPageNameItemsGet` when `filters.userId != null`, otherwise `closetItemsGet`. Also implements `getFilterOptions` and `updateItemPages`. |
| `ClosetOptionsRepository` / `ClosetOptionsRepositoryImpl` | Feature-local repository returning display lists for color / age-gender / category options, backed by `closetFilterOptionsGet(PageName.Main)`. |
| `ClosetCache` | Simple in-memory `Cache<String, PaginatedResult<MyItem>>` keyed by page + filters + cursor. Provides `clearPage(ItemPage)`. |
| `GetMyClosetItemsUseCase` / `GetMyClosetFilterOptionsUseCase` / `UnlistItemUseCase` | The three use cases the ViewModel actually consumes. |

## UI
**Summary.** A user's clothing closet — banner, page tabs + filter chips, cursor-paginated item grid, context-sensitive FAB, and bulk-action / undo bars.

```
┌────────────────────────────────────────┐
│  My Closet                             │  ← AppScaffold top bar
├────────────────────────────────────────┤
│  [avatar]  Jane Doe (You)              │
│            42     8      $1.5k         │  ← items / listed / value
│                          [Sign-out]    │  ← NativeClerkUserButton (own)
├────────────────────────────────────────┤
│  All │ Listed │ Archive │ Pending      │  ← SecondaryPageTabs
│  [Sort▼] [Year▼] [Brand▼] [Cat▼] …     │  ← filter chips
├────────────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐               │
│  │[img]│ │[img]│ │[img]│                │
│  │Title│ │Title│ │Title│                │
│  │ $25 │ │ $40 │ │ $15 │                │
│  └─────┘ └─────┘ └─────┘                │
│  … more rows …                         │
│                            [ + FAB ]   │  ← Add (MAIN, own) / ▶ (PENDING)
└────────────────────────────────────────┘
```

**Non-happy states.** Initial loading shows `InitialLoadingState` in the grid area (banner + tabs stay visible). Error renders full-area `ErrorState` (Retry + dismiss) unless `isLoadingMore`, in which case the error inlines at the bottom of `CursorPaginationGrid`. Empty state uses `ClosetEmptyState` with page-specific copy and a Retry button; when filters are active it switches to "No items found" + Clear Filters. Selection mode on phones replaces the tabs row with a `SelectionActionBar`; on wide/pane layouts, tabs stay and `ResponsiveSelectionBottomBar` overlays a floating action pill. After a bulk action, `TopActionBar` shows `UndoActionBar` for 5 s. Sign-out is handled inside `NativeClerkUserButton` in the banner; flipping `isUserSignedOut` triggers a `LaunchedEffect` that calls `navigateToSplash()`. Offline flag surfaces `AppScaffold`'s offline banner. On the `PublicCloset` route the banner shows Follow / Following instead of sign-out, only MAIN and FOR_SALE tabs are visible, item cards render with no action list, and the Add FAB is absent.

**Interactions.** avatar tap → Clerk sheet; follow → `toggleFollow`; page tab → `selectPage`; filter chip → `updateFilters`; card tap → `navigateToItemDetail`; card long-press/drag → `DragSelectState`; Add FAB → `navigateToCreateItem`; ▶ FAB → `logPendingFabTap` + `navigateToPendingSwipe`; Retry → `retry`; Clear Filters → `clearAllFilters`; grid scroll end → `loadMore`; bulk action → per-page action + `disableSelectionMode`; Undo → `undoLastBulkAction` / dismiss → `clearLastBulkAction`; screen resume (except first) → `refresh`.

## Architecture
```
mycloset/
├── MyClosetComponent.kt
├── data/
│   ├── datasource/ClosetOptionsDataSource.kt   (dead: only its test still references it)
│   ├── local/ClosetCache.kt
│   ├── remote/MyItemRepositoryImpl.kt          (implements core MyItemRepository)
│   └── repository/ClosetOptionsRepositoryImpl.kt
├── docs/                                       (source of truth for the porting engine)
├── domain/
│   ├── model/                                  (MyItem, ItemFilters, ClosetPage, ClosetStats,
│   │                                            EbayComp, ClosetItemUpdate, SavedClosetFilter, …)
│   ├── repository/ClosetOptionsRepository.kt
│   ├── repository/ClosetRepository.kt          (dead: no impl, no caller)
│   └── usecase/                                (~20 use cases; only 3 are wired)
└── ui/
    ├── MyClosetScreen.kt   (nav routes + MyClosetScreen + private MyClosetContent)
    ├── MyClosetViewModel.kt
    ├── MyClosetUiState.kt
    ├── ClosetItemUiModelMapper.kt
    ├── components/         (ClosetBanner, ClosetPageTabs, TopActionBar, FilterComponents,
    │                        SortFilterChip, ClosetItemCard/Content/ImageSection, ClosetEmptyState)
    └── model/ClosetItemUiModel.kt
```

**DI.** `MyClosetComponent` creates its own `LoggingHttpClient` + `AuthTokenProvider` (via `createAuthTokenProvider`), instantiates `ClosetApi` and `UsersApi` against `Configuration.myClosetApiBaseUrl`, wires the two repositories and their use cases, then pulls `ProfileComponent.profileRepository`, `ProfileComponent.revivleProfileRepository`, and `AnalyticsModule.analyticsManager` from `DiProvider` when constructing the ViewModel.

## Data Flow
1. `NavGraphBuilder.myClosetScreenRoute` resolves the shared `MyClosetViewModel` from `DiProvider`, calls `viewModel.init(userId)` (null for `MyCloset`, non-null for `PublicCloset`), and renders `MyClosetScreen`.
2. `init` sets banner state, kicks off `loadUserProfile(userId)` (public only) or `loadCurrentUserProfile` (own), `loadClosetCounts(userId)`, and `loadInitialData`.
3. `loadInitialData` launches `loadFilterOptions()` in parallel and calls `getMyClosetItemsUseCase.getClosetItemsByPage(pageName, filters, cursor=null, limit=20)`.
4. User taps a page tab → `selectPage(ClosetPage)` saves scroll position, updates `filters.pageName`, rebuilds the `selectedPageAction` list, then `refreshWithNewFilters` + a fresh `loadFilterOptions`.
5. User edits a filter → `updateFilters(newFilters)`; if only the search text changed, debounce 500 ms then refresh, else refresh immediately.
6. Grid reaches its end → `loadMore()` guards on `isLoadingMore` / `hasMore` / `nextCursor`, then appends via `getMyClosetItemsUseCase.loadMore`.
7. Per-item action (archive / keep / list / unlist) → shared use case, then clear source + destination page caches (`clearPageCache`) and full `clearCache`, then either patch the item in place (MAIN) or remove it (other pages).
8. Bulk action → captures `LastBulkAction` (items + `sourcePage`), fans out per-item calls, exits selection mode. Undo replays the inverse action per item (`ARCHIVE` → `keepItem` or `listItem` depending on `sourcePage`, `LIST`↔`UNLIST`, `KEEP` → `archiveItem`), then `refresh`. Auto-clears after 5 s.
9. `LifecycleEventEffect(ON_RESUME)` on the screen skips the first resume, then calls `refresh()` on every subsequent resume (e.g. back from item detail).
10. Sign-out → `confirmSignOut` calls `profileRepository.signOut()`; on success flips `isUserSignedOut`, and the screen's `LaunchedEffect` calls `navigateToSplash`.

## Dependencies
- **Own:** `MyItemRepositoryImpl`, `ClosetOptionsRepositoryImpl`, `ClosetCache`, `MyClosetViewModel`, `ClosetItemUiModelMapper`.
- **Core:** `ViewModel<T>`, `DiProvider`, `AnalyticsModule`, `LoggingHttpClient`, `AuthTokenProvider`, `Configuration`, `safeCall`, `PaginatedResult`, `Cursor`, `Cache`, `ItemPage`, `Error` / `getErrorFromException`, `TimeUtils`, `AppScaffold`, `CursorPaginationGrid`, `EmptyState` / `ErrorState` / `InitialLoadingState`, `GradientFloatingActionButton`, `SelectionActionBar` / `UndoActionBar` / `ResponsiveSelectionBottomBar`, `FilterOptionUiModel`, `ItemAction`.
- **Cross-feature:** `ProfileComponent.profileRepository` (sign-out) and `ProfileComponent.revivleProfileRepository` (current-user handle/avatar) via `DiProvider`; shared item-action use cases from `features.shared.revivle.itemactions` (`ArchiveItemUseCase`, `KeepItemUseCase`, `ListItemUseCase`).
- **Generated API:** `com.revivle.api.client.apis.ClosetApi`, `UsersApi`, and `PageName` — the ViewModel calls `usersApi.usersUserIdProfileGet` / `getFollowStatus` / `followUser` / `unfollowUser` and `closetApi.closetStatsGet` directly.
- **Compose Resources:** `revivle_my_closet`, `item_detail_create_item_fab`, `closet_loading_page`, `closet_retry_button`, `closet_you_suffix`, `closet_empty_title_*` / `closet_empty_desc_*` / `closet_empty_adjust_filters` / `closet_empty_no_items_found`, `closet_clear_filters_button`, `closet_undo_{archived,kept,listed,unlisted}` (in `strings_closet.xml`).
- **Third-party:** `com.dragselectcompose.core` (grid drag-select), `androidx.lifecycle.compose.LifecycleEventEffect`, `androidx.navigation.compose` with `@Serializable` routes.

## Known Issues / Drift
- **Screen is not stateless.** `MyClosetScreen(viewModel, …)` takes the ViewModel directly; no stateless `Content(state, onEvent)` is extracted, and no `@Preview` exists for the screen itself. Convention wants a preview per `UiState` variant.
- **Raw APIs in the ViewModel.** `MyClosetViewModel` takes `UsersApi` and `ClosetApi` directly (for `usersUserIdProfileGet`, `getFollowStatus`, `followUser` / `unfollowUser`, `closetStatsGet`). These call sites should live behind a repository (e.g. `UserRepository` / `ClosetStatsRepository`).
- **No dedicated `RemoteDataSource`.** `MyItemRepositoryImpl` calls `ClosetApi` directly, whereas outfits/marketplace route through a `*RemoteDataSource` intermediary.
- **Dead code — `data/datasource/ClosetOptionsDataSource.kt`.** No production caller (`ClosetOptionsRepositoryImpl` now uses the live `ClosetApi`), but the source and its `ClosetOptionsDataSourceTest` still ship. Delete both.
- **Dead code — `domain/repository/ClosetRepository.kt`.** No implementation, no caller.
- **Dead use cases.** ~17 of the ~20 files in `domain/usecase/` are unused (e.g. `BulkUpdateClosetItemsUseCase`, `RateClosetItemUseCase`, `CreateSavedFilterUseCase`, `GetClosetStatsUseCase`, `GetPendingItemsCountUseCase`, `RefreshClosetDataUseCase`, `SearchClosetItemsUseCase`, saved-filter CRUD, `Archive/Restore/BulkDeleteClosetItemsUseCase`, `GetItemCompsUseCase`, `GetClosetItemUseCase`, `DeleteClosetItemUseCase`, `GetClosetItemsUseCase`, `UpdateClosetItemUseCase`, `ToggleSavedItemUseCase`). Only `GetMyClosetItemsUseCase`, `GetMyClosetFilterOptionsUseCase`, and `UnlistItemUseCase` are wired into `MyClosetComponent`. Several still carry passing tests, giving a misleading coverage picture.
- **Hardcoded bulk-action labels.** `MyClosetViewModel.updateSelectedPageItemAction()` builds `ItemAction("Archive", …)` / `"List"` / `"Unlist"` / `"Keep"` with raw strings; `ClosetItemUiModelMapper` does the same; the FAB `contentDescription` `"Review Pending Items"` is also inlined. Should use `stringResource(Res.string.*)`.
- **Debug `println` noise.** `MyClosetViewModel` prints on `loadInitialData`, `refreshWithNewFilters`, `loadMore`, `handleDataResult`, `handleLoadMoreResult`, and each per-item action; these bypass `Log.d` and fire in production builds.
- **`ClosetCache` is unwired.** It is instantiated but `MyItemRepositoryImpl` hits `ClosetApi` on every call; only the ViewModel-side `clearPageCache` / `clearCache` hooks reference it, so cache invalidation runs against an always-empty cache.

## Tests
| File | What it tests |
|------|---------------|
| `MyClosetComponentTest.kt` | Smoke test — `MyClosetComponent()` instantiates without throwing (lazies unresolved). |
| `FakeMyItemRepository.kt` | Configurable in-memory `MyItemRepository` fake used across use-case and ViewModel tests. |
| `ui/MockApis.kt` | Fake `ClosetApi` / `UsersApi` (with Ktor `MockEngine` scaffolding) so `MyClosetViewModel` can be built without HTTP. |
| `ui/MyClosetViewModelTest.kt` | State transitions: initial load, tab switching, filter changes, per-item actions (archive / keep / list / unlist), follow toggle. Uses `FakeProfileRepository` + `FakeRevivleProfileRepository`. |
| `ui/ClosetItemUiModelMapperTest.kt` | Per-page action list + price-tag/priceDisplayText assertions for `transformMainPageItem` (listed vs unlisted), `transformForSalePageItem`, `transformPendingPageItem`, `transformGonePageItem`. |
| `data/local/ClosetCacheTest.kt` | `ClosetCache.generateCacheKey`, `put`/`get` round-trip, `clearPage` behavior. |
| `data/remote/MyItemRepositoryImplTest.kt` | `MyItemRepositoryImpl` translates filters into `ClosetApi` calls (own vs public routes) via a `FakeClosetApi` backed by Ktor `MockEngine`, and `updateItemPages` PATCHes `ClosetItemUpdate`. |
| `data/repository/ClosetOptionsRepositoryImplTest.kt` | Verifies `getColorOptions` / `getAgeGenderOptions` / `getCategoryOptions` hit `closetFilterOptionsGet(PageName.Main)` and map facet values. |
| `data/datasource/ClosetOptionsDataSourceTest.kt` | Legacy — asserts the static `ClosetOptionsDataSource` still returns 13 colors / 6 age-genders / 13 categories. Source under test is dead in production; delete alongside the datasource. |
| `domain/model/MyItemMapperTest.kt` | `ClosetItem` DTO → `MyItem` mapping (id, pages, owner, price, discounts, sizes). |
| `domain/repository/FakeClosetOptionsRepository.kt` | In-memory `ClosetOptionsRepository` fake. |
| `domain/usecase/GetMyClosetItemsUseCaseTest.kt` | `getClosetItems*` and `loadMore` cursor handling on top of the fake repo. |
| `domain/usecase/GetMyClosetFilterOptionsUseCaseTest.kt` | Success / failure passthrough of the filter-options call. |
| `domain/usecase/RefreshClosetDataUseCaseTest.kt` | `RefreshClosetDataUseCase` — dead use case; test still runs. |
| `domain/usecase/SearchClosetItemsUseCaseTest.kt` | `SearchClosetItemsUseCase` — dead use case; test still runs. |
| `domain/usecase/UnlistItemUseCaseTest.kt` | `UnlistItemUseCase.execute` PATCHes the item back to `Main` only. |
| `desktopTest/…/MyClosetVisualDiffTest.kt` | Desktop visual-diff harness for `MyClosetScreen` (compares rendered output against a reference image). |

## See Also
- [marketplace](marketplace.md) — sibling feed built on the same `MyItem` model and filter DSL.
- [outfits](outfits.md) — tab-based social feed with a similar pager/pagination shape.
- [pending](pending.md) — the swipe-review screen the PENDING FAB navigates to.
- [item-detail](item-detail.md) — the destination of item card taps.
- [profile](profile.md) — provides `profileRepository` (sign-out) and `revivleProfileRepository` (current-user avatar/handle).
- [app-shell](../app-shell.md) — `RevivlePlugin` registers the component and wires the two routes.

_Last updated: 2026-08-01 — refreshed for source drift: ViewModel now owns follow/sign-out and closet-stats-banner state, `PublicCloset` route documented, `ClosetOptionsRepositoryImpl` is backed by `ClosetApi.closetFilterOptionsGet(PageName.Main)`, tests table synced with `commonTest/` + `desktopTest/`, drift section updated with new findings (raw APIs in ViewModel, dead datasource + dead use cases, unwired `ClosetCache`, hardcoded bulk-action labels, debug `println`s)._
