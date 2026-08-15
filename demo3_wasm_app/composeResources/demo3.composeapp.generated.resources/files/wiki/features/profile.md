---
type: feature
title: Profile
description: Displays the signed-in user's account information and provides a confirmed
  sign-out flow.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/profile/]
tags: [demo3, feature, profile]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Profile

## Purpose
Displays the signed-in user's account information and provides a confirmed sign-out flow.

Location: `features/profile/`

## Responsibility

Fetches the current user from the Revivle backend, renders username and email, and handles the full sign-out lifecycle — including a blocking confirmation dialog, in-progress spinner state, session-token clearing, and post-sign-out navigation to the splash screen. This is a Revivle-specific feature (the component integrates `RevivleProfileRepository` alongside the local `ProfileRepository`).

## Route & Entry Point

- **Route object:** `Profile` (a `@Serializable object`, defined in `ProfileScreen.kt`)
- **Registration helper:** `NavGraphBuilder.profileScreenRoute(navigateToSplash, contentPadding)`
- `profileScreenRoute` reads `ProfileComponent` from `DiProvider` to obtain `profileScreenViewModel`.
- `LaunchedEffect(Unit)` inside the route calls `viewModel.loadUserProfile()` on first composition.
- After successful sign-out, `LaunchedEffect(state.isUserSignedOut)` fires `navigateToSplash()` and `viewModel.resetState()`.

## Key Types

| Type | Role |
|---|---|
| `ProfileComponent` | DI container; lazily constructs all dependencies scoped to this feature |
| `ProfileScreenViewModel` | Owns `ProfileState`; drives load, dialog, and sign-out logic |
| `ProfileState` | Data class: `user`, `isLoading`, `error`, `showSignOutDialog`, `isSigningOut`, `isUserSignedOut` |
| `User` | Domain model: `id`, `username`, `email?`, `displayName?` |
| `ProfileRepository` | Interface: `getCurrentUser()` and `signOut()` |
| `ProfileRepositoryImpl` | Delegates to `UserRemoteDataSource`; clears `TokenLocalDataSource` on sign-out |
| `RevivleProfileRepository` | Eagerly fetches `GET /auth/me` on first access; result cached and shared |
| `SignOutConfirmationDialog` | Composable dialog with Cancel / Confirm (destructive) buttons; disables both during `isLoading` |

## Architecture

```
ui/
  ProfileScreen.kt          composable + profileScreenRoute nav function
  ProfileScreenViewModel.kt extends ViewModel<ProfileState>
  components/
    UserProfileContent.kt     top-level content composable (modifier-accepting)
      └── UserInfoCard.kt     private sub-composable for the user info Card
      └── SignOutButton.kt    private sub-composable for the sign-out button/spinner
    SignOutConfirmationDialog.kt
domain/model/
  User.kt
  ProfileState.kt
domain/repository/
  ProfileRepository.kt      interface
data/
  ProfileRepositoryImpl.kt  UserRemoteDataSource + TokenLocalDataSource
ProfileComponent.kt         DI container
```

`UserProfileContent` accepts an optional `modifier` parameter (default `Modifier`) and delegates to two private sub-composables: `UserInfoCard` (the surfaceVariant card showing username and email) and `SignOutButton` (the destructive button/spinner). Previews use `@ThemePreviews` from `core/ui/components`.

`ProfileScreenViewModel` extends `ViewModel<ProfileState>` with `analyticsManager = null` (intentional — avoids leaking analytics keys for profile events). It maintains its own `CoroutineScope(SupervisorJob() + Dispatchers.Main)`.

## Data Flow

1. `profileScreenRoute` triggers `viewModel.loadUserProfile()` via `LaunchedEffect`.
2. ViewModel sets `isLoading = true`, calls `profileRepository.getCurrentUser()`.
3. `ProfileRepositoryImpl` calls `userRemoteDataSource.getCurrentUser()`, maps `UserData → User`, returns `Result<User>`.
4. Success → `ProfileState(user = user, isLoading = false)`. Failure → `ErrorHandler.handleException()` fills `error`.
5. User taps "Sign out" → `showSignOutDialog = true` → `SignOutConfirmationDialog` renders.
6. User confirms → `showSignOutDialog = false`, `isSigningOut = true` → `profileRepository.signOut()`.
7. `ProfileRepositoryImpl.signOut()` calls `userRemoteDataSource.signOut()` then `localDataSource.clearSessionToken()`.
8. Success → `isSigningOut = false`, `user = null`, `isUserSignedOut = true` → 3-second delay → `onSignOutSuccess()` callback fires → navigation to splash.

## Dependencies

- `UserRemoteDataSource` / `UserRemoteDataSourceFactory` — platform-specific remote user data
- `TokenLocalDataSource` (from `DataSourceModule`) — session token clearing
- `RevivleProfileRepositoryImpl` + `AuthenticationApi` — secondary profile fetch (`GET /auth/me`)
- `LoggingHttpClient.createAuthenticated(tokenProvider)` — authenticated Ktor client
- `core/domain/model/ErrorHandler` — exception-to-`Error` mapping
- `core/ui/components/` — `BaseDestructiveButton`, `ComposeDialog`, `SecondaryButton`, typography components, `LoadingMessage` (loading state), `ErrorCard` (error state — both standardized in #544)
- `Configuration.myClosetApiBaseUrl`

## Known Issues / Drift

- `confirmSignOut()` includes a hard-coded `delay(3000)` before invoking `onSignOutSuccess`. This means the UI stays in the "signed out" state for 3 seconds before navigating — no visible feedback distinguishes this delay from a hang. The comment in code says the `LaunchedEffect(isUserSignedOut)` in the screen is a "fallback" if the callback doesn't fire; both paths exist simultaneously.
- `ProfileComponent` eagerly constructs `revivleProfileRepository` (which fires `GET /auth/me`) on first access, but the `ProfileScreenViewModel` does not use `revivleProfileRepository` — it uses `profileRepository` backed by `UserRemoteDataSource`. The two paths may return different user data shapes; no reconciliation is done.
- Analytics is explicitly disabled (`analyticsManager = null`) in `ProfileScreenViewModel`. Sign-out is a high-signal event; consider whether this is intentional policy or an oversight.

## Tests

`commonTest` suite added in #408 and #415, extended in #521 and #555:

| File | What it tests |
|------|---------------|
| `data/FakeTokenLocalDataSource.kt` | In-memory token storage stub. |
| `data/FakeUserRemoteDataSource.kt` | Stub remote user data source. |
| `data/ProfileRepositoryImplTest.kt` | Repository: fetch user, token caching, sign-out token clearing; edge cases for concurrent sign-out and token expiry added in #555. |
| `domain/repository/FakeProfileRepository.kt` | In-memory profile repository for ViewModel tests. |
| `ui/ProfileScreenViewModelTest.kt` | ViewModel: load profile, sign-out flow (including the 3-second delay path), error handling; edge cases for re-entrant sign-out and network error recovery added in #555. |
| `ProfileComponentTest.kt` | Component wiring smoke test — verifies `ProfileComponent` resolves its ViewModel and repository without error (#521). |

## See Also

- `features/push/` — `PushTokenComponent.unregisterTokenOnLogout()` should be called alongside sign-out
- `core/data/datasource/local/TokenLocalDataSource` — session token management
- `core/data/repository/RevivleProfileRepositoryImpl`
- `.wiki/apps/demo3/features/push.md`

_Last updated: 2026-06-28 — `UserProfileContent` refactored: extracted private `UserInfoCard` and `SignOutButton` sub-composables to fix oversized composable lint; added `modifier: Modifier = Modifier` parameter; switched previews from `@Preview` to `@ThemePreviews`._
