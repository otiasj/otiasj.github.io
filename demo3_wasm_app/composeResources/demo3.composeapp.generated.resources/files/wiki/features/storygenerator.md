---
type: feature
title: Demo3 — Story Generator
description: AI-powered story writing with LM Studio backend, character/scene management, branching narratives, and multi-format export.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/storygenerator/]
tags: [demo3, feature, ai, story]
timestamp: '2026-09-30T00:00:00Z'
category: feature
last_commit: 3bc41614ac35c44b8493f864e9c8bef90d797077
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

| File | Purpose |
|------|---------|
| `StoryGeneratorComponent.kt` | DI wiring; instantiates gateway, use cases, ViewModel. |
| `StoryGeneratorViewModel.kt` | Lifecycle-aware state holder; orchestrates use cases; emits `UiState<StoryFormState>` and offline flag. |
| `StoryGeneratorScreen.kt` | Route definition + navigation. Renders `StoryGeneratorPane` composable. |
| `StoryGeneratorContent.kt` | Main multi-pane layout: outline, narrative tree, manuscript reader. |
| `domain/model/StoryModels.kt` | Enums: `StoryGenre`, `StoryTone`, `NarrativePerspective`, `NarrativeTense`, `StoryLength`, `CharacterRole`, `TropeCategory`. Data classes: `LiteraryTrope`, `StoryCharacter`, `StoryScene`, `StoryNode`, `StoryFormState`, `GenerateStoryRequest`. |
| `domain/gateway/StoryLlmGateway.kt` | Interface: `generateStory()`, `branchChapter()`, `refineChapter()`, `suggestCharacter()`, `fleshOutCharacter()`, `suggestScene()`, `checkConnection()`. |
| `data/LmStudioStoryService.kt` | `StoryLlmGateway` implementation using HTTP to LM Studio endpoint. Streaming response parsing; error handling for connection failures. |
| `domain/usecase/GenerateStoryUseCase.kt` | Entrypoint: accepts form state, invokes gateway, streams story generation. |
| `domain/usecase/BranchChapterUseCase.kt` | Split narrative at a given scene; generate alternative continuation. |
| `domain/usecase/RefineChapterUseCase.kt` | Rewrite a chapter with tone/style adjustments. |
| `domain/usecase/SuggestCharacterUseCase.kt` | LLM-generated character suggestion (archetype, motivation, arc). |
| `domain/usecase/FleshOutCharacterUseCase.kt` | Expand character with detailed backstory and psychology. |
| `domain/usecase/SuggestSceneUseCase.kt` | Generate scene ideas based on current character/plot state. |
| `domain/usecase/CheckConnectionUseCase.kt` | Verify LM Studio endpoint is reachable. |
| `ui/StoryGeneratorUiState.kt` | Sealed interface: `Loading`, `Success(formState, generatedStory, characters, scenes, tropes)`, `Error(message)`. |
| `ui/components/StoryCharacterCard.kt` | Character profile card; role, archetype, motivation display. |
| `ui/components/StoryCharacterRadar.kt` | Radial chart of character traits (strength, intelligence, charisma, etc.). |
| `ui/components/StoryCharactersSection.kt` | Character roster UI; add/edit/delete/suggest workflow. |
| `ui/components/StoryCoreParamsSection.kt` | Form controls for genre, tone, length, perspective, tense. |
| `ui/components/StoryTropesSection.kt` | Multi-select trope catalog by category (plot, relationships, conflict, twists). |
| `ui/components/StoryExportDialog.kt` | Platform-aware export (Markdown, PDF, plaintext) with format options. |
| `ui/components/StoryPromptInspectorDialog.kt` | Debug view: displays the full prompt sent to LLM before generation. |
| `ui/components/StoryNarrativeTreePane.kt` | Interactive tree visualization of story branches and nodes. |
| `ui/components/StoryManuscriptReaderPane.kt` | Scrollable manuscript display with line numbers and edit mode. |
| `ui/components/StoryOutlinePane.kt` | Scene outline list; reorder, add/remove, edit metadata. |
| `ui/components/StoryGeneratedSection.kt` | Display area for streaming generation progress and completion. |
| `ui/components/StoryBranchDialog.kt` | Choose scene to branch from; generate alternative path. |
| `ui/components/StoryRefineDialog.kt` | Select chapter; choose refinement style (more detailed, more action, etc.). |
| `ui/components/StoryNodeEditDialog.kt` | Edit narrative node metadata (scene type, pov character, etc.). |
| `ui/components/StoryLmStudioSection.kt` | LM Studio endpoint config UI (hostname, port, model selector). |
| `ui/components/StoryMultiSelectChipGroup.kt` | Reusable multi-select chip group for trope/tag selection. |
| `ui/components/StorySceneCard.kt` | Scene summary card; shows pov character, tropes used, word count. |
| `ui/components/StoryScenesSection.kt` | Scene roster; add/remove/suggest scene workflow. |

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

## Patterns & Decisions

- **LLM Gateway abstraction** — `StoryLlmGateway` interface decouples UI from `LmStudioStoryService`; easy to swap backends (Ollama, Claude API) by implementing the interface.
- **Streaming response parsing** — long-running operations emit incremental updates via Flow; UI shows live progress. `StoryResponseParser` deserializes streamed JSON chunks.
- **Narrative tree state** — `StoryNode` represents each branch point; nodes form a DAG (directed acyclic graph) allowing branching and merging. Visualized by `StoryNarrativeTreePane`.
- **Character radar** — radial chart of computed traits (derived from role, tropes, user edits) for quick personality assessment.
- **Prompt building** — `StoryPromptBuilder` constructs a detailed LLM prompt from form state, characters, scenes, and tropes; inspectable via `StoryPromptInspectorDialog` for debugging.
- **Multi-platform export** — `StoryExportEngine` + platform-specific `StoryFileWriter` actuals (Android, Desktop, iOS, Web) handle file I/O in the native way.
- **Sealed UiState** — `Loading`, `Success(formState, story, characters, scenes, tropes)`, `Error(message)`. Previews test all branches.
- **Composable recomposition** — callback lambdas passed to child composables are extracted to ViewModel methods (e.g., `viewModel::addNarrativeNode` instead of `{ title, choice, summary, fullText -> viewModel.addNarrativeNode(title, choice, summary, fullText) }`) to prevent recomposition overhead; handlers like `onDismissDialog` delegate to a single ViewModel method that atomically resets all dialog flags.

## Gotchas

- **LM Studio must be running** — `CheckConnectionUseCase` is a mandatory preflight check. If offline, all generation use cases fail gracefully (emit `Error` state).
- **Streaming response timeout** — long-running generations (>5 min) may timeout on mobile networks. No client-side retry logic yet; user must restart manually.
- **Character radar traits are heuristic** — derived from role and tropes, not LLM output. User edits not persisted to narrative (read-only for now).
- **Narrative tree DAG logic is eager** — all nodes are computed upfront; large branching trees (100+ nodes) may cause UI jank. Consider lazy tree loading if scale becomes a problem.
- **Export formats vary by platform** — Desktop PDF export uses a different library than Android. Format consistency is not yet tested cross-platform.
- **Prompt inspector dialog shows the raw prompt** — useful for debugging LLM behavior, but may confuse non-technical users if exposed in production UI.

## See Also

- `demo3-features/index.md` — feature catalogue
- `demo3-core.md` — ViewModel and DiProvider patterns
- `demo3-screens.md` — where story generator is routed
- `Applications/Demo3/composeApp/src/commonTest/kotlin/com/otiasj/features/storygenerator/` — unit tests

_Last updated: 2026-09-29 — Added new Story Generator feature with LM Studio backend, character/scene/trope management, branching narratives, and multi-platform export._
