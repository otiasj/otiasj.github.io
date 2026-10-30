---
type: feature
title: Demo3 — Story Generator
description: AI-powered story writing with LM Studio backend, character/scene management, branching narratives, and multi-format export.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/]
tags: [demo3, feature, ai, story]
timestamp: '2026-10-25T02:15:00Z'
category: feature
last_commit: 00f20fb41f06915a61ce5583e2479ce8f64cb061
spec_status: locked
---

# Demo3 — Story Generator

## Purpose

AI-powered story writing tool that generates narrative content using local LLM backends (LM Studio, Ollama). Users define story parameters (genre, tone, length, perspective), populate a cast of characters, seed scenes with literary tropes, then generate and iteratively refine the narrative through branching, character development, and scene composition.

Package: `com.otiasj.features.storygenerator`
Path: `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/`

## Responsibility

Owns: story composition workflow (parameter setup, character/scene/trope curation), LLM backend integration (prompt building, streaming, response parsing), story state management (narrative tree, character radar, manuscript reader), export engine (text/markdown/PDF output per platform), and all related UI screens and components.

Does NOT own: LLM model training, multimodal vision features, or user authentication.

## Key Types

**Core models & ViewModel:** `StoryFormState`, `StoryParameters`, `StoryProject`, `NarrativeNode`, `ChapterItem`, `SceneItem`. **ViewModel & routing:** `StoryGeneratorViewModel`, `StoryGeneratorScreen`, `StoryGeneratorComponent` (DI). **UI state & screens:** `StoryGeneratorUiState` (sealed interface), `StoryGeneratorContent` (multi-pane layout). **Domain models:** `StoryGenre`, `StoryTone`, `NarrativePerspective`, `NarrativeTense`, `StoryLength`, `CharacterRole`, `CharacterItem`, `LiteraryTrope`, `TropeCategory`. **Prompting:** `StoryPromptBuilder` (assembles prompts, handles chapter/scene ordering), `PromptTemplates` / `PromptCatalog` (templated prompt text), `ResponseKeys` (response header tokens). **Export:** `StoryExportEngine` (Markdown export with YAML frontmatter, word count, metadata). **LLM integration:** `StoryLlmGateway` (interface), `LmStudioStoryService` (HTTP streaming), `StoryLlmDefaults` (endpoints). **Use cases:** `GenerateStoryUseCase`, `BranchChapterUseCase`, `RefineChapterUseCase`, `SuggestCharacterUseCase`, `FleshOutCharacterUseCase`, `SuggestSceneUseCase`, `FleshOutSceneUseCase`, `GenerateSceneUseCase`, `CheckConnectionUseCase`. **UI components:** `StoryCharacterCard`, `StoryCharacterRadar`, `StoryCharactersSection`, `StoryCoreParamsSection`, `StoryExportDialog`, `StoryPromptInspectorDialog`, `StoryManuscriptReaderPane`, `StoryOutlinePane`, `StoryBranchDialog`, `StoryRefineDialog`, `StoryNodeEditDialog`, `StorySceneCard`, `StoryScenesSection`, `PromptSectionView`.

## Dependencies

- **Internal**: `core/` (ViewModel, DiProvider, analytics), `screens/` (AppScaffold), `platform/` (file I/O for export), string resources.
- **External**: Ktor Client (HTTP to LM Studio), Kotlinx Serialization (JSON parsing), Kotlin Flow (state management), Compose Foundation.

## Data Flow

```
User interaction (form input)
     │
     ▼
StoryGeneratorViewModel.generateStory()
     │
     ├─ validate form state
     │
     ├─ invoke GenerateStoryUseCase(formState)
     │       │
     │       ▼
     │   StoryLlmGateway.generateStory(prompt)
     │       │
     │       ├─ build prompt (StoryPromptBuilder)
     │       │
     │       ▼
     │   LmStudioStoryService.generateStory() [HTTP POST]
     │       │
     │       ├─ stream response
     │       │
     │       ▼
     │   parse response (StoryResponseParser)
     │       │
     │       ▼
     │   emit story chunks to Flow
     │
     ├─ collect chunks; update state
     │
     ▼
StoryGeneratorUiState.Success(story, characters, scenes)
     │
     ▼
UI renders manuscript, narrative tree, outline
     │
     ├─ user selects branch/refine/export
     │
     └─ invoke corresponding use case
```

## Request Queue Integration

Every story LLM call goes through the app-wide `LlmRequestQueue` (see `Applications/Demo3/docs/llm_request_queue_plan.md`), so it shows in LLM settings -> Requests.

- **Foreground vs Background:** user actions (generate story/chapter/scene, refine, branch, flesh out, suggest character/scene, Play turns) are Foreground jobs; brainstorm fills (`BrainstormSuggestionsUseCase.fill`) are Background jobs with coalesce key `storygenerator.brainstorm.<Group>`. Labels come from `strings_story_generator.xml` (`story_job_*`) through `StoryJobLabels.current`, which the screen sets (English defaults pinned equal by `StoryUiStringsTest`).
- **Dispatch-time prompt:** `StoryLlmGateway.sendQueued(config, job, accept, build)` calls `build` when the job leaves the queue; the `StoryPrompt.context` (the `SuggestionContextKey` the prompt answers) comes back on the `StoryCompletion`. The 120 s `SUGGESTION_CALL_TIMEOUT_MS` deadline starts at dispatch.
- **Context change:** a Queued fill is absorbed by a new request for the group (queue entry keeps its place, `updates++`); a Running fill is never cancelled: still-valid lists are kept, an all-stale result marks its entry `Superseded` and a refreshed fill is queued.
- **Lanes:** unified pipeline calls use the target's lane; `LmStudioStoryService` waits on `TargetRef(endpointUrl, "lm-studio")`.
- **Superseded / Foreground:** a Running fill finishes and its all-stale result is marked `Superseded`; Foreground user actions go ahead of waiting Background fills. The old 1-permit semaphore in `BrainstormSuggestionsUseCase` is gone.
- **Servers and models:** there is no story-specific LM Studio settings dialog (`StorySettingsDialog` / `StoryLmStudioSection` were deleted); servers and models are configured in the app-wide LLM settings dialog. `StoryLlmPolicy` sets `TargetOverlay(requireTextModel = true, …)`, so embedding models and image captioners are swapped for the runner's best text model (see `platform.md` § Model capabilities); this replaced the earlier vision-only family exclusion.

### Brainstorm fill resilience

- **Deadline:** 120 s (`SUGGESTION_CALL_TIMEOUT_MS`) counted from dispatch, not from enqueue; it is a `LlmJobSpec.deadline` enforced by `LlmRequestQueue` itself (it cancels and abandons the run, fails the log entry with the reason and throws a non-cancellation `LlmJobDeadlineException` to every caller; failover and the LM Studio fallback do not retry it), so it holds even when a client library swallows or rewraps the cancellation. A fill a pending reroll waits on is submitted Foreground (a still-queued fill is re-submitted to upgrade it); a running one is not preempted.
- **Backoff:** a failed group is held back per group, 15 s doubling to 120 s (`SUGGESTION_BACKOFF_INITIAL_MS` / `_MAX_MS`); it is dropped when the part of the form the group's prompt depends on changes, or a fill of the group succeeds.
- **Banner:** the "suggestions unavailable" banner shows the real failure reason; on an Android emulator the default endpoint is `http://10.0.2.2:1234/v1` (`StoryLlmDefaults.LM_STUDIO_EMULATOR_ENDPOINT`) and the banner names the endpoint actually configured.
- **Parser:** `StoryResponseParser` switches brainstorm section only on header-shaped lines, so list items containing a header word no longer split the section.
- **Cancellation:** `CancellationException` is rethrown by `LmStudioStoryService` and the catalog repositories instead of being turned into a failure.

## Suggest scene: tags, subtext and turn

`SuggestSceneUseCase` (given the form and `PromptCatalog`) uses `buildSuggestSceneTagsPrompt`: the beat as KEY: VALUE lines plus one JSON object `{tags, subtext, turn}`, with story context and the scene sections' `id = label` lists in the prompt. `SceneTagSuggestionParser` maps tags back to catalog ids (id or label, case-insensitive; unknown dropped; single sections 1, multi at most 3, total at most 8) and the subtext and turn land in `fieldValues` (`subtext`, `the_turn`); missing parts are asked once more (`buildCompleteSceneTagsPrompt`), else left blank. It only ever adds a new scene, so a user's scenes and tags are never modified. Opt-in live test: `STORY_SUGGEST_SCENE_LIVE=1 STORY_LIVE_MODEL=<id> ./gradlew :composeApp:desktopTest --tests "*SuggestSceneLiveTest*" --rerun`.

## Export & Persistence

**Markdown export (October 2026):** `StoryExportEngine.exportMarkdown()` generates RFC 822-style YAML frontmatter (title, date, word count, chapter count, genres, tones, tropes, character roster) followed by narrative node chapters. The engine intelligently selects content: if the narrative tree has prose, it uses tree nodes; if only chapters have prose, it flattens chapters and scenes into nodes for export. Supports configurable `ExportLabels` for internationalization.

## Recent Refactors

**UI State Cleanup (October 2026):** Removed orphaned `StoryGeneratorUiState.Editing` state variant and its associated editing workflows that had become dead code paths during multi-phase feature development. ViewModel now cleanly transitions between `Loading`, `Success`, and `Error` states only.

## Patterns & Decisions

**Chapter-based scene management:** `StoryFormState` now tracks `chapters: List<ChapterItem>` (in addition to flat `scenes`). The `StoryPromptBuilder` reconciles both: when chapters exist with scenes, it uses chapter-organized scenes for prompt generation; otherwise falls back to flat scenes. This allows users to manually organize narratives into chapters while still supporting the legacy flat-list UI for simple stories.

**Spec reconciliation (October 2026):** Story generator spec is locked to a post-sweep commit (`77a83fd84`) to establish a baseline for regression testing. Bug sweep pipeline (`BUG-SG-01..07`) is in place with verified fixes and corresponding test cases (`StoryGeneratorBugSweepVerificationTest`). Instrumented tests (`StoryGeneratorInstrumentedUiTest`, `StoryGeneratorEndToEndInstrumentedUiTest`) validate platform-specific rendering and end-to-end flows.

- **LLM Gateway abstraction** — `StoryLlmGateway` interface decouples UI from `LmStudioStoryService`; easy to swap backends (Ollama, Claude API) by implementing the interface.
- **Streaming response parsing** — long-running operations emit incremental updates via Flow; UI shows live progress. `StoryResponseParser` deserializes streamed JSON chunks.
- **Narrative tree state** — `StoryNode` represents each branch point; nodes form a DAG (directed acyclic graph) allowing branching and merging.
- **Character radar** — 6-axis hexagonal radial chart of dramatic personality traits (Agency, Moral Flexibility, Volatility, Social Warmth, Intellect, Vulnerability) for scene-level behavioral steering.
- **Prompt building** — `StoryPromptBuilder` constructs a detailed LLM prompt from form state, characters, scenes, and tropes; inspectable via `StoryPromptInspectorDialog` for debugging.
- **Multi-platform export** — `StoryExportEngine` + platform-specific `StoryFileWriter` actuals (Android, Desktop, iOS, Web) handle file I/O in the native way.
- **Sealed UiState** — `Loading`, `Success(formState, story, characters, scenes, tropes)`, `Error(message)`. Previews test all branches.
- **Composable recomposition** — callback lambdas passed to child composables are extracted to ViewModel methods (e.g., `viewModel::addNarrativeNode` instead of `{ title, choice, summary, fullText -> viewModel.addNarrativeNode(title, choice, summary, fullText) }`) to prevent recomposition overhead; handlers like `onDismissDialog` delegate to a single ViewModel method that atomically resets all dialog flags.

## Testing

- **Unit tests** (`domain/`, `data/`) cover form validation, use case error handling, streaming response parsing.
- **Golden snapshots** exist for major UI composables.
- **E2E smoke tests** (`LmStudioStoryE2ESmokeTest.kt`, Desktop-only) validate end-to-end story generation with a real LM Studio connection.
- **Daily E2E** (`desktopTest/.../e2e/StoryGeneratorDailyE2ETest.kt`, opt-in `STORYGEN_E2E=1`, driven by `Scripts/run_storygen_daily.py`) clicks through the real `StoryGeneratorContentConnected` against a real desktop server: login → server/LLM preflight → AI premise → random tags (scene_len_standard) → 5 AI characters → story spine → 3 chapters planned from spine beats → 15 scenes drafted via micro-arc segments → export, then Slacks `story.md`. LLM calls go through `UnifiedStoryLlmGateway` → `GenerateAiTextUseCase` → desktop server, with the localhost LM Studio fallback disabled.
- **Manual testing** on Desktop (via the embedded LM Studio launcher).
- **Scene state machine tests** verify transitions between OutlineOnly → Staged → Generating → Drafted → Revised states.

## Recent Changes (October 2026)

**Interactive Play (beat-based arc) — Fully integrated** — A choose-your-own-adventure entered from a scene (see the Recap section below; there is no standalone Play tab) whose structure lives in code. `domain/arc/` holds `ArcTemplate`/`BeatSpec` (roles SETUP → EARLY_QUEST → COMPLICATION… → CLIMAX → RESOLUTION), the pure `ArcDirector` (turn window per beat + LLM `BEAT_COMPLETE` hint, forced advance at `maxTurns`, so a run is bounded by Σ maxTurns) and `ArcTemplateValidator`. Five genre-neutral arcs (`quest`, `heist`, `investigation`, `escape`, `rescue`) live in `composeResources/files/story/arcs/*.json`, loaded by `data/arc/ArcTemplateRepository` (invalid → in-code Quest default). `StartPlayUseCase`/`PlayTurnUseCase` build `buildPlayTurnPrompt` (path digest + Setup `StoryFacts`), parse with `parsePlayTurnResponse` (no choices on RESOLUTION) and stamp `TurnTelemetry`. Play routes through `PlatformAiStoryGateway` (ordered `backendIds`, on-device first; when no resolved target answers it falls back to the direct LM Studio service at the story's `LmStudioConfig` endpoint as Story mode does, unless `backendIds` is on-device only, and the error names every attempt); Story mode keeps its gateway. UI: `ui/play/PlayViewModel` + stateless `PlayContent` (`PlayUiState` Loading/Recap/Success/Error). Node ids are now UUIDs (`NodeIds`). `PlayStoryContext` provides access to current story form/catalog during Play arc selection. `StoryGeneratorComponent` wires `playViewModel`, `playTurnUseCase`, and `playGateway`. Opt-in live test: `STORY_PLAY_LIVE=1 STORY_PLAY_MODEL=<id> ./gradlew :composeApp:desktopTest --tests "*LivePlaythroughTest*" --rerun`. Plan, results and findings: `.wiki/apps/demo3/features/storygenerator.md (consolidated from story_generator_interactive_play_plan.md)`.

**Interactive Play — scene-bound integration (audit 2026-10-21, completed)** — Plan and tracker: `Applications/Demo3/docs/story_generator_play_audit_plan.md`. The scene-bound Play feature is fully integrated:
- **Entry:** Play button next to "AI generate scene" in `SceneStagingPane` binds a run to that scene and replaces the staging pane with the run (back arrow returns to the scene; the run is kept). The recap is shown after pressing the button.
- **Prompt context:** Play uses the same story + scene injected prompts as scene generation (story header, premise, chapter, scene details, custom directives, previous-scene recap, scenography). Arc beat directive layered on top. Context is **snapshotted when the run starts** (P5: prevents mid-run form edits from changing prompts mid-run).
- **Save & export:** Finished run writes chapter prose to `SceneItem.prose` with `status = Drafted` (same as AI-generated scene). No separate Play storage. Normal story export handles it.
- **Flow control:** Start/Restart/Abandon/Retry all implemented. In-flight turn jobs cancelled on Restart to prevent late result mutations.
- **Defaults:** Automatic save on RESOLUTION beat. Confirmation dialog ("Replace existing prose?") shown when playing into an already-drafted scene. The arc comes from the scene's arc tag (see below).
- **Tests:** Desktop UI test `PlayFlowUiTest` (error → Start over → Recap → scene Drafted → export). Android instrumented test `StoryGeneratorPlayEntryScreenshotTest` compiled.
- **Remaining (step 12):** Forward `reasoningEffort` + model through `platform/ai` and `PlatformAiStoryGateway` (requires plumbing through `AiTextRequest`, `AiChatClient`, `NetworkAiChatClient`, desktop router, server). Until then, Play defaults `reasoningEffort` to `none` and telemetry reports the configured model name for non-on-device backends. Live gateway test pending.

**Interactive Play — recap, viewpoint, JSON actions, arc tag (2026-10-23)** — The first Play screen is a **Recap** (`PlayUiState.Recap`, built by `buildPlayRecap`) of exactly what the run injects: story header, premise, chapter/scene, scene tags, custom directives, previous-scene recap, scenography, cast on scene, viewpoint with its rule in plain words, and the arc; **Begin** starts the run from that snapshot. There is no arc picker: the arc is the single-select scene tag section `scene_arc` (`files/story/sections/scene_arc.json`, ids `scene_arc_<arcId>`), edited like any scene tag; no tag means the default Quest (the recap says so). The standalone Play chip/tab is gone; `StoryGeneratorContent` swaps the staging pane for the run (`playSceneId`). `PlayViewpoint.resolve` maps scene POV character → POV, `scene_vp_neutral`/`scene_vp_omniscient` tags, then story perspective (`third_omniscient` → omniscient, `first`/`third_limited` → POV of the protagonist on scene, else neutral). The prompt states the viewpoint and what it allows (neutral: actions for anyone, no thoughts; omniscient: actions and thoughts for anyone; POV: only that character) and asks, after the prose, for exactly one JSON object `{"actions":[{"actor","action","thought"}]}` with exactly 4 actions (none on RESOLUTION). `parsePlayTurnResponse` tolerates fences/chatter, drops thoughts for neutral, rejects off-viewpoint or off-scene actors, keeps the first 4; fewer than 4 valid ⇒ `PlayTurnUseCase` retries once then `MissingChoicesException` (nothing is invented; `BeatSpec.fallbackChoices` is no longer read). `NarrativeNode.actions` holds them (`choices` = their `actor: action` labels). A chapter without four valid actions is kept and `PlayTurnUseCase` asks for the actions alone in one small follow-up call (`buildPlayActionsPrompt`), and `MissingChoicesException.reason` (CutOff / IgnoredFormat / OffViewpoint / TooFew) picks the on-screen message; the "no choices" bug was `NetworkAiChatClient`'s 120 s SSE cap cutting slow local models before their trailing JSON (caps now 15 min / 5 min idle, cut streams flagged `cutOff`), reproducible with the opt-in `LiveProxyPlayTest`. `SceneStagingPane` shows each tag only in its own section.

**UI Refactor — Unified `PromptSectionView` Tag Rendering (October 2026)** — `PromptSectionView` consolidates all parameter category tags (genres, tones, paces, perspectives, tenses, lengths, tropes) into a single reusable Composable. Replaces bespoke per-category chip logic with a common `FlowRow` + `StoryTagChip` pattern. Supports both `SINGLE` and `MULTI` selection modes (rendered as a badge label). Long-press actions open tag details dialogs; short-tap toggles selection. A '+' icon at the end of each section enables inline tag creation. Handles search filtering with smart option reconciliation (known + custom ids). This refactor eliminates duplicated UI code and makes adding new parameters (e.g., writing style, tone palette) a config change rather than a code change.

**Resources refactor** — Prompt text and user-visible text moved out of Kotlin with byte-identical prompts. LLM wording lives in `composeResources/files/story/prompts/*.json` (one set per builder + `common` + `fallbacks` for parser fallback choices/name pools), reaching `StoryPromptBuilder`/`StoryResponseParser` as `PromptCatalog.templates` (or a `templates` parameter on the suggest/flesh-out paths). `BundledPromptTemplatesTest` keeps the JSON equal to the in-code default; `PromptGoldenTest` + `StoryPromptGoldenTest` pin prompt bytes. Play errors are typed (`PlayErrorReason` ← `NoBackendAnsweredException`/`EmptyChapterException`/`StoryAlreadyEndedException`) and shown as a localized headline plus the technical message. `ui/` literals are in `strings_story_generator.xml`. Fallbacks that invented content were then removed: no "null" length lines, no invented premise, no generic choices (Play retries then `MissingChoicesException`), missing character/scene fields are asked for once more via `buildComplete*Prompt` and otherwise left blank with a "decide, or tap ✨" hint, rerolls wait for the AI brainstorm (no canned pools), `NoModelLoadedException` instead of model "default" (resolved during check or returned as failure), new stories start with one blank root, the Tropes tab comes from `tropes.json` (`DEFAULT_TROPES` deleted), and Markdown exports carry today's date. Still inline: ViewModel status/validation text, preview data. Details: `.wiki/apps/demo3/features/storygenerator.md (consolidated from story_generator_interactive_play_plan.md)` § Resources refactor.

**Scene Staging & Scenography Templates** — New `SceneStagingPane` component enables users to visually compose scenes before generation. Scenes now have `SceneStatus` enum (OutlineOnly, Staged, Generating, Drafted, Revised) to track their narrative state. `ScenographyTemplate` domain model defines literary staging frameworks (cinematography angles, dramatic structure templates), surfaced via JSON catalog. `GenerateSceneUseCase` now accepts scenography context for more structured, repeatable generation. Unit tests verify scene state transitions and template prompt injection.

**Resource-Driven Cancelation & Cleanup** — `GenerateSceneUseCase` now supports atomic prefetch cancelation with guaranteed cleanup on error. Prevents orphaned LLM requests and ensures ViewModel state stays consistent when users cancel mid-generation. Streaming flows are wrapped in cancellable supervisors; cleanup lambdas reset dialog flags atomically.

**Model resolution fallback** — `LmStudioStoryService.resolveModel()` now returns `String?` instead of defaulting to "default" model. When the configured model is blank, it scans available models and filters out embedding models, returning null if none are suitable. Calling code (`sendChatCompletion`) treats null as a hard failure (returns `Result.failure(NoModelLoadedException())`), preventing silent fallback to an invalid model.

## Gotchas

- **LM Studio must be running** — `CheckConnectionUseCase` is a mandatory preflight check. If offline, all generation use cases fail gracefully (emit `Error` state).
- **Character name parsing** — `StoryResponseParser.cleanCharacterName()` treats placeholder names (e.g., "Character Name", "[protagonist name]", "TBD") as missing. `SuggestCharacterUseCase` / `SuggestSceneUseCase` then ask the model once for only the missing fields; anything still missing stays blank. Nothing is invented locally.
- **Editing prompt text** — change `files/story/prompts/<id>.json` AND `DefaultPromptTemplates.kt` together (drift test), and expect the golden tests to fail: prompt bytes are pinned on purpose. Use `{KEY}` placeholders for response headers, never a literal `TITLE:`.
- **Compose resources do not unescape `\'`** — write a plain `'` in `strings_*.xml` (fixed in the story-generator strings; `StoryStringsNoSymbolsTest.noEscapedApostrophes` guards it).
- **Streaming response timeout** — long-running generations (>5 min) may timeout on mobile networks. No client-side retry logic yet; user must restart manually.
- **Character radar traits are heuristic** — derived from role and tropes, not LLM output. User edits not persisted to narrative (read-only for now).
- **Narrative tree DAG logic is eager** — all nodes are computed upfront; large branching trees (100+ nodes) may cause UI jank. Consider lazy tree loading if scale becomes a problem.
- **Export formats vary by platform** — Desktop PDF export uses a different library than Android. Format consistency is not yet tested cross-platform.
- **Prompt inspector dialog shows the raw prompt** — useful for debugging LLM behavior, but may confuse non-technical users if exposed in production UI.
- **Catalog resolution is upfront** — `StorySectionRepository` loads all bundled JSON at app start; cache misses are non-fatal (graceful fallback to defaults).

## Specification & Bug Checklist

This section is the **canonical product specification and bug backlog** for `storygenerator`, governed by `Scripts/reconcile_feature_spec.py` and consumed by `Scripts/run_bugfix_sweep.py`.

### Status Legend
- `[AMBIGUOUS]` — Spec-vs-Code conflict where git history does not make user intent 100% certain. **Blocks `run_bugfix_sweep.py` until resolved with the user and locked via `reconcile_feature_spec.py --lock`.**
- `[CLEANUP]` — Auto-reconciled dead code, unused parameters, or stale wiring left behind by an intentional refactor (confirmed via git history or user decision). Dispatched by `run_bugfix_sweep.py` once the feature spec is locked.
- `[BUG]` — Confirmed product specification bug against a **locked** specification, awaiting automated fix + full-stack regression test.
- `[x]` — Verified working and guarded by a full-stack integration test in `desktopTest` or `commonTest`.

### Locked Specification Decisions
- **Tropes Placement (Locked 2026-10-17)**: Tropes were intentionally moved under the Premise inside the `Setup` tab (`StoryCoreParamsSection` via catalog `tropes` section in `d21083859`). There is **no** separate `Tropes` tab in `StoryOutlinePane`. Leftover `StoryTropesSection.kt` and the 8 unused trope parameters on `StoryOutlinePane.kt` are dead refactor leftovers (`CLEANUP-SG-01`).
- **Chapter/Scene Hierarchy (`form.chapters`, Locked 2026-10-17)**: Per the flow and scenography specification, hierarchical `form.chapters` (`ChapterItem` -> `SceneItem`) is the primary structural representation for scenes. `StoryGeneratorViewModel.suggestScene()` and `StoryPromptBuilder.buildStoryPrompt()` must operate on `form.chapters` when chapters exist (`BUG-SG-01`).
- **Scene Prose & Manuscript Reader Flow (Locked 2026-10-17)**: Generating scene prose (`generateScene`) must activate the Manuscript Reader pane (`isThirdPaneActive = true`) so the drafted scene is visible across all window width classes, and `StoryExportEngine` must export drafted scenes from `form.chapters` when `narrativeTree` has no drafted chapters (`BUG-SG-03`).

### 1. Auto-Reconciled Refactor Leftovers (`[CLEANUP]`)

- [x] **CLEANUP-SG-01: Remove leftover `StoryTropesSection.kt`, `StoryGeneratedSection.kt`, and unused trope parameters on `StoryOutlinePane.kt`**
  - **Reconciliation Context**: Commit `d21083859` (*"feat(storygenerator): implement flow redesign and resource-driven scenography"*) moved Tropes under Premise in `StoryCoreParamsSection` and replaced `StoryGeneratedSection` with `StoryManuscriptReaderPane`. Static scan (`reconcile_feature_spec.py`) confirmed `StoryTropesSection` and `StoryGeneratedSection` are never called in production UI, and `StoryOutlinePane` ignores 8 trope parameters (`tropeSearchQuery`, `selectedTropeCategory`, `availableTropes`, `onTropeSearchChange`, `onTropeCategorySelect`, `onToggleTrope`, `onAddCustomTrope`, `onAiMatchTropes`).
  - **Expected Specification**:
    - Delete dead `StoryTropesSection.kt` and `StoryGeneratedSection.kt` (and their dead preview/test references if any), remove the 8 unused trope parameters from `StoryOutlinePane` and its call site in `StoryGeneratorContent.kt`, and remove `ui/components/StoryMultiSelectChipGroup.kt` from the wiki Key Types table.
  - **Affected Files**:
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/ui/components/StoryTropesSection.kt`
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/ui/components/StoryGeneratedSection.kt`
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/ui/components/StoryOutlinePane.kt`
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/ui/StoryGeneratorContent.kt`
  - **Verification Test**: Full-stack Compose UI test (`runComposeUiTest`) mounting `StoryGeneratorContentConnected` and verifying the Setup tab renders Premise + catalog sections cleanly without dead parameter wiring, with before/after screenshots.

### 2. Spec-vs-Code Ambiguities Requiring User Decision (`[AMBIGUOUS]`)

_None — all specification questions resolved and locked (2026-10-17)._

### 3. Confirmed Product Bugs (`[BUG]`)

- [x] **BUG-SG-01: "Suggest Scene" (`suggestScene`) and `StoryPromptBuilder` ignore `form.chapters` hierarchy**
  - **User Journey**: Open Story Generator → Click `Scenes` tab (`outline_tab_scenes`) → Click "Suggest Scene" (`scenes_ai_suggest_button`) or generate a story prompt after editing chapter scenes.
  - **Broken Behavior**:
    1. `StoryGeneratorViewModel.suggestScene()` (`StoryGeneratorViewModel.kt:648-683`) reads `form.scenes` for existing scene titles and appends the newly suggested `SceneItem` to the legacy flat `form.scenes` list instead of appending it to the active or last chapter in `form.chapters` (`ChapterItem.scenes`). Because `StoryScenesSection.kt:61` renders `if (chapters.isNotEmpty())` (and `StoryFormState` initializes with 1 default chapter), any scene created via "Suggest Scene" never appears in the UI.
    2. `StoryPromptBuilder.buildStoryPrompt()` (`StoryPromptBuilder.kt:95-104`) only checks `if (form.scenes.isNotEmpty())` and completely ignores `form.chapters`. All scenes added, edited, or staged inside chapters are omitted from the generated story prompt when `form.scenes` is empty.
  - **Expected Specification**:
    - **Given** a `StoryFormState` with `chapters` (or empty `chapters`), **When** `viewModel.suggestScene()` succeeds, **Then** the new `SceneItem` is appended to the currently selected chapter's `scenes` (or the last chapter in `form.chapters`, creating a default chapter if `form.chapters` is empty) so that it immediately renders in `StoryScenesSection`.
    - **Given** a `StoryFormState` with scenes inside `form.chapters`, **When** `StoryPromptBuilder.buildStoryPrompt(form)` is called, **Then** all chapter scenes (with their chapter title, scene title, summary, setting/location, mood, and present cast) are included in the `Scene Breakdown:` block (falling back to `form.scenes` only if `form.chapters` has no scenes).
  - **Affected Files**:
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/ui/StoryGeneratorViewModel.kt`
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/domain/StoryPromptBuilder.kt`
  - **Verification Test**: Full-stack Compose UI test (`runComposeUiTest`) + ViewModel/PromptBuilder integration test clicking `scenes_ai_suggest_button`, verifying the suggested scene card appears in `StoryScenesSection` under `form.chapters` (with before/after screenshots), and verifying `StoryPromptBuilder.buildStoryPrompt` includes chapter scenes.

- [x] **BUG-SG-02: `GenerateSceneUseCase` ignores user's `LmStudioConfig` (endpoint, model, temperature, style prompt)**
  - **User Journey**: Settings Dialog → configure custom LM Studio URL, model, temperature, or style prompt → Stage a scene in `SceneStagingPane` → Click "Generate Scene" (`scene_staging_generate`).
  - **Broken Behavior**:
    - `GenerateSceneUseCase.invoke()` (`GenerateSceneUseCase.kt:34-38`) calls `gateway.sendChatCompletion(config = LmStudioConfig(), ...)` with a hardcoded default `LmStudioConfig()` instead of passing `form.lmStudioConfig`.
  - **Expected Specification**:
    - **Given** a user-configured `form.lmStudioConfig`, **When** `viewModel.generateScene(chapterId, sceneId)` executes `GenerateSceneUseCase`, **Then** `gateway.sendChatCompletion` receives `config == form.lmStudioConfig`.
  - **Affected Files**:
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/domain/usecase/GenerateSceneUseCase.kt`
  - **Verification Test**: Full-stack `StoryGeneratorViewModel` + real `GenerateSceneUseCase` test verifying that custom `LmStudioConfig` fields are forwarded to `StoryLlmGateway.sendChatCompletion`, plus UI screenshot evidence.

- [x] **BUG-SG-03: Scene generation (`generateScene`) does not open Manuscript Reader on compact/dual-pane layouts and `StoryExportEngine` ignores drafted chapter scenes**
  - **User Journey**: Select a scene in `StoryScenesSection` → Click "Generate Scene" (`scene_staging_generate`) in `SceneStagingPane` → Read or export the generated manuscript.
  - **Broken Behavior**:
    1. When `generateScene(chapterId, sceneId)` completes (`StoryGeneratorViewModel.kt:356-380`), it updates `scene.generatedProse` and `scene.status = SceneStatus.DRAFTED`, which renders in `StoryManuscriptReaderPane` (Pane 3). However, `generateScene` never sets `isThirdPaneActive = true`, so on compact (< 840dp) or medium (840dp–1200dp) windows the user stays stuck on the staging pane with no indication where the generated prose went.
    2. In `StoryManuscriptReaderPane`, clicking Export (`manuscript_export_markdown` / `manuscript_export_text`) invokes `StoryExportEngine.exportAsMarkdown(form)` / `exportAsPlainText(form)` (`StoryExportEngine.kt:12-65`). `StoryExportEngine` only exports `form.narrativeTree.orderedPath` (`ChapterNode.Status.DRAFTED`), completely ignoring `form.chapters` and `SceneItem.generatedProse` when `narrativeTree` has no drafted chapters. Exporting a story drafted via Scene Staging produces an empty manuscript with only title and premise.
  - **Expected Specification**:
    - **Given** a staged scene, **When** `generateScene(chapterId, sceneId)` starts or succeeds, **Then** `isThirdPaneActive` is set to `true` so the Manuscript Reader pane is visible on compact/medium layouts.
    - **Given** a `StoryFormState` containing drafted scenes (`scene.generatedProse.isNotBlank()`) in `form.chapters` and no drafted `ChapterNode`s in `form.narrativeTree`, **When** `StoryExportEngine.exportAsMarkdown(form)` or `exportAsPlainText(form)` is called, **Then** the exported output includes each chapter heading, scene title, and `scene.generatedProse`.
  - **Affected Files**:
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/ui/StoryGeneratorViewModel.kt`
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/domain/StoryExportEngine.kt`
  - **Verification Test**: Full-stack Compose UI test (`runComposeUiTest`) + export verification test generating a scene, asserting `isThirdPaneActive == true` and Manuscript Reader displays the generated prose (with before/after screenshots), and asserting `exportStory("markdown")` / `exportStory("text")` contains the drafted scene prose.

- [x] **BUG-SG-04: Error banner dismiss (`clearError`) fails to clear `validationError`, leaving error banner permanently stuck**
  - **User Journey**: Trigger a validation error (e.g., click Generate with an empty premise so `validationError` is set) → Click the `✕` dismiss button on `StoryErrorBanner` (`story_error_dismiss`).
  - **Broken Behavior**:
    - `StoryGeneratorContent.kt:121` computes `errorMessage = state.errorMessage ?: state.validationError` and wires `onDismissError = viewModel::clearError`.
    - `StoryGeneratorViewModel.clearError()` (`StoryGeneratorViewModel.kt:944-946`) only resets `it.copy(errorMessage = null)` and does **not** clear `validationError = null`. Clicking `✕` on a validation error banner does nothing.
  - **Expected Specification**:
    - **Given** `StoryGeneratorUiState.Success` has a non-null `validationError` or `errorMessage`, **When** `viewModel.clearError()` is called (or `story_error_dismiss` is clicked), **Then** both `errorMessage` and `validationError` are set to `null` and `story_error_banner` disappears from the UI.
  - **Affected Files**:
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/ui/StoryGeneratorViewModel.kt`
  - **Verification Test**: Compose UI test (`runComposeUiTest`) triggering a validation error, asserting `story_error_banner` is displayed (`before` screenshot), clicking `story_error_dismiss`, and asserting `story_error_banner` does not exist (`after` screenshot).

- [x] **BUG-SG-06: `resetForm()` wipes loaded `PromptCatalog`, `ScenographyCatalog`, and `availableTropes`**
  - **User Journey**: Open Story Generator (catalogs and tropes loaded from JSON resources) → Edit story → Click Reset (`resetForm()`).
  - **Broken Behavior**:
    - In `StoryGeneratorViewModel.kt:877-883`, `resetForm()` executes `updateState { StoryGeneratorUiState.Success(form = StoryFormState()) }`, which replaces `catalog`, `scenographyCatalog`, and `availableTropes` with empty defaults instead of preserving the loaded catalogs/tropes from `current`.
  - **Expected Specification**:
    - **Given** `StoryGeneratorViewModel` has loaded `catalog`, `scenographyCatalog`, and `availableTropes` into `StoryGeneratorUiState.Success`, **When** `viewModel.resetForm()` is called, **Then** the form fields reset to a fresh story while preserving `catalog`, `scenographyCatalog`, `availableTropes`, `isConnected`, default prompt templates, and default catalog selections.
  - **Affected Files**:
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/ui/StoryGeneratorViewModel.kt`
  - **Verification Test**: Full-stack `StoryGeneratorViewModel` + Compose UI test verifying that calling `resetForm()` clears user story edits while preserving non-empty `state.catalog`, `state.scenographyCatalog`, and `state.availableTropes` (with before/after screenshots).

- [x] **BUG-SG-07: Selecting a POV character in `SceneStagingPane` does not automatically include them in `presentCharacterIds` or `GenerateSceneUseCase` cast details**
  - **User Journey**: Add characters → Open Scene Staging (`SceneStagingPane`) → Select a POV character (`scene_staging_pov_<charId>`) without separately toggling their Present Cast chip → Click "Generate Scene".
  - **Broken Behavior**:
    - `GenerateSceneUseCase.kt:16` filters character details using `form.characters.filter { it.id in scene.presentCharacterIds }` without including `scene.povCharacterId`. If a user selects a POV character for a scene without also clicking their chip under "Present Cast", the POV character's traits, backstory, and motivation are omitted from the scene generation prompt.
  - **Expected Specification**:
    - **Given** a scene with `povCharacterId` set, **When** `GenerateSceneUseCase` builds the scene prompt (and/or when `povCharacterId` is selected in `SceneStagingPane`), **Then** the POV character is always included in the scene's present character details passed to the LLM (and auto-added to `presentCharacterIds` when selected as POV).
  - **Affected Files**:
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/domain/usecase/GenerateSceneUseCase.kt`
    - `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/ui/components/SceneStagingPane.kt`
  - **Verification Test**: Compose UI + UseCase test selecting a POV character chip (`scene_staging_pov_<id>`), verifying the character is included in `presentCharacterIds` (with before/after screenshots) and that `GenerateSceneUseCase` includes the POV character's full details in the LLM prompt.

_BUG-SG-08..11 were found by a live LM Studio end-to-end run (2026-10-19)._

- [x] **BUG-SG-08: `fleshOutScene` ignores scenes that live in `form.chapters`**
  - **Broken Behavior**: `StoryGeneratorViewModel.fleshOutScene(sceneId)` looked the scene up only in the legacy flat `form.scenes` and wrote the result only there, so fleshing out a chapter scene was a silent no-op (same class as `BUG-SG-01`).
  - **Expected Specification**: The scene is found in `form.chapters` (falling back to `form.scenes`); the refined scene is written back into its chapter and into `form.scenes` when mirrored there (as `generateScene` does).
  - **Affected Files**: `ui/StoryGeneratorViewModel.kt`
  - **Verification Test**: `commonTest/.../ui/StoryGeneratorLiveRunBugsTest.fleshOutSceneRefinesASceneThatLivesInAChapter`

- [x] **BUG-SG-09: "Suggest Character" reuses names of existing cast members**
  - **Broken Behavior**: The prompt listed existing characters but never said not to reuse them, and `SuggestCharacterUseCase` accepted any name; the brainstorm name buffer (`rerollCharacterName`) could also pop a name already in the cast.
  - **Expected Specification**: The prompt says "never reuse any of these names" (`suggest_character.existingLine`). A name matching an existing cast member (case-insensitive) counts as missing: the model is asked once more (follow-up also lists the cast); if it still duplicates, the name stays blank. Nothing is invented locally. `rerollCharacterName` skips buffered names already in the cast.
  - **Affected Files**: `domain/usecase/SuggestCharacterUseCase.kt`, `domain/prompt/StoryPromptBuilder.kt`, `prompts/suggest_character.json` + `DefaultPromptTemplates.kt`, `ui/StoryGeneratorViewModel.kt`
  - **Verification Test**: `commonTest/.../domain/usecase/SuggestCharacterUniqueNameTest`, `StoryGeneratorLiveRunBugsTest.rerollCharacterNameSkipsNamesAlreadyInTheCast`

- [x] **BUG-SG-10: Consecutive drafted scenes repeat each other almost verbatim**
  - **Broken Behavior**: `generateScene` passed `prevScene.prose?.take(500)` (the previous scene's *opening*) as an unlabelled "Continuity" line, and the scene prompt never included the current scene's own setting/summary/twist, so the model echoed the previous opening.
  - **Expected Specification**: The ViewModel passes the previous prose whole; `buildScenePrompt` keeps only its ending (`PREVIOUS_SCENE_ENDING_CHARS` = 600, cut at a sentence/paragraph boundary) under "What just happened … do not repeat or restate it; continue from here", placed before this scene's context, which now includes `Setting`, `What happens in this scene` and `Twist`. The write instruction says not to recap earlier scenes.
  - **Affected Files**: `ui/StoryGeneratorViewModel.kt`, `domain/prompt/StoryPromptBuilder.kt`, `prompts/scene.json` + `DefaultPromptTemplates.kt`
  - **Verification Test**: `StoryGeneratorLiveRunBugsTest.generateScenePassesThePreviousScenesEndingNotItsOpening`, `commonTest/.../domain/prompt/StoryPromptBuilderSceneDirectionTest`

- [x] **BUG-SG-11: Scene length ignores the user's custom directives**
  - **Broken Behavior**: The scene prompt omitted the selected story length entirely, buried `SceneItem.customDirectives` mid-prompt (before continuity) and ended with "write the complete narrative prose", so a "two paragraphs, under 150 words" directive was ignored.
  - **Expected Specification**: The selected `length` option is included as a whole-story line (`scene.storyLength`, no per-scene word target). Custom directives come last before the instruction under a heading stating they take precedence (including length), followed by a closing `directivesReminder`.
  - **Affected Files**: `domain/prompt/StoryPromptBuilder.kt`, `prompts/scene.json` + `DefaultPromptTemplates.kt`
  - **Verification Test**: `StoryPromptBuilderSceneDirectionTest.selectedStoryLengthIsIncluded` / `customDirectivesComeLastAndTakePrecedence`; scene goldens in `PromptGoldenExpected` updated intentionally.

## See Also

- `demo3-features/index.md` — feature catalogue
- `demo3-core.md` — ViewModel and DiProvider patterns
- `demo3-screens.md` — where story generator is routed
- `Applications/Demo3/composeApp/src/commonTest/kotlin/com/otiasj/features/storygenerator/` — unit tests

_Last updated: 2026-10-17 — Reconciled specification and locked `storygenerator` for automated LLM bug-fix & cleanup sweeps._
