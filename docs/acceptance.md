# Browser acceptance and verification

Current implementation: **0.5.5**. Last documentation review: **October 10, 2026**. This is the current checklist; [historical records](history/acceptance-history.md) preserve earlier versions and abandoned approaches.

Automated tests, saved markup, and local previews do not establish live signed-in compatibility. User reports confirm the described workflow, not every edge case below.

## Recorded evidence

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

Local Save/Saved controls and a separate Saved viewer tab are implemented. Saved keys retain a captured posting copy, update only on successful collection commit, and survive disappearance from the latest search. Per-ID background mutations avoid overwriting another tab's saves, and current/Saved tabs update from storage events. Missing-current records are labeled Not in latest search without inferred expiry. The opener accepts validated retained records; Saved remains accessible without a valid current collection. SCOPE shortlist/application state and collection export schema are unchanged. Current exports still contain only the latest SCOPE collection; the Saved view explicitly labels that limit.

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
