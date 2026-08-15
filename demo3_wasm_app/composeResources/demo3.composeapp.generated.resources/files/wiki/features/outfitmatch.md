---
type: feature
title: Outfit Match (segmentation PoC)
description: On-device garment segmentation of an outfit photo, rendered as a per-category
  mask/bounding-box overlay. Proof-of-concept stage — the matching/indexing pipeline is not built yet.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/outfitmatch/, Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/platform/ml/]
tags: [demo3, feature, outfitmatch, ml, segmentation, poc]
timestamp: '2026-07-17T00:00:00Z'
last_commit: e750da9e6
category: feature
---

# Outfit Match (segmentation PoC)

## Purpose
On-device segmentation of an outfit photo into garment regions (TOP / BOTTOM / SHOES / UNKNOWN),
rendered as a visual overlay of tinted masks + bounding boxes + toggleable confidence chips.

Location: `features/outfitmatch/` (feature slice) + `platform/ml/` (expect/actual segmenter).

## Status — proof of concept

This is the **segmentation-first slice** of the larger [Outfit Matching plan](../../../../Applications/Demo3/docs/outfit_matching_implementation_plan.md).
Segmentation is that plan's highest-risk component, so it was built and validated on its own before
any of the matching phases. **None of the vector-DB / embedding / gallery-indexing / matching work
exists yet** — this feature currently just downloads an outfit photo, segments it, and shows the
result so segmentation quality can be judged with real data.

Validated on: **Android emulator** and **physical iOS device** (iPhone 17 / iOS 26.5.2).

## Route & Entry Point

Entry is the **hanger / Checkroom icon** in the top bar of the Revivle outfit detail screen
(`features/outfits/ui/OutfitDetailScreen.kt` → `onNavigateToOutfitMatch(imageUrl)`), wired in
`app/plugins/RevivlePlugin.kt`.

Route object is `@Serializable OutfitMatchRoute(val imageUrl: String)`; registered via
`NavGraphBuilder.outfitMatchScreenRoute()` in `OutfitMatchScreen.kt`. Navigation:

```kotlin
navController.navigateToOutfitMatch(imageUrl)
```

`OutfitMatchPane` (the only DI-touching layer) resolves `OutfitMatchComponent` from `DiProvider`,
calls `viewModel.load(imageUrl)`, and renders the stateless `OutfitMatchScreen(state, …)`.

## Key Types

| Class | Role |
|---|---|
| `ImageSegmenter` (`platform/ml/domain`) | `expect fun createImageSegmenter(): ImageSegmenter?`; `suspend fun segment(bytes): SegmentationResult` |
| `SegmentationResult` | `imageWidth`, `imageHeight`, `regions: List<GarmentRegion>` |
| `GarmentRegion` | `category`, `boundingBox: NormalizedRect`, `confidence`, `maskPng: ByteArray` (white-on-transparent) |
| `GarmentCategory` | enum `TOP` / `BOTTOM` / `SHOES` / `UNKNOWN` |
| `MaskGeometry` | pure-Kotlin bbox / row-split / hip-line helpers (commonTest-covered) |
| `DownloadOutfitImageUseCase` → `OutfitImageRepository` | fetches the outfit photo bytes from its public URL |
| `OutfitMatchViewModel` | orchestrates download → segment → expose regions; analytics deliberately `null` (states carry raw image bytes) |
| `OutfitMatchUiState` | sealed: `Loading`, `Segmenting(bytes)`, `Success(bytes, result, visibleCategories)`, `Unsupported`, `Error` |
| `SegmentationOverlay` / `GarmentChipRow` | overlay of tinted masks + boxes; per-category toggle chips |

## Segmenter actuals (expect/actual)

| Source set | `ImageSegmenter` implementation |
|---|---|
| `androidMain` | MediaPipe **Image Segmenter** (`selfie_multiclass_256x256.tflite`, ~16 MB, downloaded by a Gradle task — not committed). Clothes class → TOP/BOTTOM split at `MaskGeometry.DEFAULT_HIP_FRACTION`; whole clothes mask reported as `UNKNOWN`. |
| `iosMain` | Vision `VNGeneratePersonSegmentationRequest` (person mask) + `VNDetectHumanBodyPoseRequest` (neck/hip landmarks). TOP = mask between neck & hip lines, BOTTOM = below hips, whole person = `UNKNOWN`. (`VNDetectHumanPartSegmentationRequest` from the original spec is **not a public API** — this pose-based approach is the fallback.) |
| `desktopMain`, `wasmJsMain` | factory returns `null` → ViewModel surfaces `Unsupported`. Everything still compiles on every target. |

## Data Flow

1. `OutfitMatchPane.load(imageUrl)` → `DownloadOutfitImageUseCase` fetches the photo bytes.
2. ViewModel emits `Segmenting(bytes)` (dimmed preview + spinner).
3. `ImageSegmenter.segment(bytes)` runs on-device → `SegmentationResult`.
4. ViewModel emits `Success(bytes, result, visibleCategories = all)`.
5. `SegmentationOverlay` draws the photo with per-category tinted masks + bounding boxes;
   `GarmentChipRow` chips toggle category visibility.
6. Empty regions → `EmptyState`; failure → `Error` with retry. Selfie bytes are held in memory only,
   never persisted (privacy).

## Platform quality findings (one fitting-room test photo)

- **Android**: hip-line TOP/BOTTOM split works (~84–86% confidence). The "clothes" class is **not
  person-scoped** — it also masks background garments (a hanging jacket/pants), which would pollute
  gallery vectors if indexed whole-image. **No shoe class.**
- **iOS**: pose-landmark split is cleaner (neck landmark excludes the head). `VNGeneratePersonSegmentationRequest`
  is **person-scoped**, so background garments are correctly excluded. **BOTTOM includes shoes.**
  Confidences (Top/Bottom ~67%) are pose-joint confidence, not comparable to Android's mask confidence.
  Regions render as axis-aligned bounding boxes, so each rectangle includes some background pixels.
- Implication: the eventual indexing representation may need to be **platform-specific** (Android needs
  person-mask intersection / per-garment crops; iOS whole-person `UNKNOWN` is already clean).

Iteration-2 improvements (connected-component filtering, `SegmentationConfig`, in-app tuning UI,
Android pose landmarks for a real shoes region, two-pass resolution) are specced in the plan but not
yet built.

## iOS build note

The iOS app links `libtailscale.a` from vendored in-repo archives under
`composeApp/native/libtailscale/<target>/` (git-lfs); the `tailscale-kmp` Maven artifact does not ship
the native lib. See `scripts/prepare-ios-libtailscale.sh` and
[[../../../../Applications/Demo3/docs/outfit_matching_implementation_plan.md]] §0. Unrelated to this
feature, but required for any iOS build that includes it.

## Dependencies

- `platform/ml/` — segmenter expect/actual, geometry
- `platform/imagepicker/` — reserved for the future selfie-capture path (not used by the PoC entry)
- `core/ui` — `ViewModel`, `AppScaffold`, `EmptyState`, `ErrorState`, `FullScreenLoading`
- `features/outfits/` — entry point (outfit detail screen)
- Coil3 `AsyncImage` — photo + mask rendering

## See Also

- [Outfit Matching implementation plan](../../../../Applications/Demo3/docs/outfit_matching_implementation_plan.md) — full roadmap, risks, phases
- `features/outfits/` — outfit detail screen that launches this feature
- `features/mycloset/` — closet items; the natural target of the future matching pipeline

_Last updated: 2026-07-17_
