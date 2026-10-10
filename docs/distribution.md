# Testing, backup, and distribution

## Keep using the temporary add-on

`npm run build` still produces `dist/firefox` and `dist/chrome`. Firefox/Zen temporary installation remains `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist/firefox/manifest.json`. After a rebuild, use **Reload** on the existing temporary add-on and reopen extension pages. Do not remove the add-on to update its files.

Temporary installs disappear on browser restart. Storage retention during temporary installation and transition to a signed installation has not been verified for Scoped. Same browser/profile alone is not a migration guarantee. Keep the Firefox add-on ID `scoped@scope-exporter.local` unchanged. A normal update of an installed signed extension should retain its local state; uninstall/profile loss can remove it.

## Back up before switching

1. Finish/cancel any collection. Build, then reload the existing temporary add-on.
2. Open the popup → **Backup & restore** → **Open backup & restore**.
3. Choose **Download full backup**. Verify the download completed and keep the JSON file privately. A collection CSV/JSON export is not a full backup.
4. Install the signed version only after the backup is available.
5. Open its Backup & restore page, choose the backup file, inspect the counts/date and restore explanation, then choose **Restore this backup**.
6. Reopen viewer tabs and check All/Saved/Applied and their preferences before discarding any backup.

Full backups include the latest complete collection, retained local Saved and Applied copies, custom Applied entries, private notes, Not relevant marks, persistent Saved removals, and all three views' preferences. They exclude collection runs, temporary Undo payloads, semantic caches, host grants, SCOPE cookies/session and packaged geography/model assets. A fresh installation needs its own site permission and signed-in SCOPE session for opening/collection. Restore backups with new annotation/custom-entry keys using the current build; older builds reject those keys.

Restore validates the complete file before writing. It replaces the backed-up snapshot and preferences; without a snapshot it keeps the current collection. For each backed-up library ID it restores the complete local Saved/Applied/removal state, clearing conflicting local counterparts. Other local IDs remain. This is a merge, not an exact rollback of later-added IDs. Back up the destination first. Restore is blocked while any collection is running/canceling, uses the background storage queue and commits in one storage write. Invalid files/storage errors do not clear existing data. Existing viewer tabs update posting data; reopen them to load restored preferences.

## Prepare release files

Use Node.js 22.13+:

```sh
npm ci
npm test
npm run package:release
```

The release command runs build and validate, then creates `release/<version>/` with:

- `scoped-firefox-<version>.zip`: unsigned Mozilla submission package, manifest at archive root.
- `scoped-chrome-<version>.zip`: unpacked developer build or Chrome Web Store submission.
- `scoped-source-<version>.zip`: source, lockfile, preparation scripts, synthetic tests, icons, attribution and build documentation for reviewers.
- `SHA256SUMS.txt`: SHA-256 checksums for the three archives.

Archives are read back and compared against packaged bytes. Release output and backup filenames are ignored by Git. Source packaging uses explicit project paths and Git ignore rules, excluding user CSVs, browser profiles, caches, dependencies and generated map/model/runtime assets. Regenerate packages after changing source/docs. Do not edit generated packages. Keep package.json, package-lock.json and scripts/build.mjs versions aligned.

Reviewers can extract the source, run `npm ci`, `npm test`, `npm run build` and `npm run validate`. A first build downloads the public geography and pinned search model; later builds reuse verified assets. See [development](development.md), [geography](geography.md) and [semantic search](semantic-search.md). Windows is the exercised build platform; a fresh source-archive build and Mozilla review remain separate acceptance steps.

## Firefox: signed, unlisted pilot

1. Sign in to the [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/).
2. Submit a new add-on for **self-distribution / unlisted**, using the Firefox ZIP. Keep the existing add-on ID.
3. Supply the source ZIP and reproducible build instructions when requested. Describe the bundled offline model/WASM/geography and their license notices. Explain the SCOPE-only permission and that posting data stays local. Review/complete Mozilla's policy and agreement steps personally.
4. After validation/signing, download the **signed `.xpi`**. The local ZIP is not a permanent-install substitute.
5. Share the signed file with testers. Firefox desktop: `about:addons` → gear menu → **Install Add-on From File** → select the `.xpi`. Test Zen separately; Scoped's target is Firefox 142+.
6. Test signed restart persistence, permissions, collection/opening, backup and restore in the real browser. Synthetic checks do not establish those passes.

An unlisted file can be forwarded; it is not an access-controlled tester list. It still follows Mozilla policies and can be reviewed. Each release must be signed. Without an `update_url`, distribute newer signed files for manual installation over the existing copy. A later public listing with the same ID can deliver newer listed versions automatically. Alternatively configure a hosted update manifest and signed packages; Scoped currently does not configure this hosting.

References: [signing/distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/), [source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/), [self-distribution/updates](https://extensionworkshop.com/documentation/publish/self-distribution/), [temporary persistence](https://extensionworkshop.com/documentation/develop/testing-persistent-and-restart-features/).

## Chrome developer pilot and store publishing

Testers extract the Chrome ZIP into a permanent folder. Open `chrome://extensions`, enable Developer mode, choose Load unpacked and select that folder. They do not need Node.js. For updates replace files in the same folder and Reload, rather than Remove/reinstall. Before moving to a store installation, make a full backup; the current manifest has no public key pinning its development identity to a store identity. Target is Chrome 120+; live Chrome SCOPE acceptance remains pending.

For store installation/automatic updates, register a Chrome Web Store developer account, upload the Chrome ZIP, fill in listing assets/description and accurate privacy/permission disclosures, then submit for review. Choose **Private** with trusted testers/Google Group for enforced limited access, **Unlisted** for anyone with the URL, or **Public** for discoverability. All undergo policy review. Keep updates under the same store item to preserve identity; a separate beta listing has separate data. [Chrome distribution options](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution), [development identity key](https://developer.chrome.com/docs/extensions/reference/manifest/key).

Public Mozilla publication similarly needs a listed submission, listing copy/screenshots, accurate data/permission disclosures and review. Installed users' private snapshots are not included in either store upload.
