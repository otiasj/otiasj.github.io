---
type: feature
title: Closet Quick Add
description: Fully ported bulk-create closet flow — group photos into rows and validate/submit
  them as new closet items. Domain, data, UI, and wiring layers are all present.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/closetquickadd/]
tags: [demo3, feature, closetquickadd]
timestamp: '2026-08-10T00:00:00Z'
category: feature
---

# Closet Quick Add

## Purpose

Bulk-create flow that turns a batch of photos into one closet item per photo (or per user-defined row). Users pick multiple photos, tweak brand / name / colour / size on each row, and submit them all together as new closet items.

Porting timeline: domain (PR #1301, 2026-07-31) → data + UI (PR ~2026-08-05) → API wiring + compile fixes (2026-08-10). All layers are now ported.

Location: `features/closetquickadd/`

## Responsibility

**Owns:** Domain models, use cases, `ClosetQuickAddRepositoryImpl` (wired to `ClosetApi`), `ClosetQuickAddViewModel`, `ClosetQuickAddScreen`/`Content`, and `ClosetQuickAddComponent` (DI).

**Does NOT own:** The closet listing surface — the entry point to this flow lives in [mycloset](mycloset.md) via `navigateToCreateItem`.

## Route & Entry Point

`ClosetQuickAddComponent` provides the DI container. `ClosetQuickAddViewModel` is resolved via `DiProvider.getComponent(ClosetQuickAddComponent::class)`. The screen is registered in the Revivle plugin collection and is reachable from the mycloset screen's "Quick Add" action.

## Key Types

| Type | Description |
|------|-------------|
| `ClosetQuickAddRepository` | Interface: `createClosetItem(input)` (single) and `createBatchClosetItems(inputs)` returning `Result<List<String>>` of created IDs. No implementation exists yet. |
| `QuickAddRow` | Editable row: `id`, `brand`, `colorName`, `itemName`, `sizeIds`, `photos`, `fieldErrors`, `submitError`; `isBlank` derived; caps: `MAX_PHOTOS_PER_ROW = 20`, `MAX_ROWS = 25`, `MAX_BULK_PHOTOS = 20`. |
| `QuickAddPhotoAsset` | Photo model: `id`, `fileName`, `previewUrl`, `fileData: ByteArray?`; hand-rolled `equals`/`hashCode` for the byte array. |
| `QuickAddFieldErrors` | Per-field validation errors (`brand`, `itemName`, `sizeIds`, `photos`) with `hasErrors` flag. |
| `CreateQuickAddItemInput` | Repository payload: `rowId`, `name`, `brand`, `itemColor?`, `quantity = 1`, `sizeIds?`, `photos`. |
| `AddPhotosResult` | `updatedRow: QuickAddRow` + `warnings: List<String>`. Returned by `AddPhotosToQuickAddRowUseCase`. |
| `AddRowsFromPhotosResult` | `updatedRows: List<QuickAddRow>`, `addedCount: Int`, `warnings`. Returned by `CreateRowsFromPhotosUseCase`. |
| `QuickAddBatchResult` | `successfulRowIds: List<String>`, `failedRows: Map<String, String>` (rowId → error); `isAllSuccessful`, `totalProcessed` derived. |
| `ValidateQuickAddRowUseCase` | Requires non-blank `brand` and `itemName`; preserves any pre-existing `sizeIds` / `photos` errors on the row. |
| `AddPhotosToQuickAddRowUseCase` | Appends photos to a row up to `MAX_PHOTOS_PER_ROW`, truncating with a warning; sets the row's `fieldErrors.photos` message when nothing could be added. |
| `CreateRowsFromPhotosUseCase` | Turns a bulk photo pick into one row per photo, respecting `MAX_ROWS` and `MAX_BULK_PHOTOS`; replaces a single initial blank row instead of appending. |
| `MovePhotoBetweenRowsUseCase` | Moves a photo between two rows, prunes the source row if it becomes blank, and re-seeds `"quick-add-row-1"` if everything is empty. |
| `CreateQuickAddClosetItemUseCase` | Thin wrapper over `repository.createClosetItem(...)`. |
| `SubmitQuickAddBatchUseCase` | Validates every row, then per-row calls `repository.createClosetItem(...)` and collects successes / failures into a `QuickAddBatchResult`. |

## UI

_No user-facing screen._ The `ui/` package does not exist yet — this feature is domain-only pending `port-ui`. When ported, the expected shape (based on the Revivle web original) is a bulk-edit list of rows with per-row photo strips, brand/name/size inputs, plus a "Submit all" action.

## Architecture

```
closetquickadd/
├── ClosetQuickAddComponent.kt               # DI: ClosetApi, RepositoryImpl, ViewModel
├── data/repository/
│   └── ClosetQuickAddRepositoryImpl.kt      # wired to ClosetApi
├── docs/                                    # ui_brief, porting_issues, user_stories
├── domain/
│   ├── model/                               # QuickAddRow, QuickAddPhotoAsset, etc.
│   ├── repository/
│   │   └── ClosetQuickAddRepository.kt      # interface
│   └── usecase/                             # 6 use cases (Add*, Create*, Move*, Submit*, Validate*)
└── ui/
    ├── components/                          # row card composables
    ├── ClosetQuickAddScreen.kt              # route adapter + nav extensions
    ├── ClosetQuickAddUiState.kt             # sealed: Loading / Success / Error + BannerTone
    └── ClosetQuickAddViewModel.kt           # resolves component via DiProvider
```

## Data Flow

Because no ViewModel exists, the intended orchestration is documented from the use-case surface:

1. **Bulk photo pick** → `CreateRowsFromPhotosUseCase(currentRows, photos)` → either replaces the initial blank row or appends new rows, one per photo, capped at 25 rows / 20 photos per pick; extras yield a warning string.
2. **Add photos to an existing row** → `AddPhotosToQuickAddRowUseCase(row, newPhotos)` → appends up to `MAX_PHOTOS_PER_ROW`, truncating and returning warnings; sets `row.fieldErrors.photos` when nothing fits.
3. **Drag / reassign a photo** → `MovePhotoBetweenRowsUseCase(rows, sourceRowId, photoId, targetRowId)` → moves the photo, prunes the source row if it becomes blank, refuses (returns unchanged) when the target row is full, re-seeds `"quick-add-row-1"` when all rows would be pruned.
4. **Row edit** → not a use case; the future ViewModel would `copy(...)` fields directly on `QuickAddRow`.
5. **Per-row validation on submit** → `ValidateQuickAddRowUseCase(row)` → non-blank `brand` and `itemName`; preserves existing `sizeIds` / `photos` errors.
6. **Submit all** → `SubmitQuickAddBatchUseCase(rows)` → validates each row; on validation failure records `"Row has validation errors"` for that `rowId`; on validation success builds a `CreateQuickAddItemInput` (with `quantity = 1`) and calls `repository.createClosetItem(input)`; aggregates results into `QuickAddBatchResult`.

## Dependencies

- **Core**: `DiProvider`, `safeCall`, `com.revivle.api.client.apis.ClosetApi`, `AuthTokenProvider`, `LoggingHttpClient`, `Configuration.myClosetApiBaseUrl`.
- **Compose Resources**: `strings_closetquickadd.xml` — localized validation and warning strings.
- **Cross-feature**: Entry point wired from [mycloset](mycloset.md) (`navigateToCreateItem`).

## Known Issues / Drift

- **Hardcoded banner messages in ViewModel.** `onUploadPhotos` and failure paths use English literals ("Partial success", "We couldn't add any of those photos.") directly on `_uiState`. These should be lifted to string resources per `AGENTS.md`.
- **`CreateQuickAddClosetItemUseCase` double-wraps `safeCall`.** Same pattern as previously called out: repository returns `Result`, use case wraps in `safeCall`, then rethrows the inner exception — redundant try/catch nesting.
- **`SubmitQuickAddBatchUseCase` hardcodes `quantity = 1`.** Multi-quantity items cannot be created through this flow.
- **Dead surface: `createBatchClosetItems`.** `ClosetQuickAddRepository.createBatchClosetItems(inputs)` is never called; the batch submits per-row via `createClosetItem`.
- **`QuickAddPhotoAsset.fileData: ByteArray?` in a domain model.** Raw bytes in the domain layer make equality/hash awkward (hand-rolled) and can bloat state snapshots.

## Tests

No tests yet. The domain use cases are unit-testable in isolation; coverage was not produced during porting.

## See Also

- [mycloset](mycloset.md) — closet listing surface that would host the entry point for this flow.
- [itemdetail](itemdetail.md) — sibling that owns individual-item edit/create.
- [template](template.md) — canonical feature layout; use it as the reference when porting the data, UI, and wiring layers.
- [demo3 export model](../export-model.md) — the porting-engine pipeline that produced this domain layer.

_Last updated: 2026-08-10 — Feature is now fully ported (domain + data + UI + wiring). Updated from domain-only status following PRs completing data layer, UI layer, API wiring, and DI component._
