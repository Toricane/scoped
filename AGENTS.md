# Working on Scoped

These instructions apply to the entire repository.

## Start here

Scoped collects every page of a signed-in SCOPE search, keeps one complete local snapshot, and provides a popup, searchable viewer tab, and explicit posting-title links. Read [README.md](README.md) for the user workflow and [docs/README.md](docs/README.md) for the documentation map.

Before editing, read the relevant reference:

- [Development and architecture](docs/development.md): code map, commands, state/messages, and implementation invariants.
- [SCOPE page structure](docs/scope-page-structure.md): extraction, pagination, and overview ID-search adapter.
- [Data format](docs/data-format.md): schema, exports, storage, and compatibility.
- [Acceptance status](docs/acceptance.md): user-confirmed behavior, automated evidence, and pending live checks.

`docs/history/` is historical context, not current implementation guidance. Do not restore form replay, source-page posting lookup, or requirements to recollect link metadata.

## Development workflow

Use Node.js 22.13+; install with `npm ci`. Run `npm test`, `npm run build`, and `npm run validate` for implementation changes. `build` includes TypeScript checks and replaces `dist/`; `validate` needs an existing build. Use `npm run check` for a standalone type check. For docs-only changes, verify links and claims against source rather than rerunning application tests.

Edit source and `scripts/build.mjs`, never generated packages. Firefox uses `dist/firefox` (142+); Chrome uses `dist/chrome` (120+). Reload the extension and reopen its pages after rebuilding. Keep package.json, package-lock.json, and the build-script manifest version consistent when releasing changes.

## Behavior to preserve

- Collect only `SOURCE_URL`'s origin/path. Preserve search/sort, start at page 1, traverse existing pagination sequentially, reacquire replaced DOM, and leave SCOPE on the last collected page. Never evaluate handler strings or hardcode opaque actions/dynamic input suffixes.
- Collection never opens details or invokes Apply, Shortlist, or Not Interested. Explicit viewer title clicks open a separate overview tab and search the numeric ID; they must not alter the collection tab or replay forms.
- Reconcile page/range/ID/total invariants and deduplicate string IDs. Failed, canceled, stale, or incomplete runs cannot overwrite the previous successful snapshot. Keep the collector in the source tab and authoritative state in storage; workers can suspend.
- Validate opener sender/tab identity and snapshot membership. Keep posting navigation/downloads outside the collection transition queue. Serialized MAIN-world functions must be self-contained.
- Request only the declared SCOPE host directly in the permission button's click handler before awaiting. Check access before posting navigation; retain Firefox/Chrome fallback instructions. Never auto-prompt on load, force browser permission preferences, or confuse missing access with session expiry.
- Preserve blank values, raw title suffixes, original deadline text, CSV formula protection, and schema-1 compatibility. Only `positionTitle` removes a matching ID/code for display/search/sort; preserve employer requisition numbers. Older snapshots open positions using ID alone.
- Keep viewer queries across the entire snapshot, preferences versioned, and storage-event reads protected against stale results. Use text APIs for posting content. Keep results/sidebar independently scrollable and pagination within the viewport; jsdom cannot prove layout.
- Navigation must wait for tabs.update acknowledgement, inspect current tab state, ignore opener/about:blank completion, and probe the permitted document when URL metadata is missing. Preserve cached/buffered completion checks and distinct permission/redirect/DOM errors.
- Keep data local and permissions narrow. Do not capture credentials, session/action/form fields, or add uploads, analytics, broad host access, or downloaded site assets. Use sanitized synthetic fixtures; preserve and exclude the user's CSV from Git.

## Documentation and evidence

Update user-facing workflows in README, technical contracts in their reference docs, and verification evidence in acceptance.md. User reports confirm only the behavior described; fixtures and previews do not establish live browser compatibility. Firefox collection, posting opening, and the latest permission fix are user-confirmed. Chrome and individually unreported edge cases remain pending. See the acceptance document before claiming broader success.
