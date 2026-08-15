---
type: feature
title: Transactions
description: Manages the full buyer/seller transaction lifecycle — offers, reservations,
  payment method setup, and fee calculation — from first contact through completed
  sale.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/transactions/]
tags: [demo3, feature, transactions]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Transactions

## Purpose
Manages the full buyer/seller transaction lifecycle — offers, reservations, payment method setup, and fee calculation — from first contact through completed sale.

Location: `features/transactions/`

## Responsibility
Handles everything between a buyer expressing interest and a completed transaction: making/accepting/cancelling/declining offers and reservations, gating the flow behind a connected Stripe payment method, computing platform fees, and presenting both sides of a transaction (purchases tab vs. sales tab). Also exposes a test hub for QA.

## Route & Entry Point

All routes are `@Serializable` data classes registered via `NavGraphBuilder` extension functions:

| Route object | Entry function | Purpose |
|---|---|---|
| `TransactionsListRoute` (object) | `transactionsListRoute()` | Purchases / Sales tab list |
| `TransactionDetailsRoute(transactionId)` | `transactionDetailsRoute()` | Read-only transaction detail |
| `TransactionFlowRoute(itemId, type)` | `transactionFlowRoute()` | Buyer-side offer or reservation flow |
| `ReviewTransactionRoute(transactionId, type)` | `reviewTransactionRoute()` | Seller-side accept/decline |

`type` is a plain `String`: `"offer"` or `"reservation"`.

ViewModels are obtained from `TransactionsComponent` via `DiProvider.getComponent(TransactionsComponent::class)`.

## Key Types

**Domain models** (`domain/model/TransactionDomainModels.kt`):
- `TransactionSummary` — list-level view; holds `TransactionType`, `TransactionStatus`, buyer/seller IDs, agreed price, fees.
- `TransactionDetails` — full detail; adds `offerId?`, `reservationId?`, embedded `OfferSummary?` / `ReservationSummary?`.
- `OfferSummary` — offer snapshot with `offerPrice`, `listPrice`, `OfferStatus`, optional `expiresAt`.
- `ReservationSummary` — reservation snapshot with `agreedPrice`, `reservationFee`, `ReservationStatus`.
- `PaymentMethodInfo` — Stripe card details (`brand`, `last4`, `expMonth/Year`, `isDefault`).
- `PaymentSession` — Stripe checkout session (`url`, `sessionId`) for adding a card.
- `FeeBreakdown` — computed fee envelope: `itemPrice`, `platformFee`, `cardSurcharge`, `total`.
- `AcceptResult` / `CreateResult` — action response wrappers.
- `PaginatedTransactions` — paginated `TransactionSummary` list with `page`, `totalPages`, `hasNext`.
- `TransactionRole` enum — `Buyer` / `Seller`.

**UI state enums** (`TransactionFlowType`, `TransactionFlowStep`):
- `TransactionFlowType`: `Offer`, `Reservation`
- `TransactionFlowStep`: `ConnectAccount` → `OfferForm` / `ReservationSummary` → `Success`

**Tabs**: `TransactionsTab` enum — `Purchases`, `Sales`.
**Review type**: `ReviewTransactionType` enum — `Offer`, `Reservation`.

## Architecture

Clean Architecture layered inside a self-contained `TransactionsComponent` (manual DI, no Hilt/Koin):

```
UI (Composable screens + ViewModels)
    ↓ use cases
Domain (use cases, repository interfaces, domain models)
    ↓ implementations
Data (repository impls → generated API clients)
```

**Component** (`TransactionsComponent`): owns all lazy-initialised API clients, repositories, use cases, and ViewModels. Retrieved from `DiProvider` at the call site of each `NavGraphBuilder` extension.

**ViewModels** (all extend `core.ui.ViewModel<S>`):
- `TransactionsListViewModel` — loads purchases + sales in parallel; supports tab switching and pagination via `loadMore()`.
- `TransactionFlowViewModel` — multi-step buyer flow; holds `TransactionFlowUiState.Active` with step, item, payment method, fee breakdown, and submission state.
- `TransactionDetailsViewModel` — loads a single `TransactionDetails`; derives `TransactionRole` by comparing `buyerId` to `currentUserId`.
- `ReviewTransactionViewModel` — seller-side accept/decline; loads offer or reservation by ID, delegates to `AcceptOfferUseCase` / `DeclineOfferUseCase` (or reservation equivalents).

## Data Flow

**Buyer — make offer:**
1. `TransactionFlowRoute(itemId, "offer")` → `TransactionFlowViewModel.initialize()`
2. Fetches item via `MarketplaceApi.marketplaceItemsIdGet()`
3. `GetDefaultPaymentMethodUseCase` → if no card: step = `ConnectAccount`; if card present: step = `OfferForm`
4. User enters price → `updateOfferPrice()` → `CalculateFeeUseCase` recomputes `FeeBreakdown` live
5. `submitOffer()` → `MakeOfferUseCase` → `OfferRepositoryImpl.createOffer()` → `OffersApi`
6. On success: step = `Success`; `TransactionSuccessScreen` shown

**Buyer — create reservation:**
Same gate check; step jumps to `ReservationSummary`; `submitReservation()` → `CreateReservationUseCase` → `ReservationsApi`

**Seller — review:**
`ReviewTransactionRoute(id, "offer"|"reservation")` → `ReviewTransactionViewModel.loadOffer/loadReservation()` → `accept()` / `decline()` → respective use case → API

**List view:**
`GetTransactionsUseCase(page, role="buyer")` and `role="seller"` fetched in sequence; paginated append via `loadMore()`.

## Dependencies

**Internal API clients** (all `com.revivle.api.client.apis`):
- `OffersApi`, `ReservationsApi`, `TransactionsApi`, `PaymentMethodsApi`, `MarketplaceApi`

**External/shared:**
- `core.ui.ViewModel` — base ViewModel with `uiState: StateFlow<S>` and `analyticsManager`
- `core.data.analytics.AnalyticsManager` — sourced from `AnalyticsModule` via `DiProvider`
- `core.data.datasource.remote.LoggingHttpClient` / `AuthTokenProvider` — authenticated Ktor client
- `core.config.Configuration.myClosetApiBaseUrl` — base URL

**Fee formula** (inline in `CalculateFeeUseCase`, mirrors backend `PaymentUtils`):
```
platformFee = max(price × 0.05, 1.00)
cardSurcharge = 0.30 + (platformFee × 0.029)   // only when isCardPayment = true
total = price + platformFee + cardSurcharge
```

## Known Issues / Drift

- `TransactionDetailsScreen` passes `currentUserId = ""` hardcoded — role derivation (`Buyer`/`Seller`) is always wrong until real auth ID is threaded through (`// TODO: Pass actual current user ID from auth`).
- `TransactionFlowViewModel.getPaymentSessionUrl()` always returns `null`; `CreatePaymentSessionUseCase` is wired in the component but never called in the flow — the WebView payment-method connection path is unimplemented.
- `ReviewTransactionViewModel` directly injects `OfferRepository` / `ReservationRepository` (bypasses use cases for the `getOffer` / `getReservation` reads) — inconsistent with the rest of the feature.
- `CancelOfferUseCase` and `CancelReservationUseCase` exist and are wired in the component but have no screen-level call site yet.

## See Also

- `features/marketplace` — item listings that link into `TransactionFlowRoute`
- `features/mycloset` — seller's closet; "review offer" deep-link lands on `ReviewTransactionRoute`
- `core/ui/ViewModel.kt` — base ViewModel contract
- `.wiki/apps/demo3/features/marketplace.md`
- `.wiki/apps/demo3/features/mycloset.md`

_Last updated: 2026-07-04 — All six UI screens refactored to extract oversized `@Composable` functions into private sub-composables: `ReviewTransactionScreen` extracts `TransactionItemCard` + `TransactionBuyerCard`; `TransactionDetailsScreen` extracts `TransactionDetailsContent` sub-composables; `TransactionFlowScreen` extracts `TransactionFlowStepContent` and replaces raw `Scaffold` with `AppScaffold`; `TransactionSuccessScreen` extracts inline content blocks; `TransactionsListScreen` extracts per-tab content; `TransactionsTestHubScreen` extracts `LiveScreensSection` + `StaticPreviewsSection`. Architecture and data flow unchanged._
