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

The viewer validates the latest snapshot and builds in-memory search/sort indexes. All filtering runs across the snapshot before local pagination. Default sorting is deadline ascending with numeric ID descending as the tie-breaker; blanks/unknowns stay last. Preferences use a separate versioned key. A successful snapshot event rebuilds indexes, preserves filters, and resets local pagination; stale reads cannot overwrite newer data.

Downloads are background-owned and always serialize the entire successful snapshot. Closing the popup or invoking Save As must not invalidate file data.

### Posting opening

A title click creates posting.html?id=<numeric ID>. The opener checks SCOPE host access; the setup button requests it from a user click and retries on a grant. The background validates opener identity and snapshot membership before navigating that same new tab to SCOPE's overview. The adapter finds the Search Posting panel, sets the native input value, dispatches input/change events, and clicks its Search control.

No source-tab traversal, form replay, or link-metadata refresh is needed. Opening a position can run independently of collection because it uses a separate tab. Posting navigation and downloads run outside the collection transition queue.

Wait for tabs.update acknowledgement and inspect current tab state rather than trusting event URL metadata. Ignore completion from the extension opener/about:blank; handle loading/pending URLs, cached pages, and events arriving during reads. When metadata is absent, probe the permitted document. Keep permission failures, actual redirects, and missing/ambiguous DOM controls distinguishable.

## Packaging and changes

Both packages use Manifest V3 and exactly four API permissions plus the SCOPE host. Firefox 142+ uses background.scripts; Chrome 120+ uses a background service_worker. The toolbar uses popup.html; viewer.html and posting.html are local pages. Assets are bundled; no remote libraries are loaded.

Edit sources, not dist. Keep package.json, the root package-lock versions, and the generated manifest version in scripts/build.mjs aligned when releasing. After rebuilding, reload the extension and reopen its pages. Do not make a behavior/version change merely to edit documentation.

Keep the source CSV ignored and unchanged. Do not commit account markup, session/form/action values, downloaded site libraries, or real data fixtures. The original browser save and companion assets were intentionally removed.

## Technical references

[Agent invariants](../AGENTS.md), [DOM adapter evidence](scope-page-structure.md), [data contract](data-format.md), and [browser acceptance](acceptance.md) are current references. [Historical notes](history/acceptance-history.md) explain abandoned approaches but are not implementation requirements.
