---
type: feature
title: Gallery
description: Paginated image grid that demonstrates page-based infinite scrolling
  against the Pixabay public API.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/gallery/]
tags: [demo3, feature, gallery]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Gallery

## Purpose
Paginated image grid that demonstrates page-based infinite scrolling against the Pixabay public API.

Location: `features/gallery/`

## Responsibility

Fetches photos from the Pixabay API page-by-page and presents them in a scrollable card grid. The
feature serves as a lightweight reference implementation of the shared `PagingPageViewModel` /
`PagingRepository` infrastructure.

## Route & Entry Point

Registered via `NavGraphBuilder.galleryScreenRoute()` in `GalleryScreen.kt`. The route object is
the serializable singleton `Gallery`. Navigation example:

```kotlin
navController.navigate(Gallery)
```

The composable entry point resolves `AnalyticsManager` from `DiProvider`, constructs a
`GalleryScreenViewModel`, and delegates rendering to `ViewGalleryScreen`.

## Key Types

| Class | Role |
|---|---|
| `GalleryPhoto` | Immutable domain model (id, url, width, height, description/author) |
| `GalleryRepository` | `PagingRepository<GalleryPhoto>` — calls `PixabayAPI`, emits `Page<GalleryPhoto>` |
| `GalleryScreenViewModel` | Extends `PagingPageViewModel<GalleryPhoto>`; owns paging state |
| `GalleryScreen.kt` | Composable UI; `GalleryPhotoItem` renders each card with aspect-ratio-correct image |

## Architecture

Thin two-layer structure with no separate domain layer:

```
GalleryScreen (Compose)
    └── GalleryScreenViewModel : PagingPageViewModel<GalleryPhoto>
            └── GalleryRepository : PagingRepository<GalleryPhoto>
                    └── PixabayAPI (core remote datasource)
```

`GalleryScreenViewModel` accepts a `PagingRepository<GalleryPhoto>` interface in its constructor,
making it straightforward to inject a test double.

## Data Flow

1. `PagingList` composable triggers `viewModel.loadNextPage(page)` on scroll.
2. `GalleryScreenViewModel` delegates to `GalleryRepository.getPage(page: Int)`.
3. `GalleryRepository` calls `PixabayAPI.getImages(page, perPage=20)` on `Dispatchers.Default`.
4. Raw `PixabayPhoto` list is mapped to `GalleryPhoto` via `PixabayPhoto.mapToGalleryPhoto()`.
5. A `Page<GalleryPhoto>` (data, hasMore, total, cursor=null) is emitted back to the ViewModel.
6. `PagingPageViewModel` appends items to its accumulated list and updates `hasMore`.
7. `ViewGalleryScreen` / `PagingList` recomposes, rendering new `GalleryPhotoItem` cards.

On error, `GalleryRepository` catches the exception and emits an empty `Page` with
`hasMore = false`, silently stopping pagination.

## Dependencies

- `core/ui/paging` — `PagingPageViewModel`, `PagingRepository`, `Page`, `PagingList`
- `core/data/datasource/remote/pixabay` — `PixabayAPI`, `PixabayPhoto`
- `core/ui/components` — `Image` (multiplatform image loader wrapper)
- `core/di` — `DiProvider`, `AnalyticsModule`
- `app/theme` — `LocalDimens`

## Known Issues / Drift

- `BootstrapUserUseCase` is declared in the `gmailconnect` domain package but is not wired into
  this feature (no-op concern for `gallery`).
- The Pixabay API key must be present in `Configuration`; missing key causes a silent empty page
  rather than a visible error state.
- `cursor` is always `null`; if the backend ever switches to cursor-based pagination this
  repository would need a rewrite.

## See Also

- `features/graphqlexample/` — sibling cursor-paging demo using `PagingCursorViewModel`
- `core/ui/paging/PagingPageViewModel.kt` — base class
- `core/data/datasource/remote/pixabay/PixabayAPI.kt` — remote datasource

_Last updated: 2026-05-04_
