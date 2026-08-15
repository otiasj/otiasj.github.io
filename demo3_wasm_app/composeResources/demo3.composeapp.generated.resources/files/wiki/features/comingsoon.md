---
type: feature
title: Coming Soon
description: Domain-only feature exposing an enum of unreleased Demo3 features and
  use cases for registering / querying notify-me subscriptions against the Revivle
  feature-notifications API.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/comingsoon/]
tags: [demo3, feature, comingsoon]
timestamp: '2026-08-01T00:00:00Z'
category: feature
---

# Coming Soon

## Purpose

Ported from the Revivle web app in #1303, this feature owns the vocabulary and contract for "notify me when it ships" subscriptions on features that are advertised but not yet released (currently Clubs, Outfits, Games).

Location: `features/comingsoon/`

## Responsibility

`comingsoon` is a **domain-only** slice. It owns the `ComingSoonFeature` enum (the closed set of previewed features), the `FeatureNotificationStatus` domain model, the `ComingSoonRepository` interface, and three use cases wrapping single-shot calls: `GetFeatureNotificationStatusUseCase`, `RegisterFeatureNotificationUseCase`, `GetAllFeatureNotificationStatusesUseCase`. It does **not** own a repository implementation, a `Component`, a ViewModel, a screen, or an `AppPlugin` registration — those layers were not part of the port and no in-app screen currently consumes any of these types.

## Route & Entry Point

None. `comingsoon` has no route object, no `NavGraphBuilder` extension, no `NavController.navigateToXxx()` helper, and no entry in any `AppPlugin`. It is not reachable through navigation because it has no UI yet.

## Key Types

| Type | Description |
|------|-------------|
| `ComingSoonFeature` | `enum class` with entries `CLUBS`, `OUTFITS`, `GAMES`; each carries a stable `key: String` (`"clubs"`, `"outfits"`, `"games"`) used as the backend identifier and an `emoji: String` (`👥`, `👔`, `🎮`) for display. `fromKey(key)` does case-insensitive lookup and returns `null` on unknown keys. |
| `FeatureNotificationStatus` | `data class(feature: ComingSoonFeature, isRegistered: Boolean, registeredAt: String? = null)`. Represents whether the current user is registered to be notified about `feature`, with an optional registration timestamp as an unparsed string. |
| `ComingSoonRepository` | Interface with three `suspend` methods, all returning `Result<…>`: `getFeatureNotificationStatus(feature)`, `registerFeatureNotification(feature)`, `getAllFeatureNotificationStatuses()`. **No implementation exists in Demo3 yet.** |
| `GetFeatureNotificationStatusUseCase` | `suspend operator fun invoke(feature): Result<FeatureNotificationStatus>`. Delegates to the repository inside `core.domain.model.safeCall { … getOrThrow() }`. |
| `RegisterFeatureNotificationUseCase` | `suspend operator fun invoke(feature): Result<FeatureNotificationStatus>`. Same shape as the getter — subscribes the current user to notifications for one feature. |
| `GetAllFeatureNotificationStatusesUseCase` | `suspend operator fun invoke(): Result<List<FeatureNotificationStatus>>`. Bulk fetch across every `ComingSoonFeature` the backend knows about. |

## UI

_No user-facing screen._ The port stopped at the domain layer; there is no `ComingSoonScreen`, `ComingSoonContent`, `ComingSoonViewModel`, or `@Preview` composable in this feature. When a UI is eventually added, existing "coming soon" placeholders elsewhere in the app (e.g. `strings_item_detail.xml`'s `item_detail_coming_soon`) should be audited to see if they can route through this feature instead of holding their own text.

## Architecture

```
comingsoon/
└── domain/
    ├── model/
    │   ├── ComingSoonFeature.kt              # enum: CLUBS / OUTFITS / GAMES
    │   └── FeatureNotificationStatus.kt      # data class
    ├── repository/
    │   └── ComingSoonRepository.kt           # interface, no implementation
    └── usecase/
        ├── GetFeatureNotificationStatusUseCase.kt
        ├── RegisterFeatureNotificationUseCase.kt
        └── GetAllFeatureNotificationStatusesUseCase.kt
```

There is no `data/` package (no repository implementation, no remote data source, no mappers), no `ui/` package (no screen, VM, state, previews), and no top-level `ComingSoonComponent.kt` — so the feature cannot be instantiated by `DiProvider` today. The corresponding backend endpoints exist in the generated Revivle API client at `core/data/datasource/remote/revivle/api/client/apis/FeatureNotificationsApi.kt`, which is the natural target for an eventual `ComingSoonRepositoryImpl`.

## Data Flow

Once wired end-to-end, the intended flow is:

1. UI action (e.g. "Notify me" button on a placeholder card) calls `RegisterFeatureNotificationUseCase(ComingSoonFeature.CLUBS)`.
2. Use case wraps the call in `safeCall` and delegates to `ComingSoonRepository.registerFeatureNotification(feature)`.
3. Repository implementation (not yet written) would forward to `FeatureNotificationsApi` in the generated Revivle client, passing `feature.key`.
4. Response mapped back to `FeatureNotificationStatus` and returned as `Result.success`.
5. `GetAllFeatureNotificationStatusesUseCase` is intended for a settings/preview screen that lists every upcoming feature with its subscription state in one shot.

Today, none of these calls are invoked from any ViewModel — the feature has zero runtime callers inside Demo3.

## Dependencies

- **Own**: nothing — the feature declares only its own domain types.
- **Core**: `com.otiasj.core.domain.model.safeCall` (each use case wraps `repository.getXxx().getOrThrow()` inside it).
- **Cross-feature**: none.
- **Compose Resources**: none (no user-visible strings owned by this feature yet).
- **Navigation**: none.
- **Would need on completion**: `revivle-api-client` (`FeatureNotificationsApi`, `FeatureStatusResponse`, `FeatureRegistrationResponse`, `AllFeaturesStatusResponse`) plus an `AuthTokenProvider` for the eventual `ComingSoonRepositoryImpl`.

## Known Issues / Drift

- **No `ComingSoonRepositoryImpl`, no `ComingSoonComponent`, no `AppPlugin` registration**: `ComingSoonRepository` is an interface with no implementation in `composeApp`; there is no `<Name>Component.kt` at the feature root; and no plugin under `composeApp/src/commonMain/kotlin/com/otiasj/app/` references either. The feature cannot be instantiated through `DiProvider` today and is invisible to navigation.
- **No consumers**: outside `features/comingsoon/`, only the generated `FeatureNotificationsApi` matches the name (coincidental — it does not import these types). No ViewModel, screen, or use case in the app calls the feature. All three use cases, the enum, the data class, and the repository interface are dead surface area — either wire up a UI slice (e.g. the item-detail "Coming soon" placeholder) or remove the feature.
- **Double-wrapped `safeCall`**: each use case calls `safeCall { repository.getXxx().getOrThrow() }` on a repository method whose contract already returns `Result`. Any correct impl will nest `safeCall` on both sides of the seam. Same shape as the drift on [template](template.md).
- **`registeredAt` is a raw `String`**: `FeatureNotificationStatus.registeredAt: String?` is left unparsed. Other timestamps in the codebase use `kotlinx.datetime.Instant` (see `RevivleComment`); align before any UI renders it.
- **Not listed in the features index**: `.wiki/apps/demo3/features/index.md` does not yet mention `comingsoon` (header still says "31 feature modules"). Add a row when this feature grows past domain-only.

## Tests

No tests yet. There is no `composeApp/src/commonTest/kotlin/com/otiasj/features/comingsoon/` directory. When implementation lands, at minimum:

- A `FakeComingSoonRepository` under `commonTest` for isolated use-case tests.
- One unit test per use case exercising success + failure paths.
- A `ComingSoonFeature.fromKeyTest` covering the case-insensitive lookup and the unknown-key `null` return.

See [demo3-overview](../index.md) for coverage status.

## See Also

- [template](template.md) — canonical shape a future `ComingSoonComponent` / repository impl / screen should follow when this feature grows past domain-only.
- [shared](shared.md) — reference for how a domain-only slice is documented and consumed by other features without a route of its own.
- `core/data/datasource/remote/revivle/api/client/apis/FeatureNotificationsApi.kt` — generated Revivle client that the eventual `ComingSoonRepositoryImpl` will call.

_Last updated: 2026-08-01 — Initial page (was missing). Ported from Revivle web in #1303 as domain-only; flagged as blocked on repository impl, `Component`, `AppPlugin` registration, UI, and tests._
