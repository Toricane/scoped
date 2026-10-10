# Archived viewer proposal

Historical design context, not implementation instructions. The viewer is implemented. Direct title links, presentation-only ID removal, and SCOPE permission setup supersede the proposal's related deferrals. No form replay or source-page lookup remains. See [README](../../README.md), [development guide](../development.md), and [acceptance status](../acceptance.md) for current behavior.

# Scoped local viewer — proposed milestone

Status: implementation authorized by the user, including posting actions. The user superseded the original link deferral: collect structured posting targets and open them from the viewer. Implementation adds narrow SCOPE host access to submit forms from a new SCOPE tab; raw form/action values remain transient and are not exported. The rest of this document preserves the reviewed design proposal.

Later correction: version 0.3.1 opens the initial overview and enters the posting ID in Search Posting rather than replaying forms or traversing the source tab. Position titles are hyperlinks with the matching ID suffix hidden for display, and the core viewer fits the viewport with independent results/sidebar scrolling. Existing snapshots need no metadata refresh for this action. README and AGENTS.md describe the current implementation.

## Goal

Open the latest successful collection in an extension tab and make finding relevant opportunities fast: search, combine filters, sort, and read full table fields without another SCOPE request. Keep collection and refresh controls in the popup.

## Evidence and data boundaries

The supplied CSV contains 764 rows with 764 unique IDs and the existing eleven export fields. It has 280 organizations, 132 location values, one term, 199 SCOPE-new postings, and 23 shortlisted postings. Application status is blank in 762 rows; two contain an employer-website application status. All deadlines in this example use the documented English month/day/year and AM/PM format.

Use the existing schema-version-1 JSON snapshot in extension storage as the runtime source. The CSV informs design and validation; users will not need to export and reimport it. Preserve the user's CSV and keep it ignored by Git. Automated fixtures will use synthetic data rather than copying this collection.

Only table fields are available. Descriptions, requirements, salaries, and reliable remote-work classifications cannot be searched or filtered. Location values such as “Various Locations” stay intact. New and shortlisted mean the flags recorded by SCOPE at collection time, not changes detected by Scoped.

## User flow and layout

1. Add **View postings** to the popup. It opens a packaged `viewer.html` extension tab, including when the popup is opened outside SCOPE. Opening the viewer does not start collection.
2. The viewer header shows the Scoped icon, collection time, snapshot count, and a reminder that it contains the last collected SCOPE search. Viewing works without an active SCOPE session.
3. Put a large search box and sort selector above results, with a filter sidebar on wide screens and a collapsible filter panel on narrow screens.
4. Use an accessible results table with a sticky header, wrapped full titles, and generous title/organization columns. Default columns: title, organization, location, deadline, application count, and new/shortlisted indicators. A column chooser exposes ID, term, division, and application status.
5. An expandable row reveals every captured field and a **Copy posting ID** action. It displays captured data only; it does not fetch a posting description. Avoid truncation that makes a tooltip the only way to read text.
6. Show matching/total counts, active-filter chips, and **Clear filters**. Render 50 results per local page, with 25/50/100 choices. All matching and sorting operates across the entire snapshot, regardless of the displayed page.
7. A no-snapshot state explains how to collect from the popup. A no-matches state offers a filter reset. A malformed or unsupported stored snapshot produces a useful error without deleting it.

Keep the current green branding, support light/dark themes, and provide keyboard navigation, labeled controls, visible focus, and accessible sort/expanded states.

## Search and filters

- Search ID, title, organization, division, and location by default, with a title-only option.
- Match case-insensitively and accent-insensitively. Ordinary whitespace-separated terms must all match somewhere in the selected fields; quoted text matches a contiguous phrase. For example, `python Vancouver` narrows by both terms, while `"machine learning"` searches a phrase. An optional exclude-words field removes postings containing any entered term. Explain these rules beside the search controls; do not interpret regular expressions.
- Provide searchable multi-select organization and location filters; the example's hundreds of options should not become long native select menus.
- Provide new and shortlisted filters with All/Yes/No states; application status including a clearly labeled blank/no-status option; term; inclusive deadline-from/to dates; and minimum/maximum application counts. Keep less common filters in an expandable section.
- Selections within one multi-select use OR; different filters and the search use AND. Keep blank application counts distinct from zero.
- Do not infer province, remote status, discipline, or job suitability from ambiguous text. Users can find those words through search when present.

## Sorting and derived values

Default to deadline ascending, with numeric posting ID descending as the stable tie-breaker. Offer ascending/descending sorts for title, organization, location, deadline, application count, and numeric ID; support relevant table-header sorting as well.

Derive deadline components with an explicit parser for the observed format. Compare calendar/time components without timezone conversion and preserve the displayed source text. Date filters compare calendar dates inclusively. Put blank or unrecognized deadlines last in either direction; include an Unknown deadline filter option. Do not label deadlines expired or show countdowns without an established source timezone.

Keep derived search strings and sort keys in memory. Never rewrite snapshot values, strip title suffixes, or change the export schema to accommodate display logic. Sort blanks last and use deterministic ties.

## Persistence and refresh

Persist search text, filters, sorting, page size, and visible columns in a separate versioned viewer-preferences key. Reopening restores these settings; filter/sort changes reset local pagination. Keep selections that temporarily have no matching options so an updated search does not silently broaden; expose them as removable chips.

Subscribe to snapshot storage changes. When a successful collection replaces the snapshot, rebuild the in-memory index, preserve preferences, reset the results to page one, and show an “Updated collection” notice. Failed/canceled collections leave the previous results intact. Initial loading and event handling must prevent an older storage read from overwriting a newer snapshot.

Refresh remains in the popup on the SCOPE tab, where clicking the toolbar grants the existing active-tab access. The viewer provides instructions to return there rather than introducing broad host access. Existing CSV/JSON downloads remain full-snapshot exports and use the background-owned download flow.

## Implementation structure after approval

- Add `viewer.html`, `src/viewer.ts`, and `src/viewer.css` as a second Vite page entry, packaged for both browsers.
- Add independently testable modules for snapshot validation, search/filter/sort operations, deadline parsing, and viewer preferences. Continue with TypeScript and DOM APIs; no framework or server is necessary for this collection size.
- Add the popup launch control using the existing WebExtensions compatibility layer. Each explicit click may open a viewer tab; single-tab reuse can follow later if useful.
- Extend package validation to require the viewer and its bundled assets. Keep the existing four permissions and schema version.
- Render posting text through safe DOM text APIs. Do not execute exported content or inline site handlers. Ship all assets locally.
- Update README, AGENTS.md, and the browser acceptance checklist for the new page, modules, workflow, and verification results. Keep collector behavior unchanged unless a viewer integration exposes a concrete issue.

## Verification and acceptance

Unit tests cover term/phrase/exclusion semantics, Unicode, combined filters, blank status, boolean flags, numeric ordering, stable ties, unknown deadlines, inclusive date boundaries, and unchanged source values. Viewer DOM tests cover pagination, column visibility, row expansion, no data/no matches, preference restoration, malformed snapshots, and successful versus failed refresh behavior.

Run the existing regression suite, type checks, both package builds/validation, and Mozilla manifest lint. Confirm the viewer opens from the popup and works from saved data in Firefox and Chrome. Check that closing the popup/viewer does not interrupt collection and that a successful refresh updates an open viewer while failed refreshes preserve its results.

Use the supplied collection locally for a manual performance check: after initial load, target under 100 ms for filtering/sorting 764 postings on the development machine, with responsive typing and bounded DOM rendering. Record observed timings rather than treating the target as a guarantee. Check long titles, zoom/narrow layouts, keyboard use, and both themes. Live browser checks remain separate from fixture tests.

## Deferred additions

CSV/JSON import, filtered-result exports, saved named searches, personal notes/hide/favorite actions, multiple snapshots/change history, automated ranking, direct posting-detail actions, scheduling, and store publication are outside this proposed milestone. They can be prioritized after the core viewer works.

