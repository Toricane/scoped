# Data format and local storage

The authoritative TypeScript contract is `src/types.ts`; collection serialization is in `src/export.ts`. The viewer uses the stored snapshot directly. Collection CSV/JSON import is not implemented; full Scoped backup restore is separate.

## Snapshot JSON

Semantic search adds no fields to the snapshot or exports. Its disposable IndexedDB vectors are keyed by model/text version and input hash, separate from snapshot/library storage. Version-1 viewer preferences optionally include searchMode (keyword by default; semantic opt-in) and sort=relevance for semantic mode. Existing preferences retain their defaults. See [semantic search](semantic-search.md).

Schema version 1 is an object with:

- `schemaVersion`: number `1`.
- `collectedAt`: ISO timestamp for the completed collection, also used in export filenames.
- `sourceUrl`: the collected SCOPE postings URL, including its query parameters when present.
- `reportedTotal`: SCOPE's reported result count, reconciled with the unique posting count.
- `postings`: array of the records described below.

JSON is pretty-printed with a trailing newline. Older schema-1 snapshots without postingLink remain supported. Malformed/unsupported viewer data produces an error without deleting it. No schema migration or CSV reimport is required to open positions by ID.

## Posting fields

CSV columns use this exact order; JSON uses these property names:

1. `id`: numeric posting ID as a string, preserving leading zeros.
2. `applicationStatus`: normalized source text; blank remains blank.
3. `term`: source text.
4. `jobTitle`: full source title anchor text, separate from the NEW badge; source ID/code suffixes are preserved.
5. `organization`: full text, preferring the source full-text attribute.
6. `division`: full text, preferring the source full-text attribute.
7. `location`: source text; no remote/province classification is invented.
8. `applications`: nonnegative integer or empty string for a blank source value.
9. `deadlineText`: original normalized text. The raw export contains no inferred timezone or expiry; the viewer interprets it in browser-local time.
10. `isNew`: boolean from SCOPE's row flag, rather than changes detected by Scoped.
11. `shortlisted`: boolean from SCOPE's row flag at collection time.
12. `postingLink`: optional compatibility descriptor, either `{ "kind": "url", "url": "..." }` for a genuine same-origin HTTPS link or `{ "kind": "scope", "page": 2 }` for its source result page. Absent values export as blank CSV cells.

Whitespace is normalized during collection; Unicode is preserved. Blank values stay blank. Native handlers, opaque actions, session values, and invented detail URLs are excluded. postingLink contains no executable code and is not used for current title navigation: the viewer opens the ID through SCOPE's Search Posting panel.

The viewer's positionTitle helper removes only a matching trailing posting ID/code for display, title search, and sorting. It preserves unrelated employer requisition numbers. Stored titles and exported values are unchanged by this display logic.

## CSV conventions

CSV is UTF-8 with a BOM, comma-separated, with CRLF record endings and a final CRLF. Every cell is quoted and embedded quotes are doubled. Multiline values serialize safely, although collected table whitespace is normally normalized. Booleans serialize as true/false; postingLink objects serialize as JSON inside the quoted CSV cell.

Potential spreadsheet formulas receive a leading apostrophe: text beginning with whitespace followed by =, +, @, or -, or beginning with tab/CR/LF. This intentional CSV-only protection changes those exported cells; JSON retains the original stored text. Use a CSV parser rather than splitting lines/commas manually. Spreadsheet software may still infer numeric types; import the id column as text if leading zeros matter.

Both formats download as scope-postings-<collection timestamp>.<csv|json>, with timestamp colons and periods replaced by hyphens. Exporting from a filtered viewer still includes the entire snapshot.

## Local storage and refresh

Saved removal records may include a temporary `undo` payload containing an opaque token, a millisecond expiry timestamp, and a validated version-1 Saved record. Undo is available for five minutes and restores a local save; it does not change SCOPE or raw exports. The background strips this payload from library replies, rejects stale/expired tokens, and discards expired undo copies when reading the library. Persistent exclusions remain compatible with older records lacking this payload. Temporary undo copies do not establish opener membership.

- `snapshot`: one latest complete schema-1 snapshot shared by all popup/viewer openings.
- `run:<tabId>`: run ID, source tab/URL, status, start time, message, current page, unique collected count, and total. Status is running, canceling, complete, canceled, or error.
- `viewerPreferences:v1`: versioned search/filter/sort/page-size/column preferences, separate from posting data.

Preferences also contain `facetOrder` for organizations, locations, statuses, and terms. Values are az, za, count, or selected. Missing/invalid values in older preferences default to az. These controls reorder filter choices only; they do not sort results or change the snapshot. Option counts are counts in the entire saved collection, including zero-count selections retained from a previous snapshot. Clear filters preserves option order, result sort, columns, and page size while clearing list-search text and actual filters.

A successful commit writes the snapshot and complete run state together. Before commit, schema/source/total/count/unique IDs must match the running collection. Failed/canceled runs preserve the previous snapshot. The old snapshot source-tab ID is no longer written or used for posting navigation.

There is no history, scheduling, external server, telemetry, or upload. Storage is browser-profile local and temporary Firefox installs are not a dependable permanent backup. Download important snapshots; see [installation guidance](../README.md).

## Saved and geography storage

`saved:<id>` contains `{ version: 1, savedAt: <ISO timestamp>, posting: <captured Posting> }`. It is an independent local save, never a change to SCOPE's shortlisted flag. Individual keys support serialized background mutations without overwriting another tab's saves. A successful collection atomically updates saved copies present in the new search alongside the snapshot/run; absent Saved IDs retain their last captured copy. Failure/cancellation leaves them intact. Remove from Saved deletes the copy and stores a local exclusion.

`viewerPreferences:saved:v1` holds the Saved tab's preferences independently of All postings. Saved rendering unions current SCOPE-shortlisted rows with local retained records, excluding Applied and locally removed IDs; it combines current values with retained records and validates each record before display. Opening supports current-snapshot membership or a valid Saved/Applied record. Retention is one current captured copy per saved ID, not collection-version history. Invalid records are left stored but excluded from display.

Current collection CSV/JSON exports do not include local Saved/Applied libraries. Full backup/restore includes these records; see below. Browser-profile loss/uninstall or temporary Firefox storage loss can lose local saves.

The globe derives approximate city coordinates in memory from packaged public geography. No coordinate fields are added to Posting, raw exports, or snapshot schema. Geography JSON files are ignored generated assets prepared by the build and bundled into the extension, not extension storage; no private posting data is placed in them. See [geography reference](geography.md).

## Applied and deadline preferences (0.5.0)

applied:<id> contains `{ version: 1, appliedAt: <ISO timestamp>, posting: <captured Posting> }`. It is explicitly marked locally, with Saved's validation/retention/success-only update rules. viewerPreferences:applied:v1 stores separate preferences. Valid Applied records authorize explicit posting opening. Undo deletes only the Applied key, allowing a local save or current SCOPE shortlist to return to Saved.

SCOPE-only entries follow the current snapshot; explicit local saves retain a copy. Preferences add hideExpired (false) and expiredLast (true). Expiry interprets valid displayed dates/times in the user's browser-local timezone; unknown deadlines never expire. Snapshot schema 1, original deadlineText, captured shortlisted, and raw CSV/JSON remain unchanged. Neither local library is included in exports.

## Grouped location preference (0.5.1)

groupGreaterVancouver defaults to false in each view's preferences. locations can contain group:greater-vancouver when enabled; the token matches the six explicit BC member cities. This is viewer-only aggregation, not a Posting location rewrite or schema/export change. Clear filters retains the grouping preference.

## Local Saved removal (0.5.3)

savedRemoved:<id> holds `{ version: 1, id: <numeric string>, removedAt: <ISO timestamp> }`. It excludes the ID from Saved even when SCOPE still marks it shortlisted or a stale saved copy remains. Refresh/Applied undo do not clear it; Save clears it and retains a copy. Exclusions are validated, local, and excluded from exports; they never change SCOPE or authorize posting opening.

## Relative deadline display (0.5.4)

relativeDeadlines defaults to false in each view’s version-1 preferences and is retained by Clear filters. It changes table presentation of future deadlines within fourteen local calendar days only; original deadlineText, deadline filtering/sorting, and exports remain unchanged.

Viewer version-1 preferences accept scope values all, title, organization, division, location and id; missing/invalid scopes default to all. Older all/title preferences remain compatible. Company-search return history is held only in the open viewer and adds no storage or export fields.

## Full Scoped backup (0.7.0)

`src/backup.ts` defines a separate JSON envelope: `{ format: "scoped-backup", version: 1, exportedAt: <ISO timestamp>, data: <key/value object> }`. Downloads are named `scoped-backup-<timestamp>.json`, pretty-printed with a final newline. File size is limited to 25 MB for download/restore. This is not a schema-1 collection export; raw collection CSV/JSON formats remain unchanged.

Only snapshot, saved:<id>, applied:<id>, savedRemoved:<id>, viewerPreferences:v1, viewerPreferences:saved:v1 and viewerPreferences:applied:v1 are portable. Library keys/IDs/timestamps/Posting fields and snapshot invariants are validated before use. Export refuses invalid durable records instead of silently losing them. Posting/snapshot fields are explicitly copied; unknown nested fields and temporary removal undo payloads are stripped. Preferences use the existing version-1 reader/defaults, including all three views even when unopened. Unsupported preference versions and unknown nonempty top-level data keys are rejected. No run state, SCOPE session, permission grants or semantic cache is restored.

Restore is an explicit merge: incoming snapshot/preferences replace matching values; an absent snapshot preserves the destination snapshot. Every incoming library ID restores its complete Saved/Applied/removal combination. Missing counterpart keys for that ID are written as null in the same storage.set, so an older destination removal/mark cannot override the restored state. Existing readers ignore null; exports omit it. Destination IDs absent from the backup remain. Validation and active-collection checks precede the single serialized background write. Invalid input/storage failures never clear the destination. Reopen viewers to load restored preferences. See [backup and distribution](distribution.md).
