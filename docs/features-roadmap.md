# Feature ideas after Saved and globe

Status: remaining proposals, with implemented milestones noted below. Saved (including SCOPE shortlist), Applied, local-time expiry presentation, and the offline globe are implemented in 0.5.0. Notes, custom Applied entries and Not relevant marking are also now implemented. These priorities target fast decisions about which positions deserve more attention.

## 1. On-demand posting preview and comparison

Load a full posting only when the user asks for its preview, then cache the captured text locally. A useful preview would show responsibilities, qualifications, work arrangement, duration, salary, and application instructions when SCOPE actually supplies them. Missing fields should say Not provided. Keep normal collection table-only, avoid fetching every description, and use the signed-in ID-search flow after inspecting the actual detail markup.

Pair this with a Compare view for two to four Saved positions. Align organization, role, city, term, deadline, application count, and any explicitly captured detail fields. This reduces repeated tabs and makes tradeoffs visible. Until previews exist, comparison can still use table fields while clearly showing its limits.

## 2. Notes, tags, and review status

Notes, custom Applied entries and reversible Not relevant marks are now implemented, including full backup support. User-defined tags and richer review statuses below remain proposals.

Attach personal notes, reasons to apply, questions to research, and user-defined tags to posting IDs. Use explicit local statuses such as To review, Interested, Researching, and Passed, complementing the existing Applied mark. A reversible Hide action can remove passed positions from the ordinary list without losing them. Never update SCOPE or infer an application submission from clicking a title.

Full collection/library/preferences backup and restore is implemented in 0.7.0, separately from raw SCOPE CSV/JSON. Future annotations should extend that portable format. Browser-profile/temporary-install storage should not be the only copy of a personal decision log.

## 3. Named searches and keyword highlighting

Save a filter/query combination under a name such as Data in Vancouver or Research roles. One click restores it after refresh. Highlight the matching words in position text so users can scan why a result appeared. Optional include/exclude keyword sets can express interests without opaque suitability scores or guessed qualifications.

## 4. Changes since the previous collection

Show IDs added/removed and captured fields changed after a successful refresh. Preserve the previous snapshot until success and label differences as changes between collections; a different SCOPE search may produce a different set. Removed from a search must never imply Expired, and Scoped-added IDs must remain distinct from SCOPE's captured NEW flag. Restrict retention to the history needed for this explicit feature.

## 5. Deadline review and faster triage

Group positions by source calendar deadline, with clear Unknown entries, to make a review queue. Show application counts as captured context, not a probability of acceptance. Expiry now uses the user-requested browser-local timezone. A future calendar/countdown should clearly carry that same interpretation.

Add keyboard shortcuts for next/previous row, Save, Details, and focus search, with a visible shortcut guide and no shortcuts while typing in form fields. A compact preview pane could keep the user's place instead of expanding a tall row. Bulk selection could later support saving/removing a batch with clear feedback.

## 6. Employer overview and verified details

Group opportunities from the same organization and expose available roles, locations, terms, and deadlines. This helps users avoid overlooking related openings or repeatedly researching one employer. External employer links, work-mode filters, discipline tags, and personalized ranking should wait for captured/verified data or explicit user input; titles and city labels alone are insufficient to establish those facts.

Suggested implementation order: on-demand preview with comparison; notes/status with backup; named searches; then collection changes and keyboard triage. Each milestone should update the data contract, synthetic tests, user guide, and live acceptance checks.
