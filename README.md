# Scoped

Scoped is a Firefox-first, Chrome-compatible extension for collecting and exploring your UBC SCOPE job-posting search. Collect all result pages once, then search, filter, and sort locally. Download CSV/JSON or click a position title to open it in SCOPE.

Everything stays in your browser. Collection reads the results table and never opens individual postings or clicks Apply/Shortlist actions.

## Build and install

Requires Node.js 22.13+ and npm. The generated packages target Firefox 142+ and Chrome 120+.

```sh
npm ci
npm run build
npm run validate
```

### Firefox / Zen

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.
3. Pin Scoped through the extensions menu if desired.

Temporary installs disappear after restarting Firefox. Load it again after restart; download snapshots you need to keep rather than relying on temporary-install storage. Persistent Firefox installation requires signing/distribution, which is deferred.

### Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `dist/chrome`.
3. Pin Scoped through the extensions menu if desired.

After rebuilding, reload the extension through its browser management page and reopen its popup/viewer.

## Allow SCOPE access

Choose **Allow SCOPE access** in the popup or posting opener. It requests access only to `https://scope.sciencecoop.ubc.ca/*`. After a successful grant, the opener retries the position automatically.

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
5. Wait for **Collection complete**, then choose **View postings**, **Download CSV**, or **Download JSON**.
6. To update, return to your SCOPE search and choose **Refresh collection** in the popup.

Closing the popup does not stop collection. Reopen it from the same SCOPE tab to see progress or cancel. Cancel stops further navigation; an already requested page may finish loading. Closing, reloading, or navigating the source tab stops the run. Failed or canceled refreshes keep the previous successful snapshot.

The popup can open the viewer and export an existing snapshot from another website; collection is enabled only on the SCOPE postings page. Downloads run in the background so Save As or popup closure does not destroy their data. Downloads contain the entire snapshot, including when the viewer is filtered.

## Find and open positions

The viewer opens in a separate extension tab using your latest complete snapshot; no CSV import is required. It works without an open SCOPE tab.

- Search title, organization, division, location, and ID, or titles only. All search words must match. Quotes keep a phrase together; any excluded word/phrase removes a result. Matching ignores case and accents.
- Combine organization/location selections, new/shortlisted flags, application status (including blank), term, deadline dates, and application-count limits. Values within a selection group use OR; different filters use AND.
- Sort by deadline, application count, ID, or other available columns. Blank/unknown values sort last. Dates use SCOPE's calendar text without timezone conversion or expiry guesses.
- Choose columns, expand **Details**, or copy an ID. Position names hide their matching trailing posting ID/code; storage and exports keep the original title.
- All filters apply to the entire snapshot. Results use local pagination, and results/sidebar scroll independently while page controls remain visible. Preferences are remembered; successful refreshes update an open viewer while preserving filters.

**Click a position title** to open it in a new tab. Scoped loads SCOPE's postings overview, enters the ID in **Search Posting**, and clicks that panel's **Search**. It uses your signed-in session without changing the collection tab. Older snapshots work without refreshed link metadata. This action does not submit an application or change shortlist status.

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

Imports, filtered exports, named saved searches, notes, history, scheduling, ranking, and extension-store publication are deferred.

## Project documentation and verification

Start at the [documentation index](docs/README.md). Contributors use the [development guide](docs/development.md); AI coding agents start with [AGENTS.md](AGENTS.md). The [page reference](docs/scope-page-structure.md) describes inspected SCOPE markup, and [acceptance status](docs/acceptance.md) separates automated evidence from live checks. [Icon documentation](docs/icon.md) records the approved artwork.

Version 0.3.3 has 82 passing tests, successful TypeScript/build/package checks, and clean Mozilla lint. The user confirmed Firefox collection, posting opening with persistent access, and the latest permission-setup fix. Chrome live smoke tests and individually unreported edge cases remain pending; see the acceptance document for precise coverage.
