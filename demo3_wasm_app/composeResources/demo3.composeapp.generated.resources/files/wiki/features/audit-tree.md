---
type: feature
title: Audit Tree — Feature Architecture & Cleanliness Visualization
description: Interactive tree visualization of Demo3 features with multi-dimensional audit tags (architecture, tests, strings, code quality, documentation, porting, overall).
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/auditTree/, Scripts/audit_demo3_features.py, Applications/Demo3/composeApp/src/commonMain/composeResources/files/audit-result.json]
tags: [demo3, ailift, dev-tools, visualization]
timestamp: '2026-07-25T00:00:00Z'
last_commit: 
category: feature
status: implemented
---

# Audit Tree — Feature Architecture & Cleanliness Visualization

## Overview

**Purpose:** Visualize the entire Demo3 feature tree with interactive, color-coded audit tags that reflect code quality across multiple dimensions (architecture, test coverage, string usage, code hygiene, documentation).

**User goal:** Navigate a filterable, hierarchical view of Demo3 features to identify which ones follow clean architecture patterns, have adequate tests, externalize strings, and maintain up-to-date wiki documentation.

**Core capability:** Display a tree of Demo3 feature packages and files, each tagged with pass/fail status for seven audit dimensions, with the ability to filter by tag and expand/collapse packages.

**Integration:** New tab in the AILift collection (alongside Ideas, Linear, Jules, Tasklist, Review, AI Chat).

---

## Design — Locked

### Features (from grilling session)

| Aspect | Decision |
|--------|----------|
| **Scope** | Demo3 features only (`Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/`) |
| **Tree representation** | Packages → Files (recursive hierarchy) |
| **Visual element** | Rectangles per node; 7 colored dots per node (one per tag) |
| **Tags (7 total)** | Architecture, Tests, Strings, Code Quality, Documentation, Porting, Overall |
| **Overall tag** | Green only if all 6 individual tags pass (strict aggregate) |
| **Interactions** | Click to expand packages, filter by tag, search by name, pan/zoom canvas |
| **Copy action** | Icon button on each rectangle to copy package/file path to clipboard |
| **Data generation** | Pre-compiled Python script + manual CLI |
| **Output format** | JSON snapshot baked into app assets (version-controlled) |
| **Navigation** | New tab in AILift collection (Settings area) |
| **Mode** | Read-only for v1 |

### Tag Definitions

| Tag | Passes when | Color | Audits |
|-----|------------|-------|--------|
| **Architecture** | Feature has all clean-arch layers (presentation, domain, data); follows template structure | 🟢 Green | ViewModel exists, Repository interface + impl, UI layer organized |
| **Tests** | Adequate test coverage (heuristic: test file count vs source count) | 🔵 Blue | `*.Test.kt` files exist, reasonable ratio to source |
| **Strings** | All user-visible strings externalized to `strings_*.xml`; no hardcoded literals in UI | 🟡 Yellow | Scan for string literals in `*.kt` UI files |
| **Code Quality** | Clean imports, no TODOs, follows naming conventions | 🟠 Orange | No unresolved imports, no TODO comments, no nonstandard names |
| **Documentation** | Wiki `.md` file exists and is not stale (hasn't changed in >6 months?) | 🟣 Purple | Check `.wiki/apps/demo3/features/FeatureName.md` exists; check git timestamp |
| **Porting** | Feature has been ported from the web app (has `ui_brief.json` and key layers) | ⚪ Cyan | Native features auto-pass; ported features need `docs/ui_brief.json` |
| **Overall** | All 6 above pass | 🟢 Green | Aggregates Architecture + Tests + Strings + Code Quality + Documentation + Porting |

---

## Architecture

### Layers

```
Compose UI (audit-tree feature)
  └─ ViewModel (AuditTreeViewModel) — loads JSON, drives UI state
     └─ Domain (AuditTreeRepository) — loads audit JSON from assets
        └─ Data Layer (AuditTreeRepositoryImpl) — reads compiled JSON
           └─ Assets (composeResources/files/audit-result.json)

Python script (pre-build)
  └─ Scans Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/
  └─ Analyzes each feature against 7 tags
  └─ Outputs audit-result.json
```

### Data Model (Kotlin)

```kotlin
// Domain model
sealed class AuditTag {
    object Architecture : AuditTag()
    object Tests : AuditTag()
    object Strings : AuditTag()
    object CodeQuality : AuditTag()
    object Documentation : AuditTag()
    object Porting : AuditTag()
    object Overall : AuditTag()
}

data class NodeAuditStatus(
    val tag: AuditTag,
    val passed: Boolean,
    val reason: String? = null
)

sealed interface AuditNode {
    val name: String
    val path: String
    val tags: List<NodeAuditStatus>
    
    data class Package(
        override val name: String,
        override val path: String,
        override val tags: List<NodeAuditStatus>,
        val children: List<AuditNode>
    ) : AuditNode
    
    data class File(
        override val name: String,
        override val path: String,
        override val tags: List<NodeAuditStatus>
    ) : AuditNode
}

data class AuditTreeSnapshot(
    val timestamp: Long,
    val root: AuditNode.Package
)
```

### ViewModel

```kotlin
sealed interface AuditTreeUiState {
    object Loading : AuditTreeUiState
    data class Success(
        val tree: AuditNode.Package,
        val selectedTags: Set<AuditTag> = setOf(),  // active filters
        val expandedPackages: Set<String> = setOf(), // paths of expanded packages
        val searchQuery: String = "",
        val zoomLevel: Float = 1f
    ) : AuditTreeUiState
    data class Error(val message: String) : AuditTreeUiState
}

class AuditTreeViewModel(
    private val repository: AuditTreeRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow<AuditTreeUiState>(AuditTreeUiState.Loading)
    val uiState = _uiState.asStateFlow()
    
    init {
        viewModelScope.launch {
            try {
                val snapshot = repository.loadAuditSnapshot()
                _uiState.value = AuditTreeUiState.Success(tree = snapshot.root)
            } catch (e: Exception) {
                _uiState.value = AuditTreeUiState.Error(e.message ?: "Unknown error")
            }
        }
    }
    
    fun toggleTagFilter(tag: AuditTag)
    fun togglePackageExpanded(packagePath: String)
    fun updateSearchQuery(query: String)
    fun zoomIn()
    fun zoomOut()
    fun copyPathToClipboard(path: String)
}
```

---

## Python Audit Script

**Location:** `Scripts/audit_demo3_features.py`

**Execution:** Manual CLI: `python3 Scripts/audit_demo3_features.py` (flags: `--features-dir`, `--output`, `--test-ratio`, `--docs-dir`, `--no-bundle-docs`, `--quiet`)

**Scanned root:** `Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/`

**Output:** `.../composeResources/files/audit-result.json`, plus a copy of each feature's wiki page
under `.../composeResources/files/wiki/features/` (all committed to git)

**Scoring model:** feature directories get the full seven checks. Sub-packages inherit `architecture` and `documentation` from their feature and aggregate `tests` / `strings` / `code_quality` from their children; files are scored individually (with `architecture` / `documentation` inherited). Every node carries all seven tags.

### Scanning Logic

**Architecture check:**
- Verify the feature has `ui/`, `domain/` and `data/` subdirectories
- Check for a `*ViewModel.kt` under `ui/`
- If the domain layer declares a `*Repository.kt`, require a matching `*RepositoryImpl.kt` under `data/`
- **Pass:** All layers present and organized correctly

**Tests check:**
- Feature level — count `*Test.kt` files across every test source set for that feature; **pass** when `test_files / source_files >= 0.3` (`--test-ratio`)
- File level — **pass** when a matching `<Name>Test.kt` exists; pure-presentation files (`*Screen.kt`, `*Dialog.kt`, `*Previews.kt`, …) are exempt

**Strings check:**
- Scan `.kt` files under a `ui/` path (skipping `*Previews.kt`, which never ships)
- Flag literals passed to `Text(...)`, `text =`, `contentDescription =`, `placeholder =`, with comments stripped first
- `title =` / `label =` are deliberately **not** flagged — they are far more often domain-model fields, and the false positives drowned the signal
- **Pass:** No hardcoded user-facing strings found

**Code Quality check:**
- Scan for TODO/FIXME comments
- Scan for wildcard imports
- Check the file name is PascalCase
- **Pass:** No major violations detected

**Documentation check:**
- Check `.wiki/apps/demo3/features/{name}.md`, `{name.lower()}.md` or the kebab-case form (`auditTree` → `audit-tree.md`)
- If found, read the git commit timestamp for that file (untracked pages count as fresh)
- **Pass:** File exists AND was updated within last 6 months

**Overall:** Passes only if all 5 individual tags pass

### JSON Output Schema

```json
{
  "timestamp": 1721901600000,
  "root": {
    "type": "package",
    "name": "features",
    "path": "Applications/Demo3/composeApp/src/commonMain/features",
    "tags": [
      { "tag": "architecture", "passed": true },
      { "tag": "tests", "passed": true },
      { "tag": "strings", "passed": true },
      { "tag": "code_quality", "passed": true },
      { "tag": "documentation", "passed": true },
      { "tag": "overall", "passed": true }
    ],
    "children": [
      {
        "type": "package",
        "name": "auditTree",
        "path": "Applications/Demo3/composeApp/src/commonMain/features/auditTree",
        "tags": [
          { "tag": "architecture", "passed": true },
          { "tag": "tests", "passed": false, "reason": "No tests found" },
          { "tag": "strings", "passed": true },
          { "tag": "code_quality", "passed": true },
          { "tag": "documentation", "passed": true },
          { "tag": "overall", "passed": false }
        ],
        "children": [
          {
            "type": "package",
            "name": "presentation",
            "path": "Applications/Demo3/composeApp/src/commonMain/features/auditTree/presentation",
            "tags": [...],
            "children": [
              {
                "type": "file",
                "name": "AuditTreeScreen.kt",
                "path": "Applications/Demo3/composeApp/src/commonMain/features/auditTree/presentation/AuditTreeScreen.kt",
                "tags": [...]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

## Compose Feature Structure — as built

Root is `composeApp/src/commonMain/kotlin/com/otiasj/features/auditTree/`.

```
features/auditTree/
├── AuditTreeComponent.kt              # DI container (manual, by lazy)
├── ui/
│   ├── AuditTreeScreen.kt             # @Serializable AuditTreeRoute + auditTreeRoute() + Pane + stateless Screen
│   ├── AuditTreeContent.kt            # Stateless body — search + chips + zoom + canvas (previewable)
│   ├── AuditTreeViewModel.kt          # Loads the snapshot, owns filters/expansion/zoom
│   ├── AuditTreeUiState.kt            # Loading / Success / Error + zoom bounds
│   ├── AuditTreeRows.kt               # Pure flattenVisibleRows() — filtering + search + indentation
│   ├── markdown/Markdown.kt           # Pure markdown block parser (no Compose)
│   └── components/
│       ├── AuditNodeRectangle.kt      # Card with 7 verdict dots + copy affordance
│       ├── AuditNodeDetailPane.kt     # Selected-node detail: verdicts + reasons + document
│       ├── AuditDetailPaneHost.kt     # Responsive host: overlay on compact, column on wide
│       ├── AuditTagFilterChips.kt     # Filter chips for the 7 tags (also the dot legend)
│       ├── AuditTagLabels.kt          # AuditTag -> localised label
│       ├── AuditTreeCanvas.kt         # LazyColumn renderer, density-based zoom, horizontal pan
│       ├── MarkdownDocument.kt        # Renders parsed markdown with M3 typography
│       └── AuditZoomControls.kt       # +/- zoom buttons
├── domain/
│   ├── model/{AuditTag,AuditNode,NodeAuditStatus,AuditTreeSnapshot}.kt
│   └── repository/AuditTreeRepository.kt
└── data/
    ├── dto/AuditSnapshotDto.kt        # Wire format + toDomain() mapping
    └── repository/AuditTreeRepositoryImpl.kt
```

### As built — deviations from the locked design

| Design said | Built instead | Why |
|---|---|---|
| Dot colour = tag identity (`Color.Green`, `Color(0xFFFFA500)`, …) | Dot colour = **verdict** (`colorScheme.primary` / `colorScheme.error`); the tag is identified by dot position and its initial letter | Demo3 forbids hardcoded `Color(0xFF…)`; identity was already carried by position, so colour was free to carry the verdict |
| `SearchBar.kt` | Reuses `core/ui/components/SearchFilterField` | Existing component covers it |
| `.tooltip(...)` on each dot | First failing `reason` rendered as a caption line on the card; per-dot `contentDescription` carries "&lt;Tag&gt;: passed/failed" | Tooltips are not uniformly supported across the four targets |
| `AuditTreeViewModel.copyPathToClipboard(path)` | Copy happens in the composable via `Modifier.copyOnClick`; the VM exposes `onPathCopied(path)` for analytics only | The clipboard lives behind `LocalClipboardManager`, unreachable from a ViewModel |
| Recursive `AuditNodeRectangle` renders children inline | Tree is flattened to rows by `flattenVisibleRows()` and drawn in a `LazyColumn` | 1 000+ nodes — recursion would compose the whole tree eagerly |
| Zoom via a scale factor on the canvas | Zoom scales `LocalDensity` | Content is genuinely re-laid-out, so both scroll axes stay usable at any zoom |
| Separate `AuditTreeRoute.kt` | Route lives at the top of `AuditTreeScreen.kt` | Matches the `route → Pane → Screen` split used by `features/template` |
| Card click expands the package | Card click *selects* (opens the detail pane); the chevron expands | The detail pane needed a trigger, and both actions must stay reachable on one row |

**Filter semantics:** selecting tag chips narrows the tree to the nodes that **fail** those checks (a node survives if it fails any selected tag, and ancestors of survivors are kept). While a filter or search is active, surviving packages are auto-expanded.

### Key Composables

**AuditTreeScreen.kt**
```kotlin
@Composable
fun AuditTreeScreen(
    viewModel: AuditTreeViewModel,
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    
    when (uiState) {
        is AuditTreeUiState.Loading -> LoadingScreen()
        is AuditTreeUiState.Success -> AuditTreeContent(
            state = uiState,
            onToggleTag = viewModel::toggleTagFilter,
            onTogglePackage = viewModel::togglePackageExpanded,
            onSearchChange = viewModel::updateSearchQuery,
            onCopyPath = viewModel::copyPathToClipboard,
            onZoomIn = viewModel::zoomIn,
            onZoomOut = viewModel::zoomOut
        )
        is AuditTreeUiState.Error -> ErrorScreen(message = uiState.message)
    }
}
```

**AuditNodeRectangle.kt** — Core visual unit
```kotlin
@Composable
fun AuditNodeRectangle(
    node: AuditNode,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
    onCopyPath: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .width(240.dp)
            .wrapContentHeight()
            .clickable(enabled = node is AuditNode.Package) { onToggleExpand() }
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = node.name,
                    style = MaterialTheme.typography.labelMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                IconButton(
                    onClick = onCopyPath,
                    modifier = Modifier.size(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ContentCopy,
                        contentDescription = "Copy path"
                    )
                }
            }
            
            // 7 colored dots in a 3x2 grid (last row has 1 centered dot)
            LazyGrid(
                columns = GridCells.Fixed(3),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(node.tags) { tagStatus ->
                    AuditTagDot(tagStatus)
                }
            }
            
            if (node is AuditNode.Package && isExpanded) {
                Spacer(modifier = Modifier.height(8.dp))
                node.children.forEach { child ->
                    AuditNodeRectangle(
                        node = child,
                        isExpanded = /* from state */,
                        onToggleExpand = { /* ... */ },
                        onCopyPath = onCopyPath
                    )
                }
            }
        }
    }
}

@Composable
private fun AuditTagDot(status: NodeAuditStatus) {
    Box(
        modifier = Modifier
            .size(16.dp)
            .background(
                color = when (status.tag) {
                    AuditTag.Architecture -> Color.Green
                    AuditTag.Tests -> Color.Blue
                    AuditTag.Strings -> Color.Yellow
                    AuditTag.CodeQuality -> Color(0xFFFFA500) // Orange
                    AuditTag.Documentation -> Color.Magenta
                    AuditTag.Overall -> if (status.passed) Color.Green else Color.Red
                },
                shape = CircleShape
            )
            .tooltip(if (status.passed) "✓ ${status.tag}" else "✗ ${status.tag}: ${status.reason}")
    )
}
```

---

## Detail Pane

Selecting a node opens a detail pane. It is responsive by window width:

| Width | Behaviour |
|---|---|
| **Compact** (`< 600dp`) | The pane slides in from the right as a floating overlay above the tree, so the tree keeps its scroll position. |
| **Medium / Expanded** | The pane is a permanent right-hand column beside the tree (`1.6 : 1`, min `280dp`). |

`AuditDetailPaneHost` implements this rather than reusing `core/ui/components/TwoPaneLayout`, which
swaps the panes outright on compact widths — that loses the reveal motion and rebuilds the tree
every time the pane closes.

**Tree interaction changed:** tapping a card now *selects* it (opening the pane); expanding a
package is the chevron's job. Both actions had to stay reachable on one row.

### What the pane shows

1. **Header** — node name, `Package · N files · M sub-packages` or `File`, the repo-relative path,
   a copy affordance and a close button.
2. **All seven verdicts** with the *full* failure reason. The tree card truncates the reason to two
   lines; this is where the whole string is readable.
3. **The document that applies to the node.**

### Document resolution

There is no per-file or per-package documentation in this repo — only 37 feature-level wiki pages
for ~1,080 tree nodes. A node therefore resolves to **the nearest documented ancestor**
(`AuditNode.resolveDocPathFor`), which in practice means its owning feature's page. That lifted
coverage from ~3% of nodes to **1,059 / 1,083 (97.8%)** as of the last script run. The unresolved
nodes are the `features` root itself plus the subtrees of the features that have no page in
`.wiki/apps/demo3/features/` — at that time `desktopserver` and `backup`. Adding a page for a feature
fixes its whole subtree on the next script run, with no code change; `.wiki/apps/demo3/features/backup.md`
was added on 2026-08-08, so only `desktopserver` should remain unresolved once `audit_demo3_features.py`
re-runs (its docs live at `.wiki/apps/demo3/desktop-server.md`, a filename the script's per-feature
lookup doesn't match).

`.wiki/` is not part of the app bundle, so `audit_demo3_features.py` copies each feature's page into
`composeResources/files/wiki/features/` and records the resource path as `docPath` on that feature's
package node. Stale copies from renamed or deleted features are pruned on every run. Pass
`--no-bundle-docs` to skip the copy.

### Markdown

The app has no markdown renderer and adding a dependency for one read-only pane wasn't warranted, so
`ui/markdown/Markdown.kt` parses the subset the wiki pages actually use — headings, bullets (with
nesting and task checkboxes), numbered lists, tables, fenced code, rules, `**bold**`, `` `code` ``
and `[label](url)` (label kept, URL dropped). It is pure Kotlin and unit-tested; `MarkdownDocument`
renders the blocks with M3 typography. Tables and code blocks render as horizontally scrollable
monospace — wrapping either one in a narrow pane is unreadable, and a real grid squeezes a 5-column
table into nothing.

## Integration Checklist

### 1. Features.kt — Add to AI_LIFT_COLLECTION

```kotlin
// In Features.FeatureDefinitions
val AUDIT_TREE = FeatureDefinition(
    id = "auditTree",
    label = "Audit",
    icon = IconVector(Icons.Default.Assessment),
    route = AuditTreeRoute,
    description = "Feature architecture & cleanliness audit"
)

// In Features.AI_LIFT_COLLECTION.features list
features = listOf(
    FeatureDefinitions.PEERS,
    FeatureDefinitions.TASKLIST,
    FeatureDefinitions.LINEAR,
    FeatureDefinitions.JULES,
    FeatureDefinitions.IDEAS,
    FeatureDefinitions.REVIEW,
    FeatureDefinitions.AICHAT,
    FeatureDefinitions.AUDIT_TREE,  // ← Add here
)
```

### 2. App.kt — Register in Plugin

```kotlin
// In AiLiftPlugin.registerComponents()
AuditTreeComponent()  // Register DI container
```

### 3. Navigation — Add Route

```kotlin
// In app shell routing
navGraph(route = Features.AI_LIFT_COLLECTION.id) {
    composable<AuditTreeRoute> {
        val viewModel = viewModel { AuditTreeViewModel(repository) }
        AuditTreeScreen(viewModel, onNavigateBack = { /* ... */ })
    }
}
```

### 4. Strings — Add to strings.xml

```xml
<string name="feature_audit_tree_label">Audit</string>
<string name="feature_audit_tree_title">Feature Audit</string>
<string name="feature_audit_tree_loading">Loading audit data…</string>
<string name="feature_audit_tree_error">Failed to load audit data</string>
<string name="feature_audit_tree_copied">Path copied to clipboard</string>
<string name="audit_tag_architecture">Architecture</string>
<string name="audit_tag_tests">Tests</string>
<string name="audit_tag_strings">Strings</string>
<string name="audit_tag_code_quality">Code Quality</string>
<string name="audit_tag_documentation">Documentation</string>
<string name="audit_tag_overall">Overall</string>
```

---

## Implementation Status

Shipped in full: the Python audit script, the four Clean-Architecture layers, the AILift tab, and
unit tests for the ViewModel, the row-flattening logic and the JSON mapping. See
[As built — deviations from the locked design](#as-built--deviations-from-the-locked-design) for
where the implementation intentionally diverges from the plan above.

Regenerating the snapshot after changing any feature:

```bash
python3 Scripts/audit_demo3_features.py     # rewrites audit-result.json, prints a per-feature summary
```

The summary marks each feature `PASS`/`FAIL` with a `[+-+++]` column per tag in the order
architecture, tests, strings, code quality, documentation.

---

## Success Criteria

Verified without Gradle. The authoring sandbox could not reach `dl.google.com`, so AGP would never
resolve and `./gradlew` could not start. Everything below was instead checked by driving the Kotlin
compiler directly against jars from Maven Central, with the app's Gradle-only surface
(`androidx.lifecycle`, the generated `Res` accessors, `AppScaffold`/`AppTheme`/`DiProvider`,
navigation) replaced by stubs mirroring the real signatures:

- ✅ Python script scans Demo3 features and produces valid JSON with 6 audit tags on every node
- ✅ The emitted `audit-result.json` round-trips through the Kotlin DTOs into the domain model
- ✅ `AuditTreeRowsTest` (8) — expansion, tag filtering, ancestor retention, search, combined filters
- ✅ `AuditTreeViewModelTest` (15) — load → Success/Error, filter/expand toggles, clamped zoom,
  analytics, node selection, doc inheritance, Missing/Error doc states, stale-load guard
- ✅ `AuditTreeRepositoryImplTest` (7) — JSON mapping, `docPath`, `loadDocument`, malformed input
- ✅ `AuditNodeTest` (12) — `findByPath`, `resolveDocPathFor` (own / inherited / deepest / absent), counts
- ✅ `MarkdownTest` (17) — frontmatter, all block types, inline spans, unterminated markers
- ✅ All 37 bundled pages parse cleanly; block counts reconcile against raw greps of the sources
- ✅ Against the real snapshot: 1,059 / 1,083 nodes resolve to a `docPath` that exists in
  composeResources and parses to at least one block; the 24 that don't are the root and the
  `desktopserver` / `backup` subtrees (the two features with no wiki page)
- ✅ Every `Res.string.*` reference cross-checked against `strings_audit_tree.xml`

- ✅ **All 22 feature files compile, Compose UI included** — `AuditTreeScreen`, `AuditTreeContent`,
  `AuditNodeDetailPane`, `AuditDetailPaneHost`, `AuditNodeRectangle`, `AuditTreeCanvas`,
  `AuditTagFilterChips`, `AuditZoomControls`, `AuditTagLabels`, `MarkdownDocument`. The Compose
  compiler plugin runs and transforms them (`ComposableSingletons$*` classes are emitted).
- ✅ Logic and all 59 tests compile and pass at **Kotlin 2.3.20**, the version the project uses.

### What this verification does *not* cover

- The Compose files were type-checked against **Compose Multiplatform 1.6.11 / Kotlin 2.0.21**, not
  the project's 1.10 / 2.3.20. CMP ≥ 1.7 relocates its runtime to `androidx.compose.*` on Google's
  Maven, which the sandbox cannot reach; 1.6.11 is the newest self-contained release on Maven
  Central. API drift between 1.6 and 1.10 is therefore **not** covered.
- Compilation is not execution. In particular, `AuditTreeCanvas` puts `horizontalScroll` on a
  `LazyColumn`, which measures children with an infinite width constraint — that type-checks, but
  whether it lays out correctly is a runtime property. Every node is fixed-width (`240.dp`) and
  nothing inside calls `fillMaxWidth` at that level, which is what makes it legal, but it has not
  been run.
- ⬜ `./gradlew :composeApp:allTests` end-to-end
- ⬜ `@Preview` composables actually render
- ⬜ Desktop app displays the tree without crashes; copy button lands on the clipboard

---

## Out of Scope (v1)

- Editable overrides (manually mark features as fixed)
- CI/CD integration or automated audit runs
- Per-layer audit breakdown (just package-level for now)
- Export audit results or generate reports
- Diff view showing what changed between audits
- Web/iOS/Android testing (Desktop only initially)

---

## Notes & Decisions

### JSON Versioning
The `audit-result.json` is version-controlled. On each audit run, a new JSON is committed. This allows:
- Tracking audit history via git blame
- Reviewing what changed in the audit snapshot
- Easy rollback if audit rules change

### Audit Rule Stability
The Python audit rules are intentionally simple (string search, file counting) to avoid false positives. If a rule is too noisy, it should be revised in the script and re-run.

### Color Palette
Colors are from Material 3 to match the app theme. Consider using `MaterialTheme.colorScheme` dynamically in the future for light/dark mode.

### Future Enhancements
- [ ] Add audit rules for layer-specific code (e.g., ViewModel must extend ViewModel, not custom base)
- [ ] CLI report mode (`audit-tree --report` → summary table)
- [ ] Commit hook to warn if audit fails
- [ ] Archive old snapshots in `.wiki/audits/`
- [ ] Compare audit snapshots to detect regressions

---

## Related

- [Demo3 Architecture Guide](../../ARCHITECTURE.md)
- [Demo3 Clean Architecture Rules](../CONVENTIONS.md)
- [Template Feature](./template.md)
- [Feature Index](./index.md)

_Implementation plan finalized: 2026-07-25_
