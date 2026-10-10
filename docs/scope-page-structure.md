# SCOPE search-results page structure

This adapter reference comes from the user-provided browser save inspected on October 9, 2026. The saved document contained page 1, 200 rows, a total of 763 results, and four pages. It establishes parsing structure; it does not prove live AJAX traversal or future markup compatibility.

Current implementation references: [development guide](development.md), [data format](data-format.md), and [acceptance status](acceptance.md). The user subsequently confirmed Firefox collection and posting opening with persistent SCOPE access. The overview adapter still uses screenshot-based contextual matching; exact live DOM IDs were not supplied.

## Relevant containers

- Source: `https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm` (query parameters may be present).
- `#postingsTablePlaceholder` contains result counters, pagination, and the results table. SCOPE replaces its contents when loading another page.
- `#postingsTableDiv` is the scrolling wrapper. Horizontal clipping does not remove cell content.
- `#postingsTable` contains `thead` headers and `tbody tr.searchResult` posting rows.
- Each row has an ID such as `posting1001` and a corresponding `posting1001` class. `isNew` marks a new posting; `isFav` marks a shortlisted posting. Example IDs and text in this document and the fixture are synthetic.

## Columns and extracted data

The inspected page has eleven cells in each row. Zero-based positions are: 0 unlabeled Shortlist/Unshortlist and Apply actions; 1 App Status; 2 Term; 3 ID; 4 Job Title; 5 Organization; 6 Division; 7 Location; 8 Applications; 9 App Deadline; 10 unlabeled Not Interested action.

Map the nine labeled columns through header text, including both `th` and `td` in the header row so unlabeled action columns retain their positions. Reject missing/duplicate required labels, differing row/header cell counts, and IDs inconsistent with `tr.id`. Never click action columns.

- **ID:** numeric text, retained as a string; must match the row ID suffix.
- **Application status, term, location, deadline:** normalized cell text. Empty cells stay empty.
- **Job title:** text of `a.np-view-btn-<ID>` inside the title cell. This omits the separate `NEW` badge. The full title also exists in the cell's `data-totitle`, cell `title`, and a nested span's `title`; use `data-totitle` as the fallback when the anchor is absent. Keep source suffixes, including posting numbers and codes, without attempting to strip them.
- **Organization/division:** the cell's `data-totitle` contains full text; `.overflowToTitle` spans may display clipped text. Prefer the attribute over rendered text.
- **Applications:** nonnegative integer, or an empty string for an empty cell.
- **New/shortlisted:** booleans from row classes, independent of title text and button labels.
- **Deadline:** source text such as `Oct 16, 2026 09:00 AM`. No timezone was established from the table. Do not infer one.

Normalize whitespace and decode HTML through the DOM. Do not use `innerHTML` as exported data.

## Counters and pagination

Inside `.orbis-posting-actions`, `.badge-info` contains the total result count. `#totalOverAllDocs` contains the first displayed row number and `#totalOverAllPacks` contains the last displayed row number. Comments around counter text are irrelevant to `textContent`.

Two `.pagination` groups appear above and below the table. Use the first group for navigation. Both include hidden inputs with IDs beginning `currentPage`; the inspected suffix was dynamically generated and must not be hardcoded. Read `input.value` and check that duplicated inputs agree. `li.active a` identifies the selected page; `li.disabled` marks unavailable navigation.

Numbered anchors and first/previous/next/last controls use `href="javascript:void(0)"` and inline handlers. A representative sanitized handler is:

```js
loadPostingTable('', 'ID', 'Reverse', '2', 'advanced', '', null)
```

The fourth argument is the target page. Prefer matching the numbered link's text; when pagination uses a window of page numbers, extract the fourth argument from an existing control as data. Do not evaluate handler strings or construct new search requests.

The saved document defines two functions named `loadPostingTable`. Its later seven-argument definition matches the pagination above and overrides the earlier definition. It builds a request using `orderBy`, `oldOrderBy`, `sortDirection`, `page`, `searchBy`, `keyword`, `searchType`, `postings`, `currentPage`, `initialSearchAction`, an opaque `action`, and a random cache-busting value. The controller path is `/myAccount/co-op/postings.htm`.

The function uses jQuery's `$("div#postingsTablePlaceholder").load(controllerPath, request, callback)` to POST and replace the table fragment, followed by `orbisApp.checkAjaxResponse(xhr)`. Existing pagination carries the current sort/search context. Clicking it lets SCOPE supply the current session/action values without hardcoding them in the extension. No bundled SCOPE script is needed in the extension or fixture.

Register a `MutationObserver` before clicking, wait for replacement of the table element, then check the target page, total, displayed range, and row IDs. Reacquire DOM elements after every replacement. Treat unchanged tables as pending until timeout. A missing table after replacement indicates an expired session or incompatible results page.

## Posting details and excluded actions

Title and Apply anchors invoke `orbisAppSr.buildForm(...).submit()` with a posting ID and opaque action/search values, often targeting a new tab. Their `href` values are not usable posting URLs. Shortlist controls call `toggleFavouritePosting`; the final action column calls `toggleBlacklistPosting`.

Collection never invokes these controls. It stores an optional structured `postingLink`: a genuine same-origin HTTPS URL if present, otherwise `{kind: 'scope', page: <current page>}` associated with the row's existing ID. Missing title anchors have no link. Handler text, opaque action values, and session information remain excluded from snapshots/exports.

The user authorized viewer title links, then reported that replaying captured title forms only opened the initial overview. The revised action opens that overview in a new tab, enters the row ID into its **Search Posting** panel, and clicks that panel's existing **Search** button. It neither navigates the source results tab nor captures/replays form fields. All snapshots with valid IDs support this action, even without link metadata.

## Overview posting-ID search

The user's screenshot shows a card headed **SEARCH POSTING**, text **Enter the job ID you are searching for**, one text input, and a **Search** button. There is also an unrelated general Search button elsewhere. Exact DOM IDs/names were not supplied, so the adapter uses this visible context rather than guessing selectors or request action values.

`searchPostingById` finds an enabled visible text/search/number input with a job/posting-ID label or contextual search-panel text. It requires exactly one eligible input and one Search control in the smallest suitable ancestor, and rejects multiple matching panels. It sets the native value, dispatches input/change, then clicks the existing Search control after the injection result has returned. Mutation observation handles delayed control insertion; password fields without a search panel report expired login, and missing structure times out clearly. `tests/fixtures/overview.html` preserves these visible relationships with synthetic markup and a separate general Search button. The user confirmed the live Firefox/Zen opening flow after enabling persistent access, then confirmed the permission-setup update works. Chrome and individual adapter edge cases remain pending in the acceptance checklist.

The opener checks SCOPE host access before navigating. `src/site-access.ts` requests only the declared SCOPE origin directly from a button click and supplies browser-specific manual instructions; it does not automatically prompt or force browser preferences. Missing access is distinct from an expired session. The navigation adapter waits for the new SCOPE document rather than treating completion of the extension opener or missing event URL metadata as a login failure.

## Retained evidence and cleanup

`tests/fixtures/postings.html` is a small synthetic, self-contained fixture preserving the required containers, eleven-column structure, flags, full-text attributes, counters, duplicated paginators, and a sanitized pagination handler. Representative tests cover Unicode, clipped display text, blanks, and title suffixes.

The original saved HTML and its companion `_files` folder were removed after fixture parsing, sanitization, and tests passed. None of the saved analytics, editors, site libraries, styles, fonts, images, or account/session markup is required for runtime collection.

## Known boundaries

Searches can change during traversal. Unique-count and contiguous-range checks reject detectable inconsistent snapshots, but cannot guarantee an atomic server snapshot if postings change while keeping the same total. Keep SCOPE untouched while collecting; rerun if results change.

The saved page provides no live session. The user confirmed the original Firefox collection and supplied an export; Chrome smoke tests and unreported Firefox edge cases still need separate signed-in checks. Consult the current acceptance record rather than inferring browser success from this DOM evidence.
