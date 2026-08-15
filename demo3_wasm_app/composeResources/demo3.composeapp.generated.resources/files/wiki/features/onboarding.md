---
type: feature
title: Onboarding
description: Guides new users through a 3-step introductory walkthrough before entering
  the main app.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/onboarding/]
tags: [demo3, feature, onboarding]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Onboarding

## Purpose
Guides new users through a 3-step introductory walkthrough before entering the main app.

Location: `features/onboarding/`

## Responsibility
**Owns:** Displaying onboarding steps (3 screens), auto-advance timer, skip/next navigation, completing onboarding via API, checking onboarding status.

**Does NOT own:** User authentication, main app navigation setup, splash screen logic.

## Route & Entry Point
```kotlin
const val ONBOARDING_ROUTE = "onboarding"

fun NavController.navigateToOnboarding()  // pops to root, inclusive

fun NavGraphBuilder.onboardingScreenRoute(
    onNavigateToCloset: () -> Unit
)
```
Uses string-based route (`"onboarding"`) rather than `@Serializable` object. ViewModel obtained via `DiProvider.getComponent(OnboardingComponent::class).onboardingViewModel`.

## Key Types
| Type | Description |
|------|-------------|
| `OnboardingComponent` | DI component with `useMocks` flag for toggling real vs. mock implementations |
| `OnboardingViewModel` | Core `ViewModel<OnboardingUiState>` -- step navigation, auto-advance, completion |
| `OnboardingUiState` | State: currentStep, isCompleting, error, autoAdvanceEnabled; computed: isLastStep, stepNumber, totalSteps |
| `OnboardingEvent` | Sealed class for one-time events: `NavigateToCloset`, `ShowError` |
| `OnboardingStep` | Enum: STEP_1, STEP_2, STEP_3 with stepNumber and `fromNumber()` factory |
| `OnboardingContent` | Static content registry mapping steps to title/description/image keys |
| `OnboardingResult` | Sealed class: `Success` / `Error(message)` for completion API response |
| `CompleteOnboardingUseCase` | Interface + `Impl` + `Mock` -- the mock use case pattern |
| `GetOnboardingStatusUseCase` | Interface + `Impl` + `Mock` -- fetches onboarding status from API |

## Architecture
**Layers:** `domain/model` + `domain/usecase`, `ui` (screen, ViewModel, components, events, state). No `data` layer -- use cases call the generated API directly.

**DI:** `OnboardingComponent` takes a `useMocks: Boolean` constructor parameter. When true, wires `MockCompleteOnboardingUseCase` and `MockGetOnboardingStatusUseCase` (simulated delays, hardcoded responses). When false, uses `*Impl` classes that call `OnboardingApi`.

**Notable patterns:**
- **Mock use case pattern:** Each use case is an `interface` with a real `*Impl` class and a `Mock*` class. This enables rapid UI development without a backend.
- **Auto-advance timer:** 7-second delay per step, auto-advances to next step. Cancels on manual navigation or completion. Toggleable via `setAutoAdvanceEnabled()`.
- **One-time events via SharedFlow:** `OnboardingEvent` emitted through `MutableSharedFlow` for navigation and error snackbar display.
- **Custom auth plugin:** Creates a `createClientPlugin("RevivleOnboarding")` for auth headers instead of using `LoggingHttpClient.createAuthenticated()`.

## Data Flow
1. Screen displays `OnboardingStepLayout` for current step with title, description, image.
2. Auto-advance timer fires every 7 seconds, advancing to next step.
3. User can tap "Next" or dot indicators to navigate manually.
4. On final step, "Get Started" triggers `completeOnboarding()` which calls the API.
5. On success, `OnboardingEvent.NavigateToCloset` is emitted; screen collects and navigates.
6. On error, `OnboardingEvent.ShowError` triggers a snackbar.

## Dependencies
- **Core:** `ViewModel<T>`, `DiProvider`, `Configuration`, `AnalyticsManager`, `Log`.
- **Generated API:** `com.revivle.api.client.apis.OnboardingApi`.
- **HTTP:** Uses `LoggingHttpClient.create(revivleAuth)` with custom client plugin (not `createAuthenticated`).
- **No cross-feature imports.**

## Known Issues / Drift
- **String-based route:** Uses `const val ONBOARDING_ROUTE = "onboarding"` instead of a `@Serializable` route object. All other features use type-safe serializable routes.
- **Custom auth plugin:** Creates its own `createClientPlugin("RevivleOnboarding")` and uses `LoggingHttpClient.create(plugin)` instead of the standard `LoggingHttpClient.createAuthenticated(tokenProvider)` used everywhere else.
- **No repository layer:** Use case implementations call `OnboardingApi` directly, skipping both DataSource and Repository layers. Acceptable for a simple feature, but deviates from the layered convention.
- **OnboardingEvent uses sealed class:** Convention prefers `sealed interface` for event/state hierarchies.
- **OnboardingResult uses sealed class:** Same as above -- should be `sealed interface`.
- Uses core `ViewModel<T>` and `DiProvider` correctly. No cross-feature imports.

## See Also
- [notifications](notifications.md) -- similarly self-contained feature
- [Core Architecture](../core.md)

_Last updated: 2026-04-22_
