---
type: feature
title: GraphQL Example
description: Cursor-paginated SpaceX launch list that demonstrates Apollo GraphQL
  queries and the shared PagingCursorViewModel infrastructure against a NASA/SpaceX
  GraphQL endpoint.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/graphqlexample/]
tags: [demo3, feature, graphqlexample]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# GraphQL Example

## Purpose
Cursor-paginated SpaceX launch list that demonstrates Apollo GraphQL queries and the shared
`PagingCursorViewModel` infrastructure against a NASA/SpaceX GraphQL endpoint.

Location: `features/graphqlexample/`

## Responsibility

Queries a GraphQL API for a list of rocket launches using Apollo Kotlin, pages through results
using a cursor returned by the server, and renders each launch as a `ListItem` with mission patch,
name, and launch site. A `ConfigurationDisplay` card at the top of the screen shows the live
Apollo HTTP and WebSocket endpoint URLs from `Configuration`.

## Route & Entry Point

Registered via `NavGraphBuilder.graphQlTestScreenRoute()` in `GraphQlTestScreen.kt`. The route
object is the serializable singleton `GraphQL`.

```kotlin
// Register
NavGraphBuilder.graphQlTestScreenRoute(contentPadding = innerPadding)

// Navigate
navController.navigateToGraphQlTestScreen()
```

The composable creates a `GraphQlTestScreenViewModel` via `viewModel { ... }` (no DI component;
repository is constructed inline).

## Key Types

| Class | Role |
|---|---|
| `GraphQlTestModel` | Domain model: `launchId`, `site`, `missionName`, `missionPatchUrl` |
| `GraphQLTestRepository` | `PagingCursorRepository<GraphQlTestModel>` — executes `LaunchListQuery` via Apollo |
| `GraphQlTestScreenViewModel` | Extends `PagingCursorViewModel<GraphQlTestModel>`; holds cursor paging state |
| `GraphQlTestScreen.kt` | Composable UI; `LaunchList` wraps `PagingList`; `LaunchItem` renders each row; `ConfigurationDisplay` shows endpoint config |
| `LaunchListQuery` (generated) | Apollo-generated query class from the `.graphql` schema file |

## Architecture

Two-layer structure (no explicit domain/use-case layer):

```
GraphQlTestScreen (Compose)
    └── GraphQlTestScreenViewModel : PagingCursorViewModel<GraphQlTestModel>
            └── GraphQLTestRepository : PagingCursorRepository<GraphQlTestModel>
                    └── Apollo ApolloClient (via getApolloClient())
                            └── LaunchListQuery (Apollo generated)
```

`GraphQlTestScreenViewModel` is a one-liner that simply passes `GraphQLTestRepository()` to the
superclass. All paging logic (cursor tracking, `hasMore`, list accumulation) lives in
`PagingCursorViewModel`.

## Data Flow

1. `PagingList` composable triggers `viewModel.loadMore(cursor)` when the user nears the end of
   the list.
2. `GraphQlTestScreenViewModel` delegates to `GraphQLTestRepository.getMore(cursor)`.
3. Repository calls `getApolloClient()` to obtain a configured `ApolloClient`, then executes
   `LaunchListQuery` synchronously on `Dispatchers.Default`.
4. The response `launches` object contains:
   - `launches` — nullable list of launch fragments
   - `hasMore` — Boolean
   - `cursor` — opaque String cursor for the next page
5. Each non-null `LaunchListQuery.Launch` is mapped to `GraphQlTestModel` via
   `Launch.mapToGraphQlTestModel()` (private extension function in the repository file).
6. A `Page<GraphQlTestModel>` is emitted with `cursor` set to the response cursor.
7. `PagingCursorViewModel` stores the new cursor and appends items; triggers recomposition.
8. `LaunchItem` renders each model with `AsyncImage` (Coil) for the mission patch.

On any exception, the repository emits an empty `Page` with `hasMore = false`.

## Dependencies

- `core/ui/paging` — `PagingCursorViewModel`, `PagingCursorRepository`, `Page`, `PagingList`
- `core/data/datasource/remote/nasa` — `getApolloClient()` factory
- `core/config` — `Configuration.apolloGraphQLEndpoint`, `Configuration.apolloWebSocketEndpoint`
- Apollo Kotlin runtime — `ApolloClient`, query execution
- `graphql/LaunchListQuery` (generated Apollo source)
- Coil 3 (`coil3.compose.AsyncImage`) — async mission patch images

## Known Issues / Drift

- `getApolloClient()` is called on every `getMore()` invocation, creating a new `ApolloClient`
  instance per page load. The client should be a singleton or at least cached for the lifetime of
  the repository.
- The feature is named `graphqlexample` and uses SpaceX launch data routed through a NASA APOD
  client factory (`core/data/datasource/remote/nasa`). The naming is inconsistent with the actual
  data domain.
- No WebSocket / subscription logic is wired despite `Configuration.apolloWebSocketEndpoint` being
  displayed — subscriptions mentioned in feature notes are not yet implemented.
- There is no error state surfaced to the UI; a failed query silently produces an empty list with
  no retry affordance.
- `GraphQlTestModel.launchId` is typed as `String` but the Apollo schema field `id` is nullable;
  a forced non-null cast could crash if the server ever omits the id.

## Tests

`commonTest` coverage added in #375:

| File | What it tests |
|------|---------------|
| `GraphQLTestRepositoryTest.kt` | Repository-level query/paging behaviour. |
| `GraphQlTestScreenViewModelTest.kt` | ViewModel paging state transitions. |

## See Also

- `features/gallery/` — sibling page-number paging demo using `PagingPageViewModel`
- `core/ui/paging/PagingCursorViewModel.kt` — base class with cursor logic
- `core/data/datasource/remote/nasa/` — Apollo client factory (`getApolloClient`)
- `graphql/` (generated sources) — `LaunchListQuery` and schema definitions

_Last updated: 2026-05-04_
