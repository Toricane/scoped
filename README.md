# Scoped

Scoped is a Firefox-first, Chrome-compatible extension for collecting and exploring your UBC SCOPE job-posting search. Collect all result pages once, then search, filter, sort, save positions, or explore their cities on a globe. Download CSV/JSON or click a position title to open it in SCOPE.

Everything stays in your browser. Collection reads the results table and never opens individual postings or clicks Apply/Shortlist actions.

## Build and install

Requires Node.js 22.13+ and npm. The generated packages target Firefox 142+ and Chrome 120+.

```sh
npm ci
npm run build
npm run validate
```

The first build prepares offline maps and the local semantic-search model and needs internet access to download public GeoNames and MiniLM data. Later builds reuse verified local assets. Prepare maps explicitly with `npm run setup:maps`, or refresh them with `npm run update:maps`; prepare the search model with `npm run setup:search`. Generated geography, model and runtime files are ignored by Git; preparation scripts and attribution are committed. The installed extension works offline and never downloads a model.

### Firefox / Zen

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.
3. Pin Scoped through the extensions menu if desired.

Temporary installs disappear after restarting Firefox. Load it again after restart; keep full backups rather than relying on temporary-install storage. Persistent Firefox installation requires a Mozilla-signed package.

Full backup/restore and release packaging are now available; Mozilla signing and store publication require submission. Keep the existing temporary add-on while testing. Before switching, reload the build, then open **Backup & restore** in the popup and download a **full backup**. See [backup and distribution](docs/distribution.md) for migration and unlisted signing instructions. `npm run package:release` builds/validates both browsers and creates submission/source ZIPs plus checksums in `release/<version>/`.

### Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `dist/chrome`.
3. Pin Scoped through the extensions menu if desired.

After rebuilding, reload the extension through its browser management page and reopen its popup/viewer.

## Allow SCOPE access

Expand **Site access & setup** in the popup, or use the posting opener, and choose **Allow SCOPE access**. It requests access only to `https://scope.sciencecoop.ubc.ca/*`. After a successful grant, the opener retries the position automatically. Setup expands automatically when access is missing.

SCOPE access is declared as an install-time permission, so the browser can grant it by default. Scoped cannot force **Always Allow** or override a browser's decision to withhold access. Permission prompts happen only after clicking the button.

If the button does not enable access, expand **Firefox / Chrome setup instructions**:

- **Firefox / Zen:** open SCOPE, right-click the Scoped toolbar icon, and select **Always Allow on scope.sciencecoop.ubc.ca**.
- **Chrome:** open SCOPE, right-click Scoped, choose **This can read and change site data → On scope.sciencecoop.ubc.ca**. Alternatively, use Manage extensions → Scoped → Details → Site access → **On specific sites**, and add `https://scope.sciencecoop.ubc.ca`.

Return to the opener and choose **Try again** after a manual change. **Only When Clicked** grants access to the current tab; opening a position needs access in its new tab too. References: [Firefox host permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions), [Chrome site access](https://support.google.com/chrome_webstore/answer/2664769).

## Collect, refresh, and export

1. Sign in normally and open [SCOPE job-posting search results](https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm).
2. Apply your desired SCOPE filters. Clear them first if you want all available postings.
3. Click Scoped in that SCOPE tab and choose **Start collection**.
4. Leave the tab open and avoid changing its filters, sorting, or pagination. Scoped starts at page 1 and leaves SCOPE on the final collected page.
5. Wait for **Collection complete**, then choose **View postings**. To download CSV/JSON, expand **Export your collection** in the popup or **Export postings** in the viewer.
6. To update, return to your SCOPE search and choose **Refresh collection** in the popup.

Closing the popup does not stop collection. Reopen it from the same SCOPE tab to see progress or cancel. Cancel stops further navigation; an already requested page may finish loading. Closing, reloading, or navigating the source tab stops the run. Failed or canceled refreshes keep the previous successful snapshot.

The popup can open the viewer and export an existing snapshot from another website; collection is enabled only on the SCOPE postings page. Downloads run in the background so Save As or popup closure does not destroy their data. Downloads contain the entire snapshot, including when the viewer is filtered.

## Find and open positions

The viewer opens in a separate extension tab using your latest complete snapshot; no CSV import is required. It works without an open SCOPE tab.

The compact header groups the collection tabs, List/Globe switch, and export menu beside the brand. These controls wrap in smaller windows. All/Saved/Applied switch in the current tab; Ctrl/Cmd-click or middle-click opens a separate tab.

Organization and location filters appear first. **How filters work**, **Included cities**, and **Deadline display** hold supporting explanations and display preferences. New default views show **New** and **SCOPE shortlist** badges beside titles; dedicated status columns remain available through **Columns**, and existing column selections are preserved.

- Search all captured searchable fields, or choose position title, organization, division, location, or posting ID. All search words must match. Quotes keep a phrase together; any excluded word/phrase removes a result. Matching ignores case and accents.
- Open **Search options** to choose a specific field or enter exclusions. Exclusions use the same selected field; posting ID searches use literal keyword matching in either mode. Each filter group has an **Options order** control: Name A–Z, Name Z–A, Most postings, or Selected first. Counts describe the entire saved collection; ordering is remembered separately from result sorting.
- Choose **Semantic · local** beside the search box to find related role names, such as “server development” matching backend positions. The packaged MiniLM model runs in a local worker and caches embeddings in your browser. Loading/indexing progress is shown; keyword results remain available during loading or on failure, with an explicit Retry button. **Relevance** puts stronger matches first within the existing expired-last groups; ordinary column sorting is also available. Search mode is remembered separately in All/Saved/Applied, including retained postings. Switch to **Keyword** for the original all-words/quoted-phrase behavior.
- Semantic results are approximate and use only captured table text, not job descriptions or requirements. Exclusions stay literal, and a numeric-only query matches the ID exactly. Use location and deadline filters for exact constraints: dates or locations typed in a sentence are not automatically turned into filters. Relative deadlines are calculated from the clock, not embedded. See [semantic search](docs/semantic-search.md) for offline packaging and limits.
- Semantic results show a thin **muted green relevance bar** along the bottom of each row or narrow-screen card. Its length is the relevance score multiplied by the full row width (for example, 0.50 fills half the row). Hover the row for the exact score; screen readers also receive it. Scores are not confidence percentages. The **0.10** cosine cutoff includes weaker matches, with complete literal matches also retained. Bars remain when choosing ordinary column sorting; expired-last ordering and exact filters still apply.
- Combine organization/location selections, new/shortlisted flags, application status (including blank), term, deadline dates, and application-count limits. Values within a selection group use OR; different filters use AND.
- Click an underlined company name to see all of its positions in the current All/Saved/Applied collection. This clears search constraints; **Back to previous search** restores your query, filters, page, and scroll position. You can adjust the company search before returning. This return history lasts while the viewer tab is open.
- Sort by deadline, application count, ID, or other available columns. Blank/unknown values sort last. Deadlines use your browser’s local timezone; unknown values never expire.
- **Save** and **… (posting actions)** align at the end of each title cell. The menu floats above the table without expanding the row; choose an application action or **Details**, where you can copy the ID. Click outside or press Escape to close it; scrolling or resizing also dismisses it. Saved positions show **Saved** in All postings and **Remove** in Saved; the removal action also offers Undo. Position names hide their matching trailing posting ID/code; storage and exports keep the original title.
- In narrow windows, rows become readable cards and **Filters** opens a separate panel. Choose **Done** or press Escape to return to results. **Sort & columns** holds display controls in these layouts; wider windows retain the sidebar and table.
- **Clear filters** appears only when a search or filter is active.
- **Per page** defaults to **1000**. Choices of 25, 50 and 100 remain available; each collection view remembers your selection, so an existing saved page size is retained.
- All filters apply to the entire snapshot. Results use local pagination, and results/sidebar scroll independently while page controls remain visible. Preferences are remembered; successful refreshes update an open viewer while preserving filters.

**Click a position title** to open it in a new tab. Scoped loads SCOPE's postings overview, enters the ID in **Search Posting**, and clicks that panel's **Search**. It uses your signed-in session without changing the collection tab. Older snapshots work without refreshed link metadata. This action does not submit an application or change shortlist status.

## Saved, Applied, and deadlines

**Save** retains a position locally. **Saved** switches the current viewer to local saves and positions shortlisted in the latest captured SCOPE search, deduplicated by ID. SCOPE entries show a source label. **Remove from Saved** removes either kind of entry and keeps it removed after refresh, without changing SCOPE. A notification offers **Undo** for five minutes, including for retained positions absent from the latest collection. Undo retains a local copy. You can also restore a current position with **Save** in All postings. Explicit local saves retain a copy across collections; automatic SCOPE entries follow the latest captured shortlist.

After submitting an application, click **Mark applied**. It moves the position out of Saved into the separate **Applied** tab. **Applied · Undo** removes the mark and returns it to Saved if it is locally saved or in the captured SCOPE shortlist and has not been removed locally. These actions stay local to Scoped; they never submit an application or change SCOPE. The popup opens both libraries directly. Each view remembers its own filters.

Successful refresh updates retained copies when the ID is present. Missing local Saved/Applied entries remain available with **Not in latest search**; absence from a filtered search does not prove expiry.

Open a posting's **… → Notes / save with notes** to write private notes, even without saving the position. Choose **Save notes**, or **Save posting & notes** to retain the position at the same time. Notes appear in Details and survive refresh, Saved removal and Applied undo. A **Notes** badge identifies annotated positions.

In **Applied**, choose **Add Applied entry** to track applications from any source. Enter a position title and application date, with optional organization, location and notes. These entries have a **Custom** label; their titles do not open SCOPE. Use posting actions to edit the entry or delete it.

Choose **Mark not relevant** to reveal a checkbox beside every visible title. Check positions to mark them, then choose **Done marking**. Posting actions also offer **Mark not relevant / Restore relevance**. Marked positions show **Not relevant**, dim and sort last by default, before the existing expired-last grouping and chosen sort. In the sidebar's **Not relevant** disclosure, choose **Hide not relevant positions** to remove them from both list and globe results, or disable **Show not relevant positions last**. Unhide to restore individual marks. Marking mode is temporary; marks persist across refreshes, and display/filter settings are remembered per view. Title clicks still open SCOPE normally.

Deadline dates and times are interpreted in **your browser's local timezone**. Once the displayed time passes, the position shows **Expired**, dims, and sorts last by default. Use **Hide expired positions** or turn off **Show expired positions last**. Unknown deadlines never expire. Labels update while the viewer is open. Exports preserve original text; the timezone is an interpretation, not a verified SCOPE timezone.

Marking checkboxes occupy a narrow, unlabeled column on the left, with no repeated text above the titles. While marking, newly checked rows gray out and keep their order, page and scroll position, even with **Hide not relevant positions** enabled. Hiding and deprioritization apply when you choose **Done marking**.

In marking mode, click any non-interactive part of a row to toggle its checkbox. Drag from a checkbox or row across other rows to mark a range; start on a checked row to unmark the range instead. Rows crossed quickly are included, and crossing the same row twice in one drag does not toggle it again. Title links, company links and action buttons keep their usual behavior. Touch scrolling and keyboard checkbox controls remain available. Marks update immediately and save in small background batches; failed writes show an error and restore unsaved marks.

**Relative deadlines (next 2 weeks)** displays upcoming deadlines as “in 3 days,” “in 2 hours,” or “in 30 minutes.” Past, unknown, and later deadlines keep their original text. Hover a relative deadline to see its exact date; hover an exact date to see the relative time, including past or more distant deadlines. Details also supports this hover behavior. This display toggle is remembered per view and does not filter results or change exports.

## Greater Vancouver grouping

In **Locations**, enable **Group Greater Vancouver** to combine Vancouver, North Vancouver, Burnaby, Richmond, Delta, and Surrey into one filter choice and globe circle. It matches BC-labelled locations plus the province-free “North Vancouver” variant found in SCOPE; similarly named places elsewhere remain separate. This is a convenience group of those six cities, not a complete regional boundary.

The option is off by default and remembered separately in All, Saved, and Applied. Enabling it with a member city selected widens the selection to the group; disabling it expands the selected group back into its available city choices. Original locations stay visible in rows, Details, searches, and exports. Clear filters keeps the grouping preference.

## Explore locations

Choose **Globe** in any collection. Drag to rotate, scroll to zoom toward the cursor, or use zoom buttons and keyboard arrows. Zoom supports up to 80× and automatically loads finer offline coastlines and borders as you zoom in; globe movement slows down at higher zoom. **Flat map** provides a movable planar alternative.

Circle area is proportional to the filtered posting count. Hover or keyboard-focus a circle to see its location and count as text directly on the map. Click it or a city-list button to return to the matching list. Search and filters apply before map aggregation.

City matching is entirely offline using bundled geography. Pins represent approximate city centres. Ambiguous names, broad labels like Various Locations, and absent places remain in a selectable **Unmapped locations** list. See [geography reference](docs/geography.md).

Saved/Applied records remain browser-local. Collection CSV/JSON export the latest SCOPE collection, not these libraries. **Backup & restore** in the popup opens a separate tab for a full backup of collection, libraries, removals and preferences. Choose a full backup JSON to review its contents before restoring. Matching backed-up values replace current values while other local IDs remain; back up the destination first and reopen viewer tabs after restore. Uninstalling or losing temporary-install storage may lose data. See [migration instructions](docs/distribution.md).

## Troubleshooting

- **Access/inspection error:** use **Allow SCOPE access** or the browser instructions above, then retry.
- **Sign-in/session error:** sign in to SCOPE normally, then return to the opener and retry. Scoped does not handle credentials.
- **Collection unavailable:** navigate to SCOPE search results and reopen the popup in that tab. The initial postings overview is not a results table.
- **Changed totals, missing structure, timeout, or incomplete collection:** return to a stable search and start again. The previous successful snapshot is kept.
- **No matching positions:** clear viewer filters. The viewer contains your last collected SCOPE search, which may itself have SCOPE filters applied.
- **Invalid/unsupported snapshot:** collect again. The viewer reports the problem without deleting the stored data.

## Data, privacy, and limits

Permissions are `activeTab` (the clicked tab), `scripting` (collection and posting-ID search), `storage` (snapshot/progress/preferences), `downloads` (requested exports), and SCOPE-only host access (opening positions in new tabs). No cookie API access, analytics, external server, credentials, or uploads are used.

Exports preserve IDs, full source titles, organizations, divisions, locations, terms, application status/counts, original deadline text, and captured new/shortlisted flags. CSV supports Unicode, quoted cells, and spreadsheet formula protection. JSON uses schema version 1. See [data format](docs/data-format.md) for fields and compatibility.

Only table data is available: descriptions, salaries, and requirements are not collected. One complete snapshot is kept; refresh replaces it only on success. Counts/ranges catch detectable changes but cannot guarantee an atomic snapshot if live postings change without changing the total.

Collection CSV/JSON imports, filtered exports, named saved searches, user-defined tags, history, scheduling, and extension-store publication are deferred. Full Scoped backups include notes, relevance marks and custom Applied entries; raw collection exports remain unchanged.

## Project documentation and verification

Version 0.7.0 adds full backup/restore and release archives while preserving temporary-add-on builds. Mozilla signing/publication and live Firefox migration remain pending; follow [backup and distribution](docs/distribution.md) before changing installations.

Start at the [documentation index](docs/README.md). Contributors use the [development guide](docs/development.md); AI coding agents start with [AGENTS.md](AGENTS.md). The [page reference](docs/scope-page-structure.md) describes inspected SCOPE markup, and [acceptance status](docs/acceptance.md) separates automated evidence from live checks. [Icon documentation](docs/icon.md) records the approved artwork.

Version 0.6.0 adds optional offline semantic search. Automated tests and an isolated Edge extension check cover related-title recall, exact filters, cache reuse, and blocked external requests; this is synthetic local evidence, not signed-in SCOPE acceptance. Earlier local previews cover readable narrow layouts, filter-dialog dismissal, keyboard focus recovery, Saved removal/Undo, and light/dark themes. The user confirmed Firefox collection, posting opening with persistent access, and the permission-setup fix on earlier versions. Live Firefox/Zen semantic-search acceptance, broader relevance evaluation, Chrome smoke tests, and individually unreported edge cases remain pending; see the [acceptance document](docs/acceptance.md) for precise coverage.
