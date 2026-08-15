---
type: feature
title: Listing
description: Domain-only skeleton for the item-listing flow (pricing suggestions,
  pricing tiers, image-enhancement eligibility, confirm listing) — ported from the
  Revivle web listing feature; no data layer, no UI, no wiring.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/listing/]
tags: [demo3, feature, listing, domain-only, incomplete]
timestamp: '2026-08-01T00:00:00Z'
last_commit: 27555c78f1739314200e41eb089198dee29dc99b
category: feature
---

# Listing

## Purpose
Domain-only skeleton for the item-listing flow — surfacing pricing suggestions from eBay comps, calculating pricing tiers (sell-fast / recommended / sell-slow), reporting AI image-enhancement eligibility, and confirming a listing with a chosen sale price. Ported from the Revivle web `listing` feature in [PR #1297](https://github.com/otiasj/MonoRepo/pull/1297); Gherkin user stories were added later in [PR #1305](https://github.com/otiasj/MonoRepo/pull/1305).

Location: `features/listing/`

The feature currently ships **only the domain layer**: four data-class models, a repository interface with no implementation, and four thin use cases. No data source, no repository impl, no `ListingComponent`, no ViewModel, no screen, no route, no `AppPlugin` registration, and no consumers anywhere else in the module. It is dead surface area until the data/UI layers land.

## Responsibility

Owns the domain vocabulary for turning a `mycloset` item into a listed marketplace item:

1. **Pricing intelligence** — fetch `PricingSuggestions` (average eBay comps price + original price) for an item, and derive `PricingTiers` (`sellFast` / `recommended` / `sellSlow`, plus a `hasComps` flag). Tier math lives on `PricingSuggestions.calculatePricingTiers()` and falls back to a percentage of `originalPrice` when comps are absent.
2. **Image-enhancement eligibility** — fetch a boolean `ItemImageEnhancementEligibility` telling the caller whether the item's main photo qualifies for AI enhancement.
3. **Confirm listing** — accept a `ListingConfirmParams(itemId, salePrice, requestImageEnhancement)` and persist the listing decision.

The feature deliberately does **not** own: item CRUD (`mycloset`), marketplace browsing (`marketplace`), the item-detail viewer (`itemdetail`), or the eBay comps source itself (comps are expected to arrive pre-computed from the backend behind the repository interface).

## Route & Entry Point

None. There is no `@Serializable` route object, no `NavGraphBuilder.listingRoute(...)`, and no `NavController.navigateToListing()` extension. No `AppPlugin` under `com.otiasj.app.*` references any listing symbol, so nothing is registered with `DiProvider` at startup. The intended consumers (likely `mycloset` or `itemdetail`) do not import this package yet.

When the UI layer is added, the canonical wiring will be: a `ListingComponent` registered from the owning `AppPlugin`, a `ListingRoute` `@Serializable` object, and a `listingRoute(...)` NavGraph adapter following the route/pane/content split described in [template](template.md).

## Key Types

| Type | Description |
|------|-------------|
| `ListingRepository` | Interface: `getPricingSuggestions(itemId)`, `getPricingTiers(itemId)`, `getItemImageEnhancementEligibility(itemId)`, `confirmItemListing(params)` — all `suspend`, all return `Result<T>`. No implementation exists yet. |
| `PricingSuggestions` | `averageCompsPrice: Double?`, `originalPrice: Double`; owns `calculatePricingTiers(): PricingTiers?` — tier math (0.75× / 1.0× / 1.25× on comps, 0.6× / 0.8× / 1.0× on original) with a `max(1, …)` floor. |
| `PricingTiers` | `sellFast: Int`, `recommended: Int`, `sellSlow: Int`, `originalPrice: Double`, `hasComps: Boolean`. |
| `ItemImageEnhancementEligibility` | Single-field wrapper: `eligible: Boolean`. |
| `ListingConfirmParams` | `itemId: Long`, `salePrice: Double`, `requestImageEnhancement: Boolean`. |
| `GetPricingSuggestionsUseCase` | `invoke(itemId: Long): Result<PricingSuggestions>` — wraps the repo call in `safeCall`. |
| `GetPricingTiersUseCase` | `invoke(itemId: Long): Result<PricingTiers?>` — repo-side already applies the tier calc. |
| `GetItemImageEnhancementEligibilityUseCase` | `invoke(itemId: Long): Result<ItemImageEnhancementEligibility>`. |
| `ConfirmItemListingUseCase` | `invoke(params: ListingConfirmParams): Result<Unit>`. |

## UI

_No user-facing screen._ The feature has no `*Screen.kt`, no `*Pane.kt`, no `*Content.kt`, and no `@Preview`. Any listing UI would need to be authored from scratch on top of this domain layer (or the intended host feature — likely `mycloset` or `itemdetail` — could compose the use cases directly into its own screen).

## Architecture

```
listing/
└── domain/
    ├── model/
    │   ├── ItemImageEnhancementEligibility.kt
    │   ├── ListingConfirmParams.kt
    │   ├── PricingSuggestions.kt        # owns calculatePricingTiers()
    │   └── PricingTiers.kt
    ├── repository/
    │   └── ListingRepository.kt         # interface only, no impl
    └── usecase/
        ├── ConfirmItemListingUseCase.kt
        ├── GetItemImageEnhancementEligibilityUseCase.kt
        ├── GetPricingSuggestionsUseCase.kt
        └── GetPricingTiersUseCase.kt
```

No `data/` package. No `ui/` package. No `ListingComponent.kt`. The canonical clean-architecture layout is only half-present — this is a domain port, not a runnable feature.

## Data Flow

There is no runtime data flow yet because nothing calls the use cases. The intended flow (mirroring the web listing feature) is:

1. Host screen resolves the four use cases via `ListingComponent` (to be created) from `DiProvider`.
2. On item selection → `GetPricingSuggestionsUseCase(itemId)` and `GetItemImageEnhancementEligibilityUseCase(itemId)` fire in parallel.
3. UI derives tiers by calling `PricingSuggestions.calculatePricingTiers()` client-side, **or** calls `GetPricingTiersUseCase(itemId)` if the backend returns pre-computed tiers.
4. User picks a tier (or types a custom price) and optionally toggles image enhancement.
5. Submit → `ConfirmItemListingUseCase(ListingConfirmParams(itemId, salePrice, requestImageEnhancement))` → `Result<Unit>` maps to Success/Error state on the host screen.

Until a data-layer implementation is wired into `DiProvider`, any call into these use cases will fail at DI resolution time.

## Dependencies

- **Own**: `ListingRepository` (interface only — no implementation exists in `commonMain` or any platform source set).
- **Core**: `com.otiasj.core.domain.model.safeCall` (used by every use case).
- **Cross-feature**: None. No import of any other `features/*` package.
- **Compose Resources**: None (no UI layer).
- **Navigation**: None (no route, no NavGraph entry).

The lack of dependencies is itself a symptom: the feature is not yet reachable from any composition root.

## Known Issues / Drift

- **Feature is dead code — no implementation, no wiring, no consumers.** No `ListingRepositoryImpl`, no `ListingComponent`, no `AppPlugin` registration. A repo-wide grep for `features.listing` and each use-case class name returns hits only inside `features/listing/` itself (plus a `mycloset` structural report artifact). Until a data layer and a caller are added, this feature is compiled but never executed.
- **All four use cases double-wrap `safeCall`.** Each use case is `safeCall { val result = repository.xxx(); if (result.isSuccess) result.getOrThrow() else throw result.exceptionOrNull() ?: Exception(...) }`, but `ListingRepository.xxx()` already returns `Result<T>`. The outer `safeCall` re-throws and re-wraps, producing an awkward nested try/catch with no added protection — the same drift called out on [template](template.md) `GetTemplateItemsUseCase`. Either drop the outer `safeCall` (repo already yields `Result`) or have the repo interface return raw values.
- **`PricingTiers` responsibility split between `PricingSuggestions.calculatePricingTiers()` (client-side math) and `ListingRepository.getPricingTiers()` (server-side value).** Two sources of truth for the same tier values; the consumer must pick one, and there is no comment or ADR explaining which is authoritative.
- **Repository interface has no `Impl`.** `ListingRepository` is unimplemented in every source set — attempting to register a `ListingComponent` without providing an impl will not compile.
- **No `ListingComponent` for manual DI.** Convention (per `Applications/Demo3/AGENTS.md`) requires a feature-scoped `Component` class; the feature ships none.
- **No `Preview`, `Screen`, `ViewModel`, or `UiState`.** Convention requires all four; none exist because there is no UI layer.
- **No `@Serializable` route.** Convention requires it; none exists because the feature has no entry point.

## Tests

No tests yet. `commonTest/kotlin/com/otiasj/features/listing/` does not exist, and no `FakeListingRepository` has been authored. The most valuable first test would be `PricingSuggestionsTest` — `calculatePricingTiers()` is pure logic with several branches (comps present, comps zero/null with original price, both zero) and can be exercised without any repository fake.

See [demo3-qa-engineer](../../../CONVENTIONS.md) coverage guidance for planning the wider test suite once the data/UI layers land.

## See Also

- [mycloset](mycloset.md) — most likely host for the listing flow; items originate here.
- [itemdetail](itemdetail.md) — alternative host; users can currently edit but not list items.
- [marketplace](marketplace.md) — downstream surface where confirmed listings appear.
- [template](template.md) — canonical feature scaffold showing the full layout this feature is missing (Component, data impl, UI, tests).
- [push](push.md) — precedent for a legitimately UI-less feature; useful contrast when deciding whether `listing` should stay domain-only or grow a UI.

_Last updated: 2026-08-01 — Initial page. Feature is a domain-only port from Revivle web (PR #1297); no data layer, no UI, no consumers._
