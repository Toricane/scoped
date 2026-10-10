# Development and architecture

Scoped uses TypeScript, DOM APIs, Vite, and WebExtensions APIs. There is no framework, server, or upload pipeline. `src/api.ts` selects Firefox's `browser` API or Chrome's `chrome` API and unwraps typed runtime replies.

## Build and checks

Use Node.js 22.13+ and npm:

```sh
npm ci
npm test
npm run build
npm run validate
```

`npm run check` runs TypeScript validation separately; `build` already includes it. Vitest uses jsdom with synthetic DOM fixtures. Package validation checks manifests, bundled entry points/assets, and icon dimensions.

Optional official Firefox lint:

```sh
npm exec --yes --package=web-ext --call "web-ext lint --source-dir=dist/firefox --warnings-as-errors --no-config-discovery"
```

This may download the Mozilla development tool. Documentation-only changes need link/claim verification rather than application rebuilds.

## Entry points and code map

- `popup.html`, `src/popup.ts`, `src/popup.css`: toolbar control, active SCOPE tab discovery, progress, Start/Refresh/Cancel, downloads, and viewer launch.
- `viewer.html`, `src/viewer.ts`, `src/viewer.css`: safe DOM rendering, table/details, local pagination, independent scrolling, storage subscriptions, serialized preference writes, and stale-read protection.
- `src/viewer-model.ts`: snapshot validation, preferences, normalized indexes, term/phrase/exclusion search, combined facets, deterministic sorting, calendar deadline parsing, and presentation-only title cleanup.
- `posting.html`, `src/posting.ts`: separate posting opener, permission preflight, retry, and error UI.
- `src/site-access.ts`: shared popup/opener setup button, SCOPE-only permission request, and Firefox/Chrome instructions. Invoke permissions.request directly during the click before awaiting anything; never prompt automatically on load.
- `src/posting-navigation.ts`: load the overview in the opener tab, wait for the actual SCOPE document, then enter ID and click Search in the uniquely matched Search Posting panel. MAIN-world functions are serialized and must be self-contained.
- `src/parser.ts`: results DOM adapter, labeled-column mapping, full-text extraction, flags, counters, and pagination target selection.
- `src/collector.ts`: page-1 reset, sequential traversal, AJAX observation, count/range/ID reconciliation, deduplication, cancellation, and failures.
- `src/content.ts`: idempotent injected collector and run-aware messaging; collection survives popup/viewer closure.
- `src/background.ts`: message guards, source/opener validation, serialized collection transitions, lifecycle recovery, and posting navigation.
- `src/store.ts`: storage keys, active-run checks, and atomic snapshot/completion commit.
- `src/types.ts`: source URL validation and Posting/Snapshot/RunState/Command/Reply contracts.
- `src/export.ts`, `src/download.ts`: serialization and background-owned downloads. Firefox uses a background blob with lifecycle cleanup; Chrome workers use a self-contained data URL.
- `scripts/build.mjs`: Vite entry points, content/background IIFE bundles, manifest generation, and browser packages.
- `scripts/validate.mjs`: package/assets/manifests/icon checks. `assets/` holds artwork; `public/icons/` holds packaged sizes.
- `tests/`: parser, collector, storage/export, downloads, background, popup, viewer model/DOM, posting navigation, and permission-flow regressions. `tests/helpers.ts` simulates AJAX; fixtures are synthetic and self-contained.

## Runtime flow

### Collection

The popup discovers the active SCOPE postings tab and sends Start to the background. The background validates the source, checks any previous collector, stores a unique run ID, injects content.js, and asks it to collect. The content script traverses SCOPE's existing pagination, beginning at page 1 without changing filters/sort. Progress/completion/failure messages must match the sender tab, source URL, and current run ID.

Storage is authoritative. Start/cancel/progress/completion and tab lifecycle transitions are serialized. A normal Chrome worker wake resumes from storage; browser startup or extension install/reload marks persisted active runs interrupted. A new Start checks whether a prior active run still has a live collector before allowing a replacement. Cancellation becomes canceling, then canceled; a canceled run cannot win a race to commit success. Only reconciled completion replaces the snapshot. Tab closure/navigation and detected inconsistencies preserve the previous successful snapshot.

### Viewer and exports

New viewer preferences default to 1000 rows per page. The page-size selector and version-1 preference reader accept 25, 50, 100 and 1000. Existing saved choices remain valid and separate for All/Saved/Applied; filtering still precedes pagination.

The viewer validates the latest snapshot and builds in-memory search/sort indexes. All filtering runs across the snapshot before local pagination. Default sorting is deadline ascending with numeric ID descending as the tie-breaker; blanks/unknowns stay last. Preferences use a separate versioned key. A successful snapshot event rebuilds indexes, preserves filters, and resets local pagination; stale reads cannot overwrite newer data.

Downloads are background-owned and always serialize the entire successful snapshot. Closing the popup or invoking Save As must not invalidate file data.

### Posting opening

A title click creates posting.html?id=<numeric ID>. The opener checks SCOPE host access; the setup button requests it from a user click and retries on a grant. The background validates opener identity and snapshot membership before navigating that same new tab to SCOPE's overview. The adapter finds the Search Posting panel, sets the native input value, dispatches input/change events, and clicks its Search control.

No source-tab traversal, form replay, or link-metadata refresh is needed. Opening a position can run independently of collection because it uses a separate tab. Posting navigation and downloads run outside the collection transition queue.

Wait for tabs.update acknowledgement and inspect current tab state rather than trusting event URL metadata. Ignore completion from the extension opener/about:blank; handle loading/pending URLs, cached pages, and events arriving during reads. When metadata is absent, probe the permitted document. Keep permission failures, actual redirects, and missing/ambiguous DOM controls distinguishable.

## Packaging and changes

`npm run package:release` preserves the ordinary build workflow, runs build/validate and creates verified Firefox/Chrome ZIPs, an allowlisted source ZIP and checksums in ignored `release/<version>/`. It does not sign or upload. See [distribution](distribution.md) for reviewer build instructions and unlisted signing.

`src/backup.ts` defines version-1 full backup validation/canonicalization and merge restore. `backup.html` / `src/backup-page.ts` provide a persistent tab with file review and explicit confirmation, launched from the popup's collapsed Backup & restore disclosure. `downloadBackup` and `restoreBackup` require the same runtime sender ID and exact backup-page URL. Backup reads share the storage queue; the download dialog stays outside it. Restore revalidates in the background, blocks active runs, and uses one storage.set for snapshot/preferences and each included ID's complete local state. Absent counterpart records become null (all existing validated readers ignore them); no storage.clear/remove window is introduced. Unmentioned local IDs remain. Undo/run/cache/unknown fields never enter backups. `npm run test:backup:browser` exercises synthetic restore and restart in an isolated profile, not the user's Firefox migration.

Both packages use Manifest V3 and exactly four API permissions plus the SCOPE host. Firefox 142+ uses background.scripts; Chrome 120+ uses a background service_worker. The toolbar uses popup.html; viewer.html and posting.html are local pages. Assets are bundled; no remote libraries are loaded.

Popup, viewer and posting pages declare the packaged 32px PNG favicon for browser tabs. Scoped-authored titles use a colon instead of an em dash, and blank-field placeholders use a plain hyphen. Captured posting text and raw exports are preserved. Package validation checks tab-icon declarations/assets and title punctuation.

Edit sources, not dist. Keep package.json, the root package-lock versions, and the generated manifest version in scripts/build.mjs aligned when releasing. After rebuilding, reload the extension and reopen its pages. Do not make a behavior/version change merely to edit documentation.

Keep the source CSV ignored and unchanged. Do not commit account markup, session/form/action values, downloaded site libraries, or real data fixtures. The original browser save and companion assets were intentionally removed.

## Technical references

Semantic result rows paint a 2px muted green bottom bar with a width of clamp(score,0,1) × full row/card width using a positioned pseudo-element and --relevance-width. Preserve row height and sticky title cells. Exact scores remain in row hover tooltips and sr-only title text, independent of column sorting. Query edits remove stale bars, widths, tooltips and accessible labels immediately during debounce; keyword/error fallback has no bar. Inclusion uses a fixed 0.10 cosine floor with full-literal-match exceptions. See [semantic search](semantic-search.md).

Optional semantic search lives in src/semantic-model.ts (text/cosine/contracts), src/semantic-engine.ts (incremental inference/ranking), src/semantic-cache.ts (disposable IndexedDB), src/semantic-worker.ts (local-only model/runtime configuration), and src/semantic-client.ts (worker lifecycle/revisions). Viewer loading is lazy and preserves keyword fallback, exact filters and stale-response protection. scripts/semantic-assets.mjs prepares pinned model/runtime assets before build; npm run setup:search can prepare them separately. Worker imports resolve to the packaged self-contained Transformers runtime; no duplicate WASM bundle is emitted. See [semantic-search contract](semantic-search.md).

[Agent invariants](../AGENTS.md), [DOM adapter evidence](scope-page-structure.md), [data contract](data-format.md), and [browser acceptance](acceptance.md) are current references. [Historical notes](history/acceptance-history.md) explain abandoned approaches but are not implementation requirements.

## Interface conventions

Primary organization/location facets precede flag filters and the Deadline display disclosure. Supporting filter/city explanations use native disclosures. Fresh preferences omit status columns; render status badges beside titles only when the corresponding column is absent, retaining explicit existing column selections. Icons use local SVG paths with currentColor and decorative ARIA semantics; actions retain accessible text. Shared toolbar sizes and radii preserve dense desktop rows, with 44px coarse-pointer controls and hover styling limited to hover-capable pointers.

The viewer combines brand/collection metadata, collection tabs, List/Globe controls and exports in one compact header. Controls wrap in DOM order at narrow widths; truncated metadata retains its full text in a title tooltip. Keep one export menu with unique download IDs. Collection navigation uses ordinary same-tab links, retaining native modifier-click/new-tab behavior; posting-title links still open separately.

The popup puts the collection first and distinguishes it from the Saved library; export/setup disclosures keep its ordinary state compact. The viewer's primary search stays visible, while Search options holds scope/exclusions and indicates active settings. Filter-option sorting is stored per group in facetOrder within existing version-1 preferences, distinct from result sorting. Counts represent the full saved collection. Keep old preferences compatible, retain list-search text while removing chips, and clear it on Clear filters. Disclosures/menus must remain keyboard-accessible; viewer menus dismiss on outside click/Escape. Details uses a responsive field grid, and title links retain a visible green new-tab cue before the position name.

Save and a labelled ellipsis disclosure share a consistent alignment zone at the end of each title cell. There is no reserved actions column; expanded Details spans exactly the selected posting columns. Menus use manual native popovers in the browser top layer, so table overflow cannot clip them and opening one cannot change row geometry. Position from the disclosure's viewport rectangle, clamp to viewport edges and flip above when needed. Only one row menu opens; outside click/Escape dismisses it, as do scrolling and resizing. Restore focus after rendering and keyboard dismissal. jsdom verifies logical disclosure/focus state, while a browser must verify top-layer geometry. Compact desktop rows use shared padding/control-size tokens; coarse pointers receive larger targets. Desktop title cells stay visible while scrolling horizontally. The introductory instruction line and decorative search heading are omitted; the search input retains an accessible name. Below 600px rows use labelled cards with the same chosen columns; sorting remains available in Sort & columns. At 900px and below the existing filter panel moves into a native modal dialog, returned to its sidebar on wider windows. Done, Escape and backdrop dismissal return focus to Filters. Results and pagination retain their own viewport space. Replaced sort controls retain focus; chip removal focuses an adjacent chip or search, and removed library rows focus the next available action or result count.

Saved removal returns an opaque undo token. The existing persistent removal record can temporarily hold a validated Saved copy plus token and five-minute expiry. undoSavedRemoval runs in the storage queue, validates extension sender, numeric ID, matching current token, expiry and copy, and prefers validated current posting fields when available. Undo retains a local Saved copy and clears the exclusion; newer same-ID removals invalidate older tokens. getLibrary returns only the ordinary exclusion fields and drops expired undo copies on read. Undo copies never authorize posting opening. The notification stays available until dismissal, a newer removal, or expiry; failures preserve the removal and report an error.

## Local Saved and Applied libraries

`src/local-library.ts` validates/canonicalizes independent notes/relevance annotations and namespaced custom Applied records (see the data contract). Background `setAnnotation`, `setCustomApplied`, and `deleteCustomApplied` commands require the same extension identity and exact viewer page path, with optional query parameters, and run in the storage queue. Partial annotation changes merge into current stored notes/mark to prevent unrelated writes from clobbering each other. `setSaved` can include notes; its retained copy and annotation share one storage.set. Refresh touches neither annotations nor custom entries. Library replies and viewer storage subscriptions include both prefixes.

Applied combines numeric records with custom entries converted to internal Posting-shaped rows for search/facets/map/sort. Snapshot validation remains numeric-only; custom IDs use `custom:<UUID>`, cannot collide with SCOPE IDs, and never expose a SCOPE title link, Save or Mark applied action. Custom notes live on the custom record; relevance uses its independent annotation. Numeric annotations retain notes across Saved/Applied changes.

Notes/custom editors use labelled native modal dialogs, plain text rendering, bounded input, in-dialog errors, disabled duplicate submission, retained drafts on storage failure, and focus recovery. A temporary marking mode exposes labelled checkboxes and switches to list view. Not-relevant filtering precedes pagination/map aggregation; not-relevant-last groups precede expired-last and normal sorting. Marks are reversible through row actions or checkboxes. Full backups include the new durable records, strip unknown fields and merge complete per-ID state. `node scripts/test-library-browser.mjs` checks these flows using synthetic state in a disposable Edge profile.

`src/saved.ts` validates saved:<id> (version, savedAt, posting) and applied:<id> (version, appliedAt, posting). getLibrary returns validated records; getSaved remains compatible. setSaved/setApplied validate extension senders, numeric string IDs, and booleans. Mutations share the storage queue; removing a mark deletes only its per-ID key.

Saved unions local saves with current SCOPE-shortlisted rows, deduplicating IDs and excluding Applied. Remove from Saved excludes either kind of entry through savedRemoved:<id> and removes any saved copy; it never changes the captured SCOPE flag. Save clears the exclusion and stores a local copy. Applied is explicitly user-marked, never inferred from clicks or applicationStatus. Undo restores Saved membership when applicable.

Successful snapshot commits atomically update present-ID copies in both libraries while preserving timestamps; missing IDs remain retained. Failed/canceled runs leave them intact. Rendering prefers current values, labeling retained-only rows without inferring expiry. The opener accepts current, validated Saved, or validated Applied membership.

All/Saved/Applied preferences are separate. All support filtering/list/map and raw full-snapshot exports. Storage subscriptions watch snapshot and Saved/Applied/removal prefixes with stale-read protection.

## Deadline interpretation

`src/marking.ts` owns optimistic relevance painting and mouse/pen range gestures. Visible rows are indexed by ID; marking patches only row class, checkbox state and the menu label. It never rebuilds the table, facets, search index or semantic ranking for a mark. Snapshot/shortlist membership uses Sets instead of repeated row scans during full rendering. Relevance-only storage events validate changed annotations and patch visible rows in marking mode; other library changes retain the ordinary stale-read-protected reload. Annotation revisions and pending relevance overrides protect concurrent reads/edits while retaining independently updated notes.

`setRelevance` accepts up to 1,000 unique validated ID/boolean changes from the same extension viewer. The background validates snapshot/library/annotation membership once per batch, merges each mark into its stored notes, and commits one storage.set only after all entries validate. The writer coalesces edits over 40 ms, serializes batches, protects newer edits from earlier replies, observes persisted cross-tab values, and rolls failed edits back to the latest confirmed value. Done, pagehide and hidden-document transitions flush pending edits. Row gestures exclude links/buttons/disclosures/form controls, preserve native touch scrolling and keyboard checkbox changes, fill skipped rows, visit each ID once, and suppress the click following a pointer stroke. Pointerup/cancel/blur end the stroke. Hiding/order still wait for Done.

Marking mode adds a leading checkbox-only table cell and visually blank header, with accessible names on the header and individual checkboxes. Details colspan includes this extra column; sticky title cells offset by its width. Narrow cards keep the checkbox to the left of the title without a visible label. Entering mode captures relevance membership and result order; edits use that baseline for filtering/ranking until Done, while live marks still dim rows. Annotation storage reloads preserve the current page/expanded rows in mode, and checkbox focus restores with preventScroll. Done switches back to current relevance marks, so ordinary hiding/sorting resumes.

The user requested browser-local timezone inference. isExpired converts validated calendar/time components to a local Date, including AM/PM, and compares against now. Same-day expiry follows the time; missing/unparseable deadlines never expire. Raw exports preserve text without inferred timezone metadata. Expired-last ordering precedes chosen result sorting and can be disabled; Hide expired is optional. Version-1 preference defaults remain compatible. The open viewer reevaluates deadlines each minute.

## Location explorer

src/location-model.ts handles offline matching, grouping, unresolved records, and area-proportional radii. src/globe.ts lazy-loads local geography, draws SVG with d3-geo/topojson-client, and provides rotation/panning/zoom, globe/flat projections, keyboard controls, and city/unmapped buttons. City selection returns to the list with matching source locations selected. Group across all filtered matches, not the visible table page. Keep ambiguous locations selectable outside the globe and never upload posting strings for geocoding. See [geography reference](geography.md) for regeneration, file-size limits, licenses, and boundaries.

## Greater Vancouver convenience group

src/location-groups.ts defines six BC cities, including an explicit province-free North Vancouver exception observed in SCOPE and a reserved group:greater-vancouver filter token. It does not model an official boundary. groupGreaterVancouver is an optional version-1 preference, default false, separate per view and preserved by Clear filters. Facet choices/counts and globe aggregation use the same matcher; raw postings/search/export fields are untouched. Enabling converts selected member locations to the group; disabling expands to available source locations. A grouped globe click selects the group. Globe aggregation uses the bundled Vancouver centre (fallback: first resolved member centre); a recognized member whose standalone name is unresolved can use that bundled group centre. Other unresolved rows retain existing unmapped behavior.

Globe boundary detail is adaptive: base countries.json at overview zoom, cached/lazy countries-50m.json at 2×, countries-10m.json at 6×. Select current level on each draw; retain lower-detail fallback on loading/failure and never continuously retry a failed asset. Package validation checks all topology files and Mozilla's size limit. Geography regeneration copies all three from installed world-atlas.

## Location formatting and Saved removals (0.5.3)

src/location-text.ts normalizes missing comma/dot separators before Canadian province codes and ignores punctuation-only comma fields. Location matching and Greater Vancouver membership share it. City-suffix aliases and shortened Canadian Greater-prefixed names still require one candidate and agreement of all substantive region/country hints.

getLibrary includes validated savedRemoved:<id> records ({version:1,id,removedAt}). Removal writes the exclusion before deleting the saved copy; exclusions take precedence if both temporarily exist. Save writes a retained record then clears the exclusion. Mutations remain serialized; collection commits do not modify exclusions. Removal records cannot authorize opening absent postings. Applied undo respects prior removals.

## Relative deadlines and compact controls (0.5.4)

The three deadline checkboxes share a compact grid with 2px internal spacing. relativeDeadlines is a version-1 boolean preference (false by default), independent per view and preserved by Clear filters. localDeadline is the shared local-time conversion used for expiry and relative display. relativeDeadline applies only to future values through fourteen local calendar days; it formats rounded remaining days/hours/minutes, with a sub-minute label. The table retains the source deadline in title/aria-label; Details, sorting/filtering, snapshot, and exports retain absolute source values. Relative labels refresh each minute and when the document becomes visible.

## Reciprocal deadline hover (0.5.5)

Relative table cells expose the absolute source date on hover; absolute cells expose a relative counterpart even outside the two-week display window or in the past. Details keeps absolute values and also exposes relative hover. relativeDeadlineTime computes the unrestricted counterpart; relativeDeadline retains the two-week display limit. deadlineHover updates title/aria-label on creation and mouseenter/focus so absolute-view hover remains fresh without periodically rerendering the table. Unknown values have no invented counterpart.

## Generated geography assets

scripts/geography.mjs checks generated assets, downloads/caches public GeoNames inputs only when necessary, verifies cached SHA-256 hashes, writes size-limited city chunks, and copies lockfile-pinned world-atlas boundaries. build.mjs calls ensureGeography before deleting previous dist output. setup:maps prepares missing assets; update:maps explicitly downloads a newer extract. Ignore public/maps/*.json and .cache/, retain SOURCES.txt and scripts. Geography tests use synthetic downloads; geometry tests read the dependency topology, so fresh npm ci + npm test requires no map download. There is no runtime network change.

## Field search and company navigation

Search scopes are all, title, organization, division, location and id. Literal queries/exclusions use only the selected field, with existing case/accent folding and title cleanup. Semantic scopes embed only the selected text; id scope uses keyword matching without inference. Search-option counts include every non-default scope. Snapshot refreshes preserve filters silently.

Company buttons select one exact organization in the active collection and clear search constraints while retaining sort/display preferences. An in-memory return stack saves preferences, pagination, list scroll, map/list mode and facet-search text. Back restores these against current collection data, clamps pages through ordinary rendering, and returns focus to the company button or query. Pending query debounce is canceled on company navigation/return; semantic response revisions remain authoritative, and completed ranking does not reset restored pagination. History is tab-local and is not persisted with preferences.

The search-mode selector keeps its label available to assistive technology without showing a heading above the dropdown.

Clear filters is hidden until a query, exclusion, non-default search scope, selected facet, flag, date/count bound or expiry/unknown-deadline filter is active. Display preferences and facet-list search alone do not reveal it.
