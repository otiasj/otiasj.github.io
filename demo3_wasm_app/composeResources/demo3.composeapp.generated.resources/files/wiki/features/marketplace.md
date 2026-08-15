---
type: feature
title: Marketplace
description: Browsable, filterable grid of items listed for sale by other users on
  the Revivle platform.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/marketplace/]
tags: [demo3, feature, marketplace]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Marketplace

## Purpose
Browsable, filterable grid of items listed for sale by other users on the Revivle platform.

Location: `features/marketplace/`

## Responsibility
**Owns:** Fetching, displaying, filtering, searching, sorting, and paginating marketplace items. Filter option metadata (brands, categories, sizes, colors, age-genders, years, price range).

**Does NOT own:** Item detail views (handled by shared item-detail feature), purchase/offer flows, user authentication, or the `MyItem` domain model (reuses model from `mycloset`).

## Route & Entry Point
```kotlin
@Serializable
object Marketplace

fun NavGraphBuilder.marketplaceScreenRoute(
    navigateToItemDetail: (MyItem) -> Unit = {},
    contentPadding: PaddingValues = PaddingValues()
)
```
The ViewModel is obtained via `DiProvider.getComponent(MarketplaceComponent::class).viewModel`.

## Key Types
| Type | Description |
|------|-------------|
| `MarketplaceComponent` | DI component wiring API, repository, use cases, and ViewModel |
| `MarketplaceViewModel` | Extends core `ViewModel<MarketplaceScreenUiState>` -- manages filtering, pagination, search debouncing |
| `MarketplaceScreenUiState` | Composite state: list state, filter state, search state, offline flag |
| `MarketplaceFilters` | Data class for all filter parameters (search, brand, category, size, color, etc.) |
| `MarketplaceRepositoryImpl` | Maps `MarketplaceApi` responses to `PaginatedResult<MyItem>` |
| `GetMarketplaceItemsUseCase` | Executes paginated item fetches; exposes a debounced `Flow`-based search variant |
| `GetMarketplaceFilterOptionsUseCase` | Fetches available filter option counts |

## Architecture
**Layers:** `data/remote` (repository), `domain/model` + `domain/usecase`, `ui` (screen, ViewModel, components).

**DI:** `MarketplaceComponent` follows the `DiProvider` pattern. Lazy-initializes `AuthTokenProvider`, `LoggingHttpClient`, generated `MarketplaceApi`, repository, use cases, and ViewModel. Injects `AnalyticsManager` from core `AnalyticsModule`.

**Notable patterns:**
- `ViewModel<T>` (core base class) with `updateState { }` for immutable state updates.
- Composite UI state (`MarketplaceScreenUiState`) subdivided into `MarketplaceListUiState`, `MarketplaceFilterUiState`, `SearchUiState`.
- Search debouncing (500 ms) in the ViewModel layer; also a `Flow`-based debounce in the use case.
- Cursor-based pagination via `Cursor.Page`.

## Data Flow
1. `loadInitialData()` fires on init -- fetches first page + filter options concurrently.
2. User filter changes call `updateFilters()` which either debounce-searches (text only) or `refreshWithNewFilters()`.
3. Scroll-to-end triggers `loadMore()` guarded by `isLoadingMore`/`hasMore`/active-job checks.
4. Pull-to-refresh triggers `refresh()`, resets cursor to page 1.
5. Repository delegates to generated `MarketplaceApi`, maps response to `PaginatedResult<MyItem>`.

## Dependencies
- **Core:** `ViewModel<T>`, `DiProvider`, `LoggingHttpClient`, `AuthTokenProvider`, `Configuration`, `AnalyticsManager`, `PaginatedResult`, `Cursor`, `Error`, `safeCall`.
- **Generated API:** `com.revivle.api.client.apis.MarketplaceApi`.
- **Cross-feature:** Reuses `mycloset` domain model `MyItem` (import, not a component dependency).
- **UI library:** `CursorPaginationGrid`, `SharedFilterComponents`, `EmptyState`, `ErrorState`, `InitialLoadingState`, drag-select library.

## Known Issues / Drift
- **Cross-feature model import:** `MarketplaceViewModel`, `MarketplaceRepositoryImpl`, and UI state all import `com.otiasj.features.mycloset.domain.model.MyItem`. The `MyItem` model should ideally live in a shared/core module.
- **No DataSource layer:** `MarketplaceRepositoryImpl` calls `MarketplaceApi` directly instead of going through a `RemoteDataSource`. Convention requires a DataSource between repository and API.
- Otherwise this feature is a **good clean-architecture example**: uses core `ViewModel<T>`, `DiProvider` pattern, data class state, proper separation of use cases, repository interface in core.

## Notes on Filter Dialogs

`MarketplaceFilterDialogs.kt` was removed in #493 and its functionality consolidated into `core/ui/components/FilterDialogs.kt`. The marketplace now uses the generic `GenericFilterDialog` and `GenericMultiSelectFilterDialog` from core (which were updated in the same PR to use string resources rather than hardcoded "All" / "Search" labels).

## Tests

`commonTest` suite added in #422:

| File | What it tests |
|------|---------------|
| `data/FakeMarketplaceRepository.kt` | In-memory stub implementing `MarketplaceRepository`. |
| `domain/usecase/GetMarketplaceFilterOptionsUseCaseTest.kt` | Filter option aggregation logic. |
| `domain/usecase/GetMarketplaceItemsUseCaseTest.kt` | Item fetching, pagination, and filter application. |
| `ui/MarketplaceViewModelTest.kt` | ViewModel state transitions for load, filter, and error paths. |

## See Also
- [mycloset](mycloset.md) -- shares `MyItem` model, similar filtering/pagination patterns
- [Core Architecture](../core.md)

_Last updated: 2026-05-14_
