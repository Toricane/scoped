# Data format and local storage

The authoritative TypeScript contract is `src/types.ts`; serialization is in `src/export.ts`. The viewer uses the stored snapshot directly. CSV/JSON import is not implemented.

## Snapshot JSON

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
9. `deadlineText`: original normalized text. No timezone, expiry, or countdown is inferred.
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

- `snapshot`: one latest complete schema-1 snapshot shared by all popup/viewer openings.
- `run:<tabId>`: run ID, source tab/URL, status, start time, message, current page, unique collected count, and total. Status is running, canceling, complete, canceled, or error.
- `viewerPreferences:v1`: versioned search/filter/sort/page-size/column preferences, separate from posting data.

A successful commit writes the snapshot and complete run state together. Before commit, schema/source/total/count/unique IDs must match the running collection. Failed/canceled runs preserve the previous snapshot. The old snapshot source-tab ID is no longer written or used for posting navigation.

There is no history, scheduling, external server, telemetry, or upload. Storage is browser-profile local and temporary Firefox installs are not a dependable permanent backup. Download important snapshots; see [installation guidance](../README.md).
