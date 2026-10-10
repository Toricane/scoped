# Browser acceptance and verification

Current implementation: **0.3.3**. Last documentation review: **October 10, 2026**. This is the current checklist; [historical records](history/acceptance-history.md) preserve earlier versions and abandoned approaches.

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
