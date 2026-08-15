---
type: feature
title: Coding Session
description: 'AI Coding Session: end-to-end ticket → agent worktree → APK → merge flow
  against a connected desktop server, orchestrated server-side with a mobile client UI.'
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/codingsession/,
  Applications/Demo3/composeApp/src/desktopMain/kotlin/com/otiasj/features/desktopserver/codingsession/,
  Applications/Demo3/docs/features/AiCodingSession_TRD.md]
tags: [demo3, feature, codingsession, kobote, desktop-server]
timestamp: '2026-07-15T00:00:00Z'
category: feature
---

# Coding Session

## Purpose

Drives an end-to-end, ticket-to-APK coding session against a connected desktop server:
pick a Linear ticket → the desktop creates an isolated git worktree and runs a Kobote
agent session in it → the user chats/iterates → gradle builds the APK into the OTA
folder → PR merge + worktree removal + Linear ticket → Done.

Location: `features/codingsession/` (commonMain client) +
`desktopMain/features/desktopserver/codingsession/` (server orchestration).
Spec: [`AiCodingSession_TRD.md`](../../../../Applications/Demo3/docs/features/AiCodingSession_TRD.md);
task tracker: `AiCodingSession_tasks.md`.

## Route & Entry Point

```kotlin
@Serializable
data class CodingSessionRoute(
    val peerId: String,      // Tailscale peer id of the desktop
    val address: String,     // ip:port captured at navigation time
    val projectPath: String, // IDE project on the desktop
    val sessionId: String? = null, // null = new-session flow, non-null = resume
)

fun NavGraphBuilder.codingSessionRoute(onNavigateBack, contentPadding)
```

Entry points (both on the Server Detail screen's project card, wired through
`TailscalePlugin.homeRoutes` → `tailscaleRoute(onStartAiSession/onResumeAiSession)`):

- **"Start AI Session" button** on `GitProjectCard` → new-session flow.
- **`ActiveCodingSessionsSection`** (per-project active-sessions list, injected via the
  `projectExtraContent` slot on `GitProjectCard`/`GitProjectsSection`) → resume. With
  parallel sessions this is the primary way back into a session.

## Phases (state machine)

```
CREATING_WORKTREE → CODING → BUILDING → APK_READY → MERGING → DONE
        │              ▲         │           │          │
        │              └── feedback loop ────┘          │
        └──────────────── FAILED ───────────────────────┘
```

- `CODING → BUILDING` is user-triggered (Build APK button) or automatic when the
  per-session `autoBuild` toggle is on and the agent's run completes. Merge is **never**
  auto-triggered.
- **Feedback loop**: the chat stays open through CODING/BUILDING/APK_READY. A user message
  during BUILDING/APK_READY resets the phase to CODING; the current build is superseded
  (kept as `lastBuild`), queued builds are skipped, and in-flight results are discarded
  (semantic cancellation — a running gradle process finishes but its result is thrown away).
- Build failure returns to CODING with the failed build kept (log tail + retry).
- Merge failure restores the pre-merge phase with the error surfaced; an already-created PR
  is kept in `prUrl` so retry skips creation. The worktree is preserved.

## Desktop server (`/api/codingsession`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/codingsession` | `CreateCodingSessionRequest` → worktree (branch deduped `-2`/`-3`), Kobote session with `sources/local/{worktree}`, Linear `markInProgress` + `attachSession`. |
| `GET` | `/api/codingsession?projectPath=…` | List sessions (powers the project-card list). |
| `GET` | `/api/codingsession/{id}` | Full `CodingSessionState`; client polls at 5 s. |
| `POST` | `/api/codingsession/{id}/build` | Async build (serial queue per desktop; gradle is RAM-hungry). |
| `POST` | `/api/codingsession/{id}/merge` | Commit-if-dirty → push → PR create/reuse → merge → worktree remove → Linear `markDone` → DONE. |
| `PATCH` | `/api/codingsession/{id}` | `{ autoBuild }` toggle, flippable mid-session. |
| `DELETE` | `/api/codingsession/{id}` | Abandon: cancel agent, force-remove worktree, FAILED. |

### Key pieces (desktopMain)

| File | Role |
|---|---|
| `CodingSessionOrchestrator.kt` | In-memory state machine (v1). Worktree creation via injectable git runner (`ShellRunner`), branch dedupe, serial build queue (`Channel` + one worker), feedback-loop reset via in-process `KoboteAgentService` hooks, Linear side effects (lazy `LinearIssueTracker`, non-fatal). Testable via `CodingAgentGateway`, `SessionBuildRunner`, `MergeGateway` fakes. |
| `CodingSessionRouter.kt` | `DesktopServerRouter` impl serving the table above. |
| `BuildRunner.kt` | Runs `assembleDebug` + `copyToOtaFolder` in the worktree (versionName/versionCode computed by the worktree's own gradle), renames the APK to the session convention, copies it into `OtaRepository.selectedFolder`, `refreshApks()`. |
| `GitHubMergeGateway.kt` | PR creation via raw GitHub REST + merge via `GitHubAPI.mergePullRequest`. `parseGitHubRemote` / `parsePrNumber` helpers. |

### Kobote local sources

`KoboteAgentService` now accepts `sources/local/{absolute-path}` (`parseLocalSource`):
the agent works directly in the caller-owned directory (never deleted by
`deleteSession` — guarded by `ownsWorkingDir`), skips cloning and PR creation, and a
message on a finished session **restarts the loop** (`resumeSession`) so the coding-session
feedback cycle works. The orchestrator observes user messages and state changes through
`onUserMessage` / `onSessionStateChanged` hooks (same JVM, no new endpoints). Per-session
engine override supports model selection (`KoboteAgentClient(model = …)` via `modelId`).

## APK naming

`<app>-<versionName>-<ticket>-b<n>-<versionCode>.apk`, e.g.
`demo3-1.4.2-ENG-42-b3-10402.apk` — 3rd build of the ENG-42 session. Defined/parsed by
`SessionApkName.kt` (commonMain). All APKs are kept; the name distinguishes sessions and
iterations. `OtaRepository.parseApkInfo` understands the format, and `OtaVersionItemRow`
renders ticket + build chips for session APKs.

## Client (commonMain)

Canonical clean-architecture slice: `CodingSessionApi` (plain Ktor over `LoggingHttpClient`,
address per call) → `CodingSessionRepositoryImpl` → use cases (`StartCodingSession`,
`GetCodingSession`, `ListCodingSessions`, `TriggerBuild`, `UpdateCodingSession`,
`MergeAndClose`) → `CodingSessionViewModel` (extends core `ViewModel<T>`, 5 s phase polling
while the session is live).

`CodingSessionUiState`: `Loading` / `Content(projectPath, session?, pickedTicket?,
branchName, baseRef, isStarting)` / `Error`. The new-session flow progresses inside
`Content`: no ticket → `TicketPickerPane`; ticket → `SessionCreationForm`; session →
`ActiveSessionContent`.

### UI components (`ui/components/`)

- `TicketPickerPane` — embeds the linear feature's `FilterRow` + `IssueListContent` slot API
  with a picker `onIssueClick`; own `LinearViewModel` instance.
- `SessionCreationForm` — picked-ticket card, branch-name preview (prefilled via
  `agentBranchName`: `agent/<identifier>-<slug>`, sanitised + word-boundary truncated),
  editable base ref, start button.
- `SessionStepper` — vertical Worktree/Code/Build/Ready/Merge progress.
- `SessionChatPane` — embeds `JulesSessionDetailContent` with a `JulesSessionViewModel`
  built over `KoboteRepository(KoboteApi.create("http://$address/"))`, pinned to the
  session's desktop regardless of the global coding-agent provider.
- `BuildCard` (queued/running/failed + log tail + retry), `ApkReadyCard` (filename +
  OTA-card hint), `MergeCloseCard` (merge confirmation, MERGING progress, DONE + PR link).
- `ActiveCodingSessionsSection` — per-project session list for the Server Detail card.

## Known deviations from the TRD

- **Agent backend**: the loop runs on the Claude-backed `KoboteAgentClient`; `backendId`/
  `modelId` are plumbed through the wire contract and `modelId` selects the Claude model
  per session, but routing through `DesktopLlmBackendRegistry`/`getAiChatClient()` was
  deferred (the desktop tool loop is scoped to workspace folders, not arbitrary worktrees).
  No backend/model picker in the creation form yet.
- **autoBuild at creation**: wire field exists; the form has no checkbox — the toggle is on
  the session screen immediately after creation.
- Linear `attachSession` uses a `demo3://codingsession/{id}` URL (no public session URL exists).

## Tests

| File | Coverage |
|---|---|
| `desktopTest/...codingsession/CodingSessionOrchestratorTest.kt` | Creation, dedupe, worktree failure, feedback reset, autoBuild hooks, abandon, parallel isolation, list filtering (11). |
| `desktopTest/...codingsession/CodingSessionBuildTest.kt` | Build success/failure/retry numbering, serial queue, feedback cancellation of queued builds, autoBuild (6). |
| `desktopTest/...codingsession/CodingSessionMergeTest.kt` | Merge happy path, clean-tree skip-commit, refused merge, PR reuse on retry, creation failure, wrong-phase guard (6). |
| `desktopTest/...codingsession/SessionApkFileNameTest.kt`, `GitHubRemoteParsingTest.kt` | Filename rewrite + remote/PR-URL parsing (7). |
| `desktopTest/...kobote/KoboteSourceParsingTest.kt` | `parseLocalSource` / `parseGitHubSource` incl. local-source guard (9). |
| `commonTest/...codingsession/ui/CodingSessionViewModelTest.kt` | Picker/form/start/poll/error transitions with fake repository (7). |
| `commonTest/...codingsession/domain/AgentBranchNameTest.kt`, `SessionApkNameTest.kt` | Branch slugging (7) + APK-name round-trip (3). |

## See Also

- [jules](jules.md) — session chat UI + Kobote wire contract this feature embeds.
- [linear](linear.md) — issue list slot API reused by the ticket picker.
- [../desktop-server.md](../desktop-server.md) — the Ktor server hosting the router.
- [tailscale] Server Detail screen — entry point + OTA Updates card where session APKs land.

_Last updated: 2026-07-15 — Initial page: M0–M4 implemented (skeleton, ticket picker, orchestrator + Kobote local sources, build → OTA, merge & close)._
