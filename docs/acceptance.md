# Browser acceptance and verification

Current implementation: **0.7.0** with local notes, custom Applied entries and relevance marking. Last documentation review: **October 10, 2026**. This is the current checklist; [historical records](history/acceptance-history.md) preserve earlier versions and abandoned approaches.

Automated tests, saved markup, and local previews do not establish live signed-in compatibility. User reports confirm the described workflow, not every edge case below.

## Recorded evidence

Latest local-feature verification: **186 tests across 24 files pass**, TypeScript/build and both Firefox/Chrome package validations pass. The final isolated Edge library check also confirms custom-entry notes remain visible in Details after relevance marking. Live Firefox/Zen and actual Chrome feature acceptance remain pending.

The final 1,000-row Edge repeat measured **34.4 ms for 20 synchronous toggles**, retained every row node, issued no library reloads during marking, and confirmed drag/row-click marks and unmarks persisted after viewer reload. The earlier 123.3 ms run below occurred during concurrent checks; neither measurement guarantees live-browser performance.

- **Responsive row/drag marking — October 10, 2026:** marking updates existing row nodes synchronously; annotation-only storage events no longer reread the library, rebuild facets/indexes or restart semantic ranking. Whole-row background clicks and mouse/pen dragging paint a range; skipped rows are included, each row is visited once per gesture, checked-first gestures unmark, and the following click is suppressed. Links/actions and touch scrolling/keyboard checkboxes remain native. Background batches validate all IDs before one write, preserve notes, and handle stale acknowledgements, concurrent metadata and failed-write rollback. Only open menus are examined for outside-click dismissal. Automated regressions cover these contracts. An isolated Edge check with 1,000 synthetic rows retained row nodes, made zero library reloads while marking, and exercised actual mouse mark/unmark drags and row clicks. Twenty synchronous checkbox changes took 123.3 ms in one local run; this is a synthetic measurement under concurrent work, not a full performance guarantee. Live Firefox/Zen responsiveness and touch/pen hardware checks remain pending.

- **Checkbox column and stable marking — October 10, 2026:** marking mode uses a narrow left column with a visually blank header and checkbox-only cells; accessible names remain. Sticky title offsets, narrow card layout and expanded Details colspan include the extra column. Marks dim immediately while relevance filtering/order use the mode-entry baseline until Done. Newly added badges also wait until Done to avoid changing row heights. Viewer regressions cover deferred hiding/order, markup/colspan and storage-update page/scroll preservation. The isolated Edge check verifies unchanged desktop row height when entering mode, identical row pixel positions and scroll position when marking on page 2 with hiding enabled, and hiding after Done. Desktop/narrow screenshots were inspected; live Firefox/Zen visual acceptance remains pending.

- **Notes, custom Applied and Not relevant — October 10, 2026:** private posting notes support independent editing and Save posting & notes, with text-only Details rendering and draft preservation on failure. Applied supports custom applications with a calendar date, organization, location and notes, plus editing/deletion. Custom IDs are distinct from SCOPE IDs and have no SCOPE title link or numeric library actions. A temporary marking mode exposes checkboxes; marks dim rows and sort last by default, with separate hide/order preferences per view. Full backups include annotations/custom entries, and collection exports remain unchanged. Automated coverage checks serialized partial updates, sender/ID/input validation, save with notes, safe text rendering, hiding/focus/restoration, custom creation/editing, numeric/custom sorting and backup/restore. An isolated Edge profile exercised notes/save, mark/hide/reload, custom creation/editing/persistence and 390px light/dark forms with no document overflow. Screenshots were inspected. This is synthetic local evidence; live Firefox/Zen and Chrome acceptance of these features remains pending.

- **1000-row pagination default - October 10, 2026:** fresh or missing/invalid page-size preferences default to 1000; 25/50/100 choices and existing remembered selections are retained. The viewer regression exercises the new default and switching to 50 with next-page/filter behavior. All 159 tests, TypeScript/build, and Firefox/Chrome package validation passed. Full-collection performance and live Firefox/Chrome acceptance of 1000-row pages remain pending.

- **Muted relevance bars and quieter search feedback - October 10, 2026:** per user request, bar color now mixes 40% theme green with 60% surface color, and the normal ready/idle semantic helper message is removed. Loading, failure/retry and unavailable-cache messages remain. Ranking and proportional bar lengths are unchanged. Live Firefox/Zen appearance acceptance remains pending.
  Verification: **159 tests pass**, TypeScript/build and both package validations pass. The isolated Edge extension check confirmed completed search has no helper message, unchanged proportional bar widths, no external requests, and viewport-fitting narrow cards. Light/dark screenshots were inspected; this is synthetic local evidence.

- **Relevance bars and tab branding - October 10, 2026:** replaced visible relevance numbers with a 2px green bottom bar whose width is clamp(score,0,1) × full result-row/card width. Exact scores remain in hover tooltips and screen-reader text; query edits clear bars immediately. Removed em dashes from Scoped-authored interface titles/placeholders and declared the packaged 32px tab icon on viewer/popup/opener pages. The isolated Edge extension check measured proportional bars on desktop and 390px cards, verified visually hidden score labels and a successfully fetched extension favicon, and attempted zero external requests. Screenshots were inspected. Earlier visible-label evidence is superseded; live Firefox/Zen bar/favicon acceptance remains pending.
  Verification: **159 tests pass across 20 files**, TypeScript/build and both package validations pass, and Mozilla lint reports zero errors, warnings or notices. Captured posting text and exports retain original punctuation.

- **Relevance labels and broader recall — October 10, 2026:** per user request, semantic inclusion now uses a fixed cosine floor of 0.10 with full-literal-match exceptions, replacing the previous 0.20/adaptive cutoff. Titles display the actual ranking score to three decimals, independent of column sort. Query edits immediately remove old score labels. Earlier synthetic evidence excluding weak designer overlap describes the former cutoff and is superseded for this behavior. Live Firefox/Zen acceptance remains pending.
  Verification: **159 tests pass across 20 files**, TypeScript/build and both package validations pass. Isolated Edge extension checks show scores on every semantic row, recall all four synthetic rows for “server development” (including cosine 0.122), retain stronger-first ranking and exact Vancouver filtering, and make zero external requests. The inspected 390×844 preview fits the viewport with visible pagination and score labels. Mozilla lint reports zero errors, warnings or notices. These checks are synthetic local evidence, not signed-in SCOPE acceptance or a representative relevance evaluation.

- **Offline semantic search — local/automated October 10, 2026, 0.6.0:** tests cover stable text hashes, title-only scope, cached/changed inputs, malformed vectors, IndexedDB persistence/pruning/fallback, numeric ID lookup, relevance with exact filters/exclusions/expiry, old preference defaults, query/snapshot revisions, cancellation and failure/retry. Both built packages verify pinned model integrity, runtime/licenses, self-only connections/workers and WASM CSP. An isolated headless Edge extension profile with four synthetic postings recalled Backend Software Engineer for “server development”, ranked Server Infrastructure Developer first, preserved exact Vancouver filtering, reused persistent vectors after reload, and excluded weak designer overlap for “backend engineer”. External HTTP(S) requests were blocked and none were attempted. Initial four-row search took about 3.5 seconds on this machine; a later query took about 1.4 seconds including input debounce/test waiting. These are small synthetic measurements, not performance guarantees for a full collection. The 390×844 preview had document width 390 and visible pagination. Firefox/Zen runtime acceptance, actual Chrome browser acceptance and representative relevance/memory/large-library measurements remain pending.

- **Filter hierarchy and status cues — local/automated October 10, 2026:** 134 tests pass, including title status badges and explicitly selected status-column preservation. Synthetic Edge previews cover eight viewport sizes, revised sidebar disclosures, five-column status-badge presentation, stable row menus, focus flows and narrow cards. Desktop sampled rows remain 39px; pagination stays within the 320×568 viewport. Touch hardware, 200% zoom, RTL and live Firefox/Chrome behavior remain pending.

- **Compact viewer header — local October 10, 2026:** brand, collection tabs, view switch and export menu share a 57px toolbar in the synthetic 1920×986 Edge preview. Narrow layouts wrap the controls; the 320×568 preview retains pagination within the viewport. This is local layout evidence, not live extension acceptance.

- **Density and stable action menus — local/automated October 10, 2026:** all 133 tests pass; TypeScript/build and both browser package validations pass. In a synthetic dark 1920×986 Edge preview, 12 sampled rows were 39px tall with the same 96px action zone and shared horizontal alignment. Before/after measurements were identical when opening a menu; the 160×82px popover stayed inside the viewport. Opening another row left exactly one popover visible; Escape closed it. The existing eight-viewport preview also exercised sorting, chip removal, Details, Saved removal/Undo, filter-dialog dismissal and layout switching. Native top-layer behavior remains pending live Firefox/Chrome verification.

- **Follow-up design cleanup — local/automated October 10, 2026:** removed the introductory instruction line and decorative search heading requested in the screenshot, retaining the search input's accessible name. Removed the actions header/cells; Save and the labelled ellipsis control now sit directly beside each title, with compact desktop rows and correctly spanning Details. All 133 tests pass; TypeScript/build and both package validations pass. A dark 1920×986 synthetic preview with seven selected data columns fits without horizontal scrolling; narrow cards and sorting/chip/Details/menu/removal/Undo focus flows were exercised locally. These are local preview checks, not a new live Firefox/Chrome acceptance report.

- **Frontend refinements — local/automated October 10, 2026:** 133 tests pass across 15 files; TypeScript/build and both package validations pass. Mozilla lint reports zero errors, warnings, or notices. Regressions cover sorting/chip/row focus, nested-menu Escape, Undo restoring retained Saved records, sender/token/expiry/copy validation, stale-token rejection, and latest captured fields. A synthetic 120-row headless Edge preview covered 1440×900, 1024×768, 480×800, 390×844, 800×450, 320×568 and 720×450. At 320×568 the result scroller grew from 63px to 238px, with labelled cards and pagination within the viewport. At 1440×900 the default table's scroll width equals its client width (1080px). At 1024×768 horizontal table scrolling remains intentional, with posting titles and Save kept visible. Filter-dialog dismissal, row actions, removal/Undo, light/dark themes, empty states and the loaded globe were locally exercised; this uses an API shim and synthetic postings, not signed-in extension acceptance. Live Firefox/Chrome verification remains pending.

- **Firefox collection — user-confirmed:** the original collector worked; the screenshot shows four pages and 764/764 postings collected. The supplied exported CSV is evidence of CSV output. The user did not separately report JSON checks or every collection edge case.
- **Firefox/Zen posting opening — user-confirmed:** the user resolved the access error by choosing Always Allow on scope.sciencecoop.ubc.ca and reported that opening works.
- **Version 0.3.3 permission setup — user-confirmed October 10, 2026:** after the new Allow SCOPE access button/fallback instructions were implemented, the user reported “It works.” The report does not specify whether they used the button or manual fallback; neither path's full browser/denial matrix is assumed passed.
- **Automated implementation verification — passed on 0.3.3:** 82 Vitest tests; TypeScript/build; Firefox and Chrome package/manifest/assets/icon validation; official Mozilla lint with zero errors, warnings, or notices. Tests cover collection/retention, export/download behavior, background lifecycle, viewer model/DOM/preferences, posting navigation races, and permission grant/deny/failure/manual recovery.
- **Local viewer layout — measured on 0.3.1:** isolated headless Edge preview using the supplied 764-row CSV had document dimensions equal to viewport dimensions at 1920×986, 1280×720, and 800×1000. Pagination was visible and each page rendered 50 title links. This is local preview evidence, not signed-in Chrome acceptance.
- **Saved-page parsing — historical evidence:** all 200 saved rows reconciled with the 763-result total/range. Synthetic fixtures preserve the relevant structure; the original saved page/assets were removed.

**Still pending:** live Chrome collection/opening/download smoke tests; individual unreported Firefox edge cases; the complete grant/deny/fallback matrix; popup closure during permission prompts or Save As; repeated live refresh/count reconciliation. No signed-in browser acceptance was performed by the agent.

## Shared setup and happy path

Run this checklist in Firefox/Zen and Chrome, recording browser/version, extension version, result count, and which checks were exercised.

- Load dist/firefox/manifest.json temporarily in Firefox 142+, or dist/chrome unpacked in Chrome 120+. Reload after building and reopen extension pages.
- Open SCOPE while signed in. Confirm the toolbar opens the green-icon popup without a new control tab; View postings opens the local viewer tab.
- Start on a later results page of a multi-page search. Confirm collection returns to page 1, keeps filters/sort, traverses every page, leaves SCOPE on the final page, and reconciles the unique snapshot count with the total.
- Confirm collection opens no posting details and clicks no Apply, Shortlist, or Not Interested action.
- Inspect full titles, accented text, blank statuses/counts, new/shortlisted flags, and original deadline values. Download CSV and JSON; reconcile parsed records, unique IDs, and metadata.
- Refresh successfully and confirm collection time/data change. With the viewer open, confirm successful refresh updates results and retains filters; failed/canceled refreshes keep the previous snapshot.

## Permissions and posting titles

- With SCOPE access withheld, click a viewer position title. Confirm the opener stays in setup without navigating or automatically prompting.
- Click Allow SCOPE access and grant it. Confirm the intended posting opens automatically in the same new tab through the overview's Search Posting panel.
- Deny the prompt. Confirm no posting navigation and visible Firefox/Chrome instructions. Exercise request failure/manual recovery and Try again.
- Firefox/Zen: select Always Allow on scope.sciencecoop.ubc.ca. Chrome: select access on that site or add it under On specific sites. Confirm Only When Clicked is distinguished from persistent access.
- Check popup closure during a permission prompt, then reopen and retry. No duplicate collection or automatic prompt loop should occur.
- Open positions from the first, middle, and last snapshot pages, including an older snapshot without postingLink. Close the collection tab and repeat while signed in.
- Confirm title text itself is the link, matching trailing ID/code is hidden, employer requisition numbers remain, and Details retains ID/raw fields. Source search/filter/page must remain untouched; no application/shortlist action is submitted.
- Try opening a posting during collection: the independent new tab should work without blocking or navigating the collector.
- Exercise expired login, unavailable ID, missing/ambiguous search panel, external redirect, and closing the opener. Confirm permission, session, and structure errors remain distinguishable.

## Collection and download edge cases

- Close/reopen the popup during collection. Confirm traversal continues, progress restores, and a second run in the same tab is prevented.
- Cancel, then verify no further navigation and that previous exports remain available. An in-flight page may finish loading.
- Close/reload/navigate the source tab; expire the session; or change search/sort mid-run. Confirm clear failures and preservation of the previous successful snapshot. Same-total live changes are not guaranteed detectable.
- Test a one-page search and an empty search.
- Invoke Save As from the popup, let it close, and confirm both downloads succeed. From another website, confirm collection is disabled while viewer/exports remain usable.
- Inspect browser extension errors, especially Chrome service-worker errors in chrome://extensions.

## Viewer checks

- Combine words, phrases, exclusions, accents, searchable facets, blank status, flags, inclusive dates, and numeric limits. Confirm queries cover all postings before local pagination.
- Test ascending/descending sorts, blank/unknown values, deterministic ties, optional columns, Details, copy ID, no snapshot, no matches, and invalid snapshots.
- Reopen to verify preferences. Change filters/page size, refresh with the viewer open, and verify stale reads do not revert updated data.
- Check keyboard/focus, light/dark themes, zoom, long titles, narrow layouts, independent sidebar/results scrolling, and always-visible pagination.
- Confirm downloads remain full-snapshot exports even when the viewer is filtered.

## Updating this record

Record the actual browser/version, extension version, date, actions checked, result counts, and failures. Keep user reports distinct from agent-run checks, simulations, and local previews. Do not promote a general “works” report into a pass for each pending check. Archive superseded approaches under history and keep this checklist aligned with current code.

## Version 0.3.4 interface refresh

The popup prioritizes saved postings/View postings, folds exports and site setup into disclosures, hides idle progress, and clarifies where collection is available. The viewer uses a larger primary search, Search options for scope/exclusions, an Export postings menu, visible result ranges, compact field-grid Details, clearer title links, and new/shortlisted controls above long lists. Search options indicates active settings; transient menus close on outside click or Escape.

Filter options support Name A–Z, Name Z–A, Most postings, and Selected first. Orders are remembered per group with safe defaults for older preferences. Selected counts, readable count badges, empty-list search guidance, and preserved option-search text during chip removal improve navigation. Option counts still refer to the full saved collection; result sorting remains separate.

Verification: 85 tests pass, including order persistence, count/name/selection ordering, older preference defaults, list-search preservation/reset, and idle popup state. TypeScript/build, both package validations, and Mozilla lint pass. Collection, posting navigation, permissions, and snapshot/export schemas are unchanged.

Final local headless Edge previews using the existing 764-row CSV confirmed no outer document overflow and visible pagination at 1920×986, 1280×720, 800×1000, and 480×800. A 380×600 popup with saved data and granted access fits without scrolling while its disclosures are collapsed. Expanded Details was also inspected at desktop size. Tables scroll horizontally when columns exceed a narrow viewport; the page itself remains within the viewport. Setup/export disclosures may require popup scrolling when expanded. These previews use a local API shim and do not establish live extension acceptance.

Live checks: reload 0.3.4 and verify popup collection/progress/cancel, export disclosures/downloads, access setup, filter-option orders and persistence, Search options, column menus, keyboard dismissal, Details, and title opening in both browsers. Earlier user confirmation applies to the working collector/opening/permission flows, not this new interface.

## Version 0.4.0 Saved library and offline globe

Local Save/Saved controls and a Saved viewer are implemented. All/Saved/Applied links navigate in the current tab by default; native modifier-click can open another tab. Saved keys retain a captured posting copy, update only on successful collection commit, and survive disappearance from the latest search. Per-ID background mutations avoid overwriting another tab's saves, and current/Saved tabs update from storage events. Missing-current records are labeled Not in latest search without inferred expiry. The opener accepts validated retained records; Saved remains accessible without a valid current collection. SCOPE shortlist/application state and collection export schema are unchanged. Current exports still contain only the latest SCOPE collection; the Saved view explicitly labels that limit.

Globe/flat map uses bundled GeoNames/Natural Earth geography with no geocoding upload or additional permission. Projection code/data load on demand. Rotation/panning, zoom, keyboard controls, accessible circles, and city/unmapped list buttons are supported. Bubble area is proportional to count, and the map groups the entire filtered set rather than one local page. City selection returns to the list with matching source location variants selected. Ambiguous, broad, and missing places stay in the unmapped list.

Verification: 100 automated tests pass, including local save mutation guards, independent saves, current/retained field selection, atomic copy refresh/failed-run retention, malformed records/current snapshots, cross-tab rendering, retained opening, country/region/accent matching, ambiguity, City aliases, complete mapped/unmapped accounting, and area scaling. TypeScript/build, both browser package/geography validation, and Mozilla lint pass. The large city file was split into five chunks below Mozilla's parser limit.

Local headless Edge preview with the supplied 764-row CSV resolved 663 postings into 85 cities and accounted for 101 unmapped postings. Keyboard rotation, zoom, flat projection, city-to-list filtering (132 matches in the exercised group), local Save, Saved reopening after navigation, and Unsave were exercised. The Saved view screenshot was inspected. Desktop/narrow/phone previews preserve the viewport with results/globe content scrolling within the page. Tests and the local API shim are not signed-in extension acceptance.

Live checks still needed in Firefox and Chrome:

- Save several positions in the viewer; verify Saved opens separately, has independent filters/preferences, and Save never changes SCOPE. Reopen browser/extension as appropriate and check persistence within the profile.
- Refresh with changed fields, then use a different search excluding a saved ID. Confirm latest captured values, retained records/labels, and ability to attempt ID opening. Cancel/fail a refresh and confirm saved copies stay unchanged.
- Open two viewer/Saved tabs; save/unsave concurrently and confirm both react without dropped independent records. Test storage refusal and malformed records without deleting valid saves.
- Verify globe/flat drag, wheel/button/keyboard zoom, hemisphere clipping, overlapping city clicks, list fallback, city-filter return, accents/region aliases, all-row counts, unknown locations, and Saved-only maps.
- Disable network after collection and confirm Saved/globe still work. Inspect extension network/errors for remote geocoding or tile requests; none should occur.
- Recheck collection, posting ID search, permission setup, popup controls/downloads, and the explicitly labeled full-collection exports from Saved.

## Version 0.5.0 Saved/Applied and globe refinement

Both packages build and validate. Local isolated Edge preview with the existing 764-row CSV confirmed 663 mapped postings in 85 cities, 101 selectable unmapped postings, inline hover location/count text, rotation/zoom/flat mode/city selection, a deduplicated Saved union (24 entries), marking Applied removes a Saved row, the Applied tab shows it, and Undo removes the mark. Desktop pagination fits the viewport. This is a local API shim, not signed-in extension acceptance.

Regressions cover Saved union/deduplication, Applied separation/undo, invalid library records, successful refresh/canceled retention, retained Applied rendering, same-day local AM/PM expiry, hiding/expired-last ordering, and inline globe labels/deep zoom. The user requested local timezone interpretation; raw exports remain unchanged.

Pending live checks: reload 0.5.0 in Firefox/Chrome; mark/undo across viewer tabs; refresh library copies; check local-time deadline passage; exercise 80× wheel zoom near the sphere edge, hover/focus, and narrower Saved/Applied layouts. No broader live success is inferred.

Final 0.5.0 automated verification: **109 tests pass across 13 files**; TypeScript/build and both package validations pass; Mozilla lint reports zero errors, warnings, or notices.

## Version 0.5.1 Greater Vancouver option

114 tests pass across 14 files; TypeScript/build and Firefox/Chrome package validation pass. Tests cover six-city BC matching/exclusions, selection widening/expansion, combined query filtering, preference compatibility/persistence, original locations, and globe grouping/count reconciliation.

An isolated local Edge preview with the supplied 764-row CSV produced 165 Greater Vancouver postings in both the location facet and combined globe circle. Hover text displayed the combined count; circle click returned 165 matching results with a readable group chip and original row locations. At 480×800, document width/height equaled the viewport. This remains local preview evidence; signed-in browser acceptance of this option is pending.

## Version 0.5.2 North Vancouver variant

The supplied CSV has 20 rows labelled North Vancouver, BC and two labelled only North Vancouver. The province requirement excluded the latter. An explicit province-free North Vancouver exception now applies consistently to facets/filtering/globe grouping and disabling-group selection expansion. Other bare ambiguous names and contradictory province hints remain excluded. Original text is preserved. Regression coverage checks both missing-province rows and group-centre fallback without losing counts.

0.5.2 also adds zoom-dependent offline map detail (50m topology at 2×; 10m at 6×). Local preview reconciled both corrected North Vancouver rows to **167** Greater Vancouver postings, loaded the 10m level, preserved group hover/click behavior, and kept the 480×800 page within the viewport. Offscreen country/island culling reduced a measured zoomed movement from ~501 ms to ~24 ms in the isolated Edge preview. These timings are one local measurement, not a browser-wide performance guarantee. Geometry regression compares the culled visible SVG path with full detailed geometry around Vancouver, the antimeridian, and a polar view. Detail-load failure retains the overview without repeated requests.

Final 0.5.2 checks: **117 tests pass across 14 files**, TypeScript/build and both package validations pass, and Mozilla lint reports zero errors/warnings/notices. A cursor-anchored local preview around Vancouver confirmed finer coastal/island geometry, the 167-posting label, and preserved selection; one movement measured ~69 ms there. Live Firefox/Chrome acceptance of detailed boundaries remains pending.

## Version 0.5.3 matching and Remove from Saved

Saved has a clear Remove from Saved action for local and SCOPE-shortlisted entries. Persistent local exclusions prevent refresh/Applied undo from restoring removed IDs; Save in All postings restores them. Regressions check removal, refresh persistence, restoration, unchanged SCOPE flags, validation, and sender/ID guards. Location tests cover missing separators, trailing punctuation, canonical City/Greater aliases, preserved source text, and invalid/ambiguous hints. Live Firefox/Chrome acceptance remains pending.

Final 0.5.3 verification: **122 tests pass across 14 files**; TypeScript/build and both package validations pass. A local isolated Edge preview with the supplied 764-row sample mapped **674 postings in 86 cities**, leaving 90 unresolved (11 additional mapped rows). It displayed Victoria/Sudbury/Québec results and exercised removing a captured SCOPE shortlist entry (23 → 22), reopening with the exclusion preserved, and restoring it through Save in All postings. This uses a local API shim, not live signed-in acceptance.

## Version 0.5.4 deadline controls

Reduced the checkbox gap with a compact Deadline display group. Added relativeDeadlines presentation for future deadlines through two weeks in browser-local time. Regression tests cover days/hours/minutes/sub-minute values, exact two-week boundary, expired/unknown/far deadlines, compatible preferences, source/Details preservation, and per-view preference persistence. Live Firefox/Chrome checks remain pending.

Final 0.5.4 checks: **124 tests pass across 14 files**, TypeScript/build and both package validations pass, and Mozilla lint reports zero errors/warnings/notices. A local isolated Edge preview measured a 2px gap between the expiry controls, showed relative deadline cells with their original text retained for hover, and kept the page within the viewport. The screenshot was inspected. This is local preview evidence, not live Firefox/Chrome acceptance.

## Version 0.5.5 deadline counterparts

Deadline hover works in both directions in the table; Details absolute dates show relative hover too. Regressions cover past/distant/unknown values, unchanged two-week display eligibility, both display modes, and updating the counterpart on hover after time advances.

Final 0.5.5 automated checks: **125 tests pass**, TypeScript/build and Firefox/Chrome package validations pass, and Mozilla lint reports zero errors/warnings/notices. Live browser acceptance of reciprocal hover remains pending.

## Generated geography build workflow

Geography JSON and .cache/ are now ignored. Build prepares missing assets at build time; cached packages remain offline at runtime. **127 tests pass across 15 files**, with TypeScript/build and both package validations passing. Synthetic setup tests exercise first download/generation, no-network output reuse, regeneration from SHA-verified raw cache, corrupt-cache rejection, and failed refresh preserving the previous index. The real local build reused existing assets without downloading. A fresh real GeoNames download under this new workflow has not been exercised; external availability/data changes remain a build-time dependency. No files were staged or committed.

## Semantic search live checklist (0.6.0)

Final 0.6.0 verification: **151 tests pass across 20 files**, clean npm ci, TypeScript/build and both package validations pass. Official Mozilla lint reports zero errors, warnings or notices. The final isolated Edge extension run again passed offline inference/cache/filtering checks with zero external requests; initial four-row search took about 1.4 seconds on that run (earlier runs about 3.5 seconds). These synthetic measurements do not establish full-collection performance or signed-in browser acceptance.

- Reload the rebuilt extension and reopen the viewer. Select Semantic · local and search a related role phrase; confirm loading feedback, usable keyword fallback and Relevance sorting.
- Repeat while offline and after reopening the viewer; confirm model loading is local and changed captured title/organization/location fields update results without recollection for unchanged rows.
- Check title-only scope, literal exclusions, numeric IDs, exact facets/deadlines/counts, expired-last/hide-expired, and globe consistency before pagination. Natural-language dates/locations are not automatic constraints.
- Rapidly edit/clear the query, switch mode/scope, refresh successfully and use separate Saved/Applied views with retained rows; confirm old responses cannot replace current results.
- Exercise unavailable/corrupt cache and model-start failure; confirm keyword fallback, clear feedback and explicit Retry, with no automatic loop or loss of snapshots/libraries.

## Field search and company navigation (2026-10-10)

Added title/organization/division/location/ID search scopes, removed the collection-loaded banner, and made company names select that organization with Back to previous search. Return restores query, facets, page, scroll and facet-search text within the current viewer tab.

Verification: **157 tests pass across 20 files**; TypeScript/build and Firefox/Chrome package validation pass. New regressions cover isolated field queries/exclusions and preference loading, field-specific semantic text, and company navigation/return including pagination and focus. The isolated Edge extension check passed location-scoped matching, company drill-down and return, banner absence, existing offline semantic/cache checks, zero external requests, and a 390px layout without horizontal page overflow. The desktop screenshot was inspected. Edge initially crashed under sandboxing; the same isolated check passed outside the sandbox. These synthetic checks do not establish signed-in Firefox/Chrome acceptance; live verification of the new controls remains pending.

The visible Search mode label was subsequently hidden using the existing screen-reader-only class; the dropdown retains its accessible label. All 157 tests, rebuild and both package validations pass after this markup change. Live visual verification of the hidden label remains pending.

The green posting-title new-tab icon now precedes the name, with spacing after it. Clear filters is hidden in the initial/default view and appears only for active search/filter settings; clearing the final constraint hides it again. All 157 tests, TypeScript/build and both package validations pass after these changes. Their live visual acceptance remains pending.

## Full backup and release preparation (0.7.0, 2026-10-10)

The popup opens a persistent Backup & restore tab. Full version-1 backups include the complete collection, local Saved/Applied copies, persistent Saved removals and each view's preferences. Raw collection exports stay unchanged. Restore validates/canonicalizes the file, requires review and confirmation, rejects active collections and merges complete per-ID local state in one serialized storage write. Unsupported files, invalid records and storage failures never clear current storage. Restored preferences load on reopening viewer tabs.

Automated regressions cover round-trip/blank fields/leading zeros, durable-only allowlisting, snapshot/record/version/sender validation, destination conflict resolution and unrelated-ID retention, absent-snapshot retention, active-run refusal/storage failures, review/Cancel/duplicate submission and the backup download queue. Ordinary temporary-install build output remains dist/firefox and dist/chrome. Release packaging creates byte-verified archives, a source submission ZIP and checksums without user CSVs, profiles, dependencies or generated source assets.

Final verification: **170 tests pass across 22 files**. TypeScript/build and both package validations pass. Official Mozilla lint reports zero errors, warnings and notices. The first lint attempt could not reach npm from the sandbox; running the official tool with approved registry access passed.

An isolated Edge extension check with synthetic records passed file validation/review/Cancel, blocked restore during collection, restored snapshot/retained Saved/Applied/removals and Saved preferences, unrelated-ID preservation, and persistence after closing/reopening the disposable profile. Narrow light/dark layouts had no horizontal document overflow; desktop and narrow dark screenshots were inspected. Edge crashed on its initial sandboxed launch; the same check passed outside the sandbox. This is synthetic Chromium evidence, not Firefox temporary-to-signed migration or signed-in SCOPE acceptance.

Pending: download and verify the user's live full backup after reloading the temporary add-on; Mozilla account submission/signing; permanent Firefox/Zen install/restart and same-profile migration; real Firefox/Chrome backup downloads including cancel/Save As, library restore/opening and permission setup. Source archive extraction with fresh npm installation/first-time asset downloads and store review remain pending. No signed .xpi or store publication has been produced locally. See [distribution](distribution.md) for handoff instructions.

## Collapsible viewer sidebar (2026-10-10)

Hide filters and the desktop Refine results summary now collapse the entire sidebar, giving its width to list/globe results. Show filters restores it. Visibility is remembered independently per collection view, with older preferences expanded by default, and preserved when clearing filters or opening company searches. Active constraints remain applied; narrow windows still use the existing Filters dialog.

Verification: **188 tests pass across 24 files**; TypeScript/build and both Firefox/Chrome package validations pass. Added regressions cover collapse/focus/accessibility state, unchanged filtered rows, saved visibility, Clear filters and desktop/mobile resizing. An isolated Edge extension check with synthetic data confirmed reclaimed result width, reload persistence, keyboard reopening, mobile dialog Escape dismissal, restored desktop visibility after resizing and pagination within the viewport. The collapsed desktop screenshot was inspected. Edge initially crashed in the sandbox; the same disposable-profile check passed outside it. This is synthetic Chromium evidence; live Firefox/Chrome acceptance of the new sidebar toggle remains pending.
