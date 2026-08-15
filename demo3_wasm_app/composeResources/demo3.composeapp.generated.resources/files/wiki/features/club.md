---
type: feature
title: Club
description: Community clubs feature for Revivle — lets users discover, join, create,
  and explore clubs with shared outfit and marketplace feeds.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/club/]
tags: [demo3, feature, club]
timestamp: '2026-08-01T00:00:00Z'
last_commit: f56e7cc8a
category: feature
---

# Club

## Purpose

Community clubs feature for Revivle — lets users discover, join, create, and explore clubs with shared outfit and marketplace feeds. Ported from the Revivle web app via the KMP porting engine; artefacts of that pipeline live under `features/club/docs/` (user stories, web mockups, slice briefs, porting reports).

Location: `features/club/`

## Responsibility

**Owns:** the clubs landing screen (Discover / My clubs tabs, search, create dialog), the club detail screen (banner + members / outfits / marketplace tabs, join/leave/edit/delete, invite-code gate, share dialog), the curation flow (item and outfit selection sync for manual-selection and brand clubs), and the `ClubDomainModel` aggregate plus `ClubSelection` / `ClubMember` / `ClubFundraiserStatus` / `Brand` domain types.

**Does not own:** outfit rendering (delegates to `OutfitItem` from `features/outfits`), closet item rendering (delegates to `MyItem` from `features/mycloset`), marketplace filter chip (delegates to `features/marketplace`), authentication, or image hosting.

## Route & Entry Point

```kotlin
@Serializable object ClubRoute
@Serializable data class ClubDetailRoute(val clubId: String, val inviteCode: String? = null)

fun NavController.navigateToClub()
fun NavController.navigateToClubDetail(clubId: String)

fun NavGraphBuilder.clubScreenRoute(navigateToClubDetail, contentPadding)
fun NavGraphBuilder.clubDetailScreenRoute(onNavigateBack, navigateToOutfitDetail, navigateToMarketplaceItemDetail, navigateToUserCloset, contentPadding)
```

`ClubComponent` is registered in `RevivlePlugin.registerComponents()` (`DiProvider.registerComponent(ClubComponent())`). Both routes are wired inside `RevivlePlugin.homeRoutes(...)` — `clubDetailScreenRoute` first, then `clubScreenRoute`. `ClubDetailRoute` accepts an optional `inviteCode` query which is consumed once by `ClubDetailViewModel.processInviteCode(...)`.

## Key Types

| Type | Description |
|------|-------------|
| `ClubRoute` / `ClubDetailRoute` | `@Serializable` navigation destinations (object + data class). |
| `ClubComponent` | Manual DI container (`class`, not a `DiProvider` module). Wires `ClubsApi` + `BrandsApi` (both via `LoggingHttpClient.createAuthenticated`), `ClubRepositoryImpl`, 22 use cases, and exposes `clubViewModel` (singleton) + `getClubDetailViewModel(clubId)` (per-navigation factory). |
| `ClubRepository` / `ClubRepositoryImpl` | Interface + impl backed by generated `ClubsApi` + `BrandsApi`; all methods return `Result<T>` via `safeCall`. |
| `ClubDomainModel` | Aggregate with `id`, `name`, `isPublic`, `memberCount`, `creator`, `members`, `membershipStatus`, plus curation/fundraiser fields (`isManualSelection`, `isFundraiser`, `organizationName`, `organizationRegistration`, `fundraiserStatus`, `feeds`, `inviteCode`, `banner`, `brandName`, `businessId`). Computed: `isLocked()`, `shouldShowInviteCode()`, `supportsManualSelections()`, `canCurate()`, `canRemoveAnySelection()`. |
| `ClubViewModel` | Extends `core.ui.ViewModel<ClubsLandingUiState>`. Handles discovery + my-clubs pagination, search on both tabs (debounced brand search 300 ms), guest detection via `AuthTokenProvider`, and the entire create-club dialog state machine. |
| `ClubDetailViewModel` | Per-club instance created by `ClubComponent.getClubDetailViewModel(clubId)`; takes 13 use cases; drives tab loading, join/leave/delete, edit, invite-code gate, curation pickers, and marketplace filters. Invokes `onClubsMutated = { clubViewModel.refresh() }` after any mutation. |
| `ClubsLandingUiState` | `sealed class` with `Loading` / `Success(...)` / `Error` / `Empty` variants; `Success` embeds `CreateClubState` and pagination flags. |
| `ClubDetailUiState` | `sealed class` with `Loading` / `Success(...)` / `Error`; `Success` embeds `EditClubState`, `PrivateClubGateState`, dialog visibility flags, and curation sync error state. |
| `ClubTab` / `ClubFeeds` | Enums driving tab visibility. `ClubFeeds.visibleTabs()` + `resolveEffectiveTab(feeds, requested)` guard against landing on a tab the club has disabled. |
| `ClubSelection` | `itemIds: List<Long>` + `outfitIds: List<Long>` — the current user's personal curation set, used to pre-check `CurationItemPickerDialog` / `CurationOutfitPickerDialog`. |
| `ClubSelectionSyncException` | Domain exception raised by the sync use cases when a delta can't be reconciled. |
| `CreateClubParams` / `UpdateClubParams` / `ImageUpload` / `ImageEdit` / `EditableImageAsset` / `Brand` / `ClubOutfit` / `ClubMember` / `ClubMembershipStatus` / `ClubFundraiserStatus` | Supporting domain types. |

## UI

### ClubScreenContent

**Summary.** The Clubs landing screen lets users discover all clubs or browse their own clubs, search within either view, and start a new club.

Layout (Success — authenticated, All tab, no search query, clubs present):

    ┌──────────────────────────────────────────┐
    │  ←  club screen title                    │
    ├──────────────────────────────────────────┤
    │  ╔══════════════════════════════════════╗ │
    │  ║   club landing title (banner)        ║ │
    │  ╚══════════════════════════════════════╝ │
    │  ┌──────────────┐ [🔍      ] [Start a]   │
    │  │ All │  Mine  │           [  Club  ]   │
    │  └──────────────┘                        │
    │  ┌────────────────┐  ┌────────────────┐  │
    │  │ □  Club Name   │  │ □  Club Name   │  │
    │  │    Desc line   │  │    Desc line   │  │
    │  │    N members   │  │    N members   │  │
    │  └────────────────┘  └────────────────┘  │
    │  ...                                     │
    └──────────────────────────────────────────┘

Each `ClubCard` is an M3 `Card`: square thumbnail placeholder, name (+ optional "BRAND" label in primary color), up to 2 description lines, and a member count. Search-All uses a **3-column** grid; the other three lists use 2 columns. For guests, the ALL/MINE switch is replaced by a plain "club landing all tab" title.

**States.** `Loading` → `FullScreenLoading`. `Error` → `ErrorState` with retry. `Empty` → top-level `EmptyState`. `Success` sub-empties (no discover / no mine / no search-all / no search-mine) each have their own strings. `Success + showCreateClubDialog` overlays `CreateClubDialog`.

**Interactions.** Tab tap → `SelectAllTab`/`SelectMineTab`; search input → `SearchQueryChange`; Start a Club → `StartClubClick` (routes through `onGuestStartClubClick()` for guests); card tap → `ClubCardClick(id)` → `navigateToClubDetail`; scroll to last item → `LoadMoreDiscover`/`LoadMoreMyClubs`; retry → `Retry`; dialog dismiss/submit → `DismissCreateDialog`/`CreateClub(event)`.

### ClubDetailScreenContent

Scaffold with back nav and (Compact width only) a gradient FAB that opens the curation picker. Body: `ClubDetailHeader` (banner, name, share/get-code buttons, join/leave button) then either a "private" message (locked view) or a `ClubDetailTabs` row over the active tab's content — `OUTFITS` (2-col grid of `ClubOutfitCard`), `MARKETPLACE` (sort/filter chip + 2-col grid of `ClubMarketplaceItemCard`), or `MEMBERS` (`LazyColumn` of `ClubMemberRow` + `ClubManagementPanel` for owners). Dialogs stacked over the scaffold: `PrivateClubGateDialog`, `ShareClubDialog`, `ClubInviteCodeDialog`, `EditClubDialog`, `DeleteClubDialog`, `CurationItemPickerDialog`, `CurationOutfitPickerDialog`.

## Architecture

```
club/
├── ClubComponent.kt
├── data/repository/ClubRepositoryImpl.kt
├── domain/
│   ├── model/           # ClubDomainModel, ClubSelection, ClubFeeds, ClubTab,
│   │                    # ClubFundraiserStatus, Brand, CreateClubParams,
│   │                    # UpdateClubParams, ImageUpload, ImageEdit,
│   │                    # EditableImageAsset, ClubOutfit,
│   │                    # ClubSelectionSyncException
│   ├── repository/ClubRepository.kt
│   └── usecase/         # 22 use cases (get/search/join/leave/delete/update/create
│                        # + curation add/remove/sync + brand search + image asset)
├── ui/
│   ├── ClubScreen.kt + ClubViewModel.kt
│   ├── ClubCard.kt / ClubSearchInput.kt / ClubsViewSwitch.kt / CreateClubDialog.kt
│   └── detail/          # ClubDetailScreen + ClubDetailViewModel + 12 sub-composables
│                        # (header, tabs, member row, outfit/item cards,
│                        # management panel, banner overlay) and 6 dialogs
│                        # (edit, delete, share, invite-code, private-gate,
│                        # curation item/outfit pickers)
└── docs/                # Porting engine artefacts (not compiled): user_stories.md,
                         # ui_brief.md, ui_brief.slices/, web_mockup*.png,
                         # PORTING_ISSUES.md, story_waivers.json, reports/
```

`ClubDetailViewModel` cross-wires with `MyClosetComponent`/`OutfitComponent` at the picker layer (curation pickers pull the viewer's own closet items and outfits). Landing → detail navigation flows through `navigateToClubDetail(clubId)` supplied by `RevivlePlugin`; on mutation, `onClubsMutated` closes the loop by calling `clubViewModel.refresh()` so the landing lists reflect the change.

## Data Flow

1. `clubScreenRoute` resolves `ClubComponent` from `DiProvider` and reads `clubViewModel` (lazy singleton).
2. `ClubViewModel.init` runs `loadData()`: parallel `getPopularClubsUseCase(page = 1)` + `getMyClubsUseCase(page = 1)`; token presence via `tokenProvider.getToken()` sets `isGuest`; on success emits `ClubsLandingUiState.Success(...)`, else `Error`.
3. Tab tap / search input mutate `Success` in place; search fires `searchClubsUseCase` (All tab) or `getMyClubsUseCase(query = ...)` (Mine tab) and reconciles only if `searchQuery` still matches.
4. Grids drive infinite scroll via `derivedStateOf { lastVisible.index == totalCount - 1 }` → `LoadMoreDiscover` / `LoadMoreMyClubs`, guarded by `hasMore*` flags.
5. `StartClubClick` opens `CreateClubDialog`; `OnSubmit` validates locally, builds `CreateClubParams` (feeds derived from checkbox text), calls `createClubUseCase`, and on success reloads the landing lists + invokes `event.onSuccess(clubId)` to navigate into the new club.
6. `clubDetailScreenRoute` builds a fresh `ClubDetailViewModel(clubId)` per navigation via `ClubComponent.getClubDetailViewModel(clubId)`; `loadDetail()` fetches the club, chooses the effective tab from `feeds`, then loads the first page of the selected tab and (for `BOTH`/`MARKETPLACE_ONLY`) the marketplace count.
7. Join / leave / delete / edit route through their use cases; on mutation `onClubsMutated` invokes `clubViewModel.refresh()` and (for delete) sets `isDeleted = true` which pops the back stack via `LaunchedEffect`.
8. Curation flow: `onOpenCurationPicker(isItem)` loads `ClubSelection` via `getMySelectionInClubUseCase`; the picker dialog returns `(currentIds, nextIds)` and `onSyncItemSelection`/`onSyncOutfitSelection` diff-applies via the sync use cases, then reloads the affected tab.
9. Invite-code deep-link: `processInviteCode(inviteCode)` waits for `Success`, then calls `onJoinClick(inviteCode)` once (guarded by `consumedInviteCode`) if the viewer is not already a member.

## Dependencies

- **Backend clients**: `com.revivle.api.client.apis.ClubsApi`, `com.revivle.api.client.apis.BrandsApi` (generated OpenAPI, ClosetApi / Revivle backend).
- **Core**: `core.data.datasource.remote.LoggingHttpClient`, `core.data.datasource.remote.auth.AuthTokenProvider` (via `app.createAuthTokenProvider`), `core.config.Configuration.myClosetApiBaseUrl`, `core.domain.model.PaginatedResult` + `Cursor` + `safeCall`, `core.ui.ViewModel<T>`, `core.di.DiProvider` + `core.di.AnalyticsModule`, `core.util.platform.Log`.
- **UI**: `core.ui.components.*` (`AppScaffold`, `CommunityFeedBanner`, `EmptyState`, `ErrorState`, `FullScreenLoading`, `InitialLoadingState`, `PrimaryButton`, `TitleMediumText`, `BodyMediumText`, `GradientFloatingActionButton`), `core.ui.resizable.LocalWindowSize`, `app.theme.LocalDimens` + `AppTheme`.
- **Cross-feature**: `features/outfits/domain/model/OutfitItem`, `features/mycloset/domain/model/MyItem` (both referenced from `ClubRepository`), `features/marketplace/domain/model/MarketplaceFilters` + `features/marketplace/ui/components/MarketplaceSortFilterChip` (in `ClubDetailScreen`), `MyClosetComponent` + `OutfitComponent` (implicit — curation pickers pull the viewer's own inventory).
- **Platform**: `platform/imagepicker/ImagePickerManager` + `createImagePickerManager()` (thumbnail + banner selection).
- **Compose Resources**: 40+ `Res.string.club_*` keys covering titles, empty states, edit/gate errors, curation copy, and members count.
- **Navigation**: `@Serializable` typed destinations via `androidx.navigation.compose`.
- **Config**: `demo3.config.BuildKonfig.WEB_APP_BASE_URL` for share URLs.

## Known Issues / Drift

- **Cross-feature domain imports.** `ClubRepository` interface imports `OutfitItem` (`features/outfits`) and `MyItem` (`features/mycloset`); `ClubDetailViewModel` imports `MarketplaceFilters` from `features/marketplace`. These violate the no-cross-feature-imports rule and should be mirrored as club-scoped domain types or lifted into a shared core model.
- **Hardcoded user-visible strings in `ClubViewModel.onCreateClubEvent`** — validation errors like `"Club name is required."`, `"Club logo is required."`, `"Please select a brand."`, `"Fundraiser organization info is required."`, and the fallback `"Couldn't create your club. Please try again."` bypass Compose Resources. Move to `Res.string.*` keys (the pattern used elsewhere in the file, e.g. `club_edit_error_*`).
- **Hardcoded `"Something went wrong."`** in `ClubDetailScreenContent` error branch (`ClubDetailScreen.kt:378`). Should use `stringResource(Res.string.club_error_load_failed)` or an equivalent key.
- **`ClubsLandingUiState` / `ClubDetailUiState` are `sealed class`, not `sealed interface`.** AGENTS.md prescribes `sealed interface` for `UiState`; migrate opportunistically.
- **Dead `Empty` variant** on `ClubsLandingUiState` — carries a source comment "Probably unused if empty states are handled in Success"; per-grid empties inside `Success` cover the real cases. Consider removing.
- **Dead `ClubViewModel` methods** — `onClubCardClick(clubId)` and `onGuestStartClubClick()` are no-op stubs whose logic lives elsewhere. Delete or wire.
- **No `@Preview` for `ClubDetailScreenContent`.** Only `ClubScreenContent` has previews (Loading / Error / Success). Detail screen has none and is hard to iterate on visually.
- **Stale api-client-kmp drift** documented separately in `docs/PORTING_ISSUES.md` — fundraiser fields and query-capable `getUserClubs` are backend-supported but not yet regenerated in the client.

## Tests

| File | What it tests |
|------|---------------|
| `commonTest/.../domain/repository/FakeClubRepository.kt` | In-memory `ClubRepository` stub used by use-case tests. |
| `commonTest/.../domain/repository/ClubRepositoryTest.kt` | Contract tests exercising the fake. |
| `commonTest/.../data/repository/FakeClubRepository.kt` | Data-layer fake (parallel copy). |
| `commonTest/.../data/repository/ClubRepositoryImplTest.kt` | `ClubRepositoryImpl`: API delegation, DTO → domain mapping, pagination, error wrapping via `safeCall`. |
| `commonTest/.../domain/usecase/{Create,Delete,GetClubDetails,GetClubMarketplace,GetClubOutfits,GetClubs,GetMyClubs,Join,Leave}ClubUseCaseTest.kt` | Per use-case unit tests (9 files). |
| `commonTest/.../ui/ClubViewModelTest.kt` | Landing VM: load/refresh, tab switching, search debouncing, pagination, create-dialog state machine. |
| `commonTest/.../ui/detail/ClubDetailViewModelMembershipTest.kt` | Detail VM: join / leave / private-gate / invite-code flows. |
| `commonTest/.../ui/detail/ClubDetailViewModelEditTest.kt` | Detail VM: edit dialog, banner pick/remove, save/error mapping. |
| `commonTest/.../ui/detail/ClubDetailViewModelCurationTest.kt` | Detail VM: curation picker open/close and item/outfit sync happy-path + error. |
| `desktopTest/.../club/ClubLandingVisualDiffTest.kt` | Screenshot regression for `ClubScreenContent` states. |
| `desktopTest/.../club/ClubLandingModalsVisualDiffTest.kt` | Screenshot regression for `CreateClubDialog`. |
| `desktopTest/.../club/ClubDetailVisualDiffTest.kt` | Screenshot regression for `ClubDetailScreenContent` tabs. |
| `desktopTest/.../club/ClubDetailModalsAVisualDiffTest.kt` / `ClubDetailModalsBVisualDiffTest.kt` | Screenshot regression for detail dialogs (split A/B). |
| `desktopTest/.../club/ClubVisualDiffFixtures.kt` | Shared fixture builders backed by `desktopTest/resources/fixtures/club/*.json`. |

## See Also

- [`../core.md`](../core.md) — `ViewModel<T>`, `DiProvider`, `PaginatedResult`, `safeCall`.
- [`index.md`](index.md) — feature catalogue and module conventions.
- [`mycloset.md`](mycloset.md) — provides `MyItem` consumed by club marketplace.
- [`outfits.md`](outfits.md) — provides `OutfitItem` consumed by club outfit feed.
- [`marketplace.md`](marketplace.md) — provides `MarketplaceFilters` + sort/filter chip used on the detail marketplace tab.
- [`../app-plugin.md`](../app-plugin.md) — `RevivlePlugin` registers `ClubComponent` and wires both club routes.

_Last updated: 2026-08-01 — Refreshed against source (16d drift). Removed non-canonical `## Recent Changes` heading; corrected ViewModel count (2, not 4) reflecting unified `ClubViewModel`; added `ClubDetailScreen` UI description, cross-feature `MarketplaceFilters` dependency, hardcoded-strings drift, and full test inventory (ClubViewModelTest, 3 detail VM tests split by concern, 5 visual-diff tests)._
