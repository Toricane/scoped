# Historical verification notes

Archived on October 10, 2026. This file preserves earlier implementation evidence and superseded checklists; it is not current guidance. Use [current acceptance status](../acceptance.md) for current behavior and pending checks. In particular, form replay, source-page lookup, metadata-refresh requirements, and refusal to open a position during collection are obsolete.

# Browser acceptance checklist

Automated checks do not replace a live signed-in run. Do not mark these checks passed based only on the saved HTML or jsdom simulations.

## Firefox

- Load `dist/firefox/manifest.json` as a temporary add-on in Firefox 142+.
- Sign in normally and open a search with multiple pages. Record its total and filters.
- Begin while viewing a later page. Click Scoped, then Start. Confirm it returns to page 1 and traverses every page without opening any posting details or invoking Apply, Shortlist, or Not Interested.
- Confirm progress updates, SCOPE remains on the final page, and the snapshot count equals the live total. Inspect several full titles, accented names, blanks, flags, and original deadline values.
- Download CSV and JSON. Confirm files are readable, JSON has the expected metadata/count, and CSV has one header plus one record per posting.
- Repeat with a one-page search and an empty search.
- Refresh successfully. Confirm the collection timestamp updates and current values replace the previous snapshot.
- Confirm the toolbar opens a compact popup with the green icon, without creating a new tab. Close the popup during collection, then reopen it from the same SCOPE tab. Confirm collection and progress continue without a second run.
- Open Save As from the popup and confirm CSV/JSON downloads succeed even when the popup closes. Open the popup on another website and confirm collection is disabled while saved exports remain available.
- Attempt a second run in the same source tab. Confirm it is prevented.
- Cancel a run. Confirm no more pages are requested and the previous complete snapshot is still exportable.
- Close or reload the source tab during collection. Confirm a clear failure and no replacement of the previous snapshot.
- Change search/sort manually during collection. Confirm detected inconsistencies stop collection; do not rely on an atomic snapshot when the total is unchanged.
- Sign out or allow the session to expire between page loads. Confirm the failure reports session/table trouble and retains the previous snapshot.

## Chrome

- Load `dist/chrome` unpacked in Chrome 120+.
- Perform a signed-in multi-page collection and refresh. Confirm source total and export counts match.
- Download CSV and JSON; inspect their contents and Unicode.
- Close/reopen the popup, cancel a refresh, and verify previous-snapshot retention. Confirm Save As still succeeds after the popup closes.
- Check extension errors in `chrome://extensions` and the popup console.

## Status

Implementation checks passed: TypeScript validation; 45 Vitest tests covering parsing, simulated collection, exports, snapshot retention, background lifecycle, popup initialization/reopening, and background-owned downloads; parsing all 200 rows of the original save with its 763-result total and displayed range reconciled. Both browser bundles, popup assets, and icon dimensions are validated. Icon transparency is verified. Mozilla's `web-ext lint` passed the updated Firefox package with zero errors, warnings, or notices. The original saved page and asset folder have been removed.

User-reported Firefox acceptance of the original tab-based version: **worked**, reported October 10, 2026. The supplied screenshot shows a completed four-page run with 764/764 postings. The user did not separately report CSV/JSON download checks, browser version, or each edge-case check.

Live acceptance of the popup conversion/background downloads and Chrome smoke tests: **pending**. Automated verification is recorded separately and must not be treated as these live checks.

## Version 0.3.0 viewer and posting actions

Historical checks below describe the previous approach. The user subsequently reported that posting actions stopped at SCOPE's initial overview and that the viewer's document scrolled outside the viewport. Version 0.3.1 replaces that link flow and layout; its current checks are recorded below.

- Reload the built extension and approve its SCOPE-only host permission if requested. Confirm the popup opens the viewer from SCOPE and from another website.
- Confirm an older snapshot displays without migration, and indicates that missing posting targets need refresh. Collect again; verify JSON/CSV `postingLink` descriptors contain only a real URL or source page, with no native handler or form action fields.
- Open postings from the first, middle, and last collected pages. Confirm a new tab shows the intended posting, while the source remains a SCOPE results tab. No Apply/shortlist/blacklist action should run. Check that title and posting action lead to the same expected SCOPE detail screen.
- Retry after closing the source tab, changing its filters, or signing out. Confirm actionable errors/sign-in behavior. Opening a posting during collection must be refused. Opening details is an explicit user action and must not occur while scraping.
- Search multiple words, quoted phrases, exclusions, and accented locations. Combine facets and date/count filters. Confirm filters apply to the full snapshot, with inclusive calendar dates and numeric sorting. Check blanks and source flags.
- Change columns, sort, page size, and filters; reopen to verify preferences. Refresh successfully with the viewer open, then cancel/fail a refresh: only success replaces the viewer data.
- Check full titles, Details, copy ID, keyboard focus, zoom/narrow layouts, light/dark themes, and full-snapshot downloads from the viewer in both browsers.

Recorded implementation evidence: 76 Vitest tests pass, including local query/ordering/deadline rules, preference and legacy-snapshot compatibility, safe DOM rendering, pagination, stale-read protection, source-page lookup, synthetic form interception/restoration, same-origin new-tab submission, and background posting guards. TypeScript/build and both package validations pass. Mozilla `web-ext lint` reports zero errors/warnings/notices for version 0.3.0. Existing collector and export retention tests continue to pass.

The user's CSV was loaded only into a temporary localhost preview for development. A headless Edge preview confirmed the full 764-row collection renders in light/dark desktop layouts and a narrow layout with collapsed filters and table-only horizontal scrolling. A Node benchmark of the actual query module over 100 mixed queries measured index preparation at 4.59 ms, median filter/sort at 0.58 ms, p95 at 1.48 ms, and maximum at 23.49 ms on the development machine. These timings exclude DOM rendering and the 60 ms typing debounce and are not browser guarantees. The CSV remains unchanged and ignored by Git; no real posting data is copied into tests.

Signed-in Firefox/Chrome acceptance of version 0.3.0 and live SCOPE form submission: **pending**. No signed-in browser was available to the agent. Form tests use synthetic handlers; the original saved HTML established form-based navigation but cannot prove the live handler still behaves synchronously.

## Version 0.3.1 posting-ID search and viewport corrections

- Reload the extension and reopen the viewer. Click a position title: the new tab should load the initial SCOPE overview, enter that row's ID into **Search Posting**, and click that panel's Search button. Confirm the intended position opens, including from a previously collected snapshot without link metadata.
- Close the original collection tab and repeat while still signed in. It should continue working without a source-tab connection, source-page traversal, or saved form fields. Check login expiry, unavailable IDs, and ambiguous/missing panel errors. The general Search button and Apply controls must never be clicked by the adapter.
- Verify that the position text itself is the sole posting link; the action column contains only Details. Matching posting-ID suffixes (including attached letter codes) are hidden from position names, while unrelated employer requisition numbers remain. ID is still available in Details/its optional column, and raw source titles remain intact in exports.
- Verify no outer document overflow and always-visible pagination at normal desktop and narrow viewport sizes. Scroll results and the filter sidebar independently; check expanded details, column options, and filters.

Recorded evidence: 74 tests pass; TypeScript/build and both package validations pass; Mozilla lint reports zero errors/warnings/notices. Tests cover scoped ID entry and input/change events, exactly one Search click, the separate general Search control, delayed panel insertion, ambiguity, missing controls, expired login, new-tab injection and listener cleanup, older-snapshot title links, presentation-only ID removal, and existing collector/export behavior. The failed form-capture/source-row approach and its tests were removed.

The actual 764-row CSV was used in an isolated local browser preview. Headless Edge checks confirmed document dimensions equal viewport dimensions at 1920×986, 1280×720, and 800×1000. Pagination bottoms were respectively 970, 704, and 984 pixels, within each viewport. Each page rendered 50 title links and no separate action-column posting links. Desktop light/dark and narrow screenshots were inspected. Temporary preview files remain outside the repository.

Live signed-in Firefox/Chrome ID-search acceptance remains **pending**. The overview adapter is based on the screenshot's visible structure; exact live markup was unavailable. Its synthetic fixture verifies the matching/search behavior but does not establish the live site's handler result.

## Version 0.3.2 opener navigation race

The user's seven-second recording shows the title click reaching the extension opener and immediately returning with “Sign in to SCOPE, then retry opening the posting.” This wording comes from the navigation listener, before the ID-search adapter executes. It previously treated every load-complete event whose payload lacked a SCOPE URL as an authentication failure, including the opener's own completion event racing with its request to navigate.

Navigation now waits for the update request to be acknowledged and reads current tab state rather than trusting the event payload. It ignores the extension document/about:blank, waits through loading, handles cached completion and events received during reads, and inspects the permitted document when URL metadata is absent. Permission failures receive their own error; only a confirmed external destination is reported as a redirect. Firefox's injected-script error message is preserved instead of replacing it with a generic login suggestion.

Regression checks cover opener completion before update acknowledgement, stale opener URL payloads, omitted URL payloads/metadata, cached completion without another event, permission refusal, and a genuine external login destination. Live signed-in acceptance remains pending; this correction addresses the pre-search failure visible in the recording, rather than changing the screenshot-based search-panel adapter.

Verification: 78 tests pass across the full suite. The final pending-navigation guard was then verified with all nine posting-navigation tests. TypeScript/build, both browser package validations, and Mozilla lint pass (zero errors/warnings/notices). Reload version 0.3.2 and reopen the viewer to test the signed-in flow; existing snapshots require no recollection.

## Version 0.3.3 site-access setup

The user confirmed that posting opening works after changing Firefox/Zen's Scoped menu from Only When Clicked to Always Allow on scope.sciencecoop.ubc.ca. This establishes user-reported signed-in ID-search success with persistent access; Chrome opening remains unverified.

The popup and posting opener now offer Allow SCOPE access, requesting only the already-declared SCOPE host directly from a click. The opener checks access before navigating and retries automatically after a grant. Denial/request errors expand Firefox/Zen and Chrome setup instructions. Required host access remains declared for installation; the extension cannot force a browser's Always Allow preference or override withheld access.

Verification: 82 tests pass, including permission preflight, synchronous click requests, successful grant/retry, denial, API failure/manual recovery, and popup refresh without starting collection. TypeScript/build and both package validations pass.

Live checks still needed: withhold SCOPE access, open a title, grant through the new button and confirm the intended position opens; deny the prompt and confirm no navigation; use the manual instructions and Try again; verify both browsers, including popup closure during a permission prompt. Existing snapshots need no recollection.

Mozilla web-ext lint for version 0.3.3 also passes with zero errors, warnings, or notices.

