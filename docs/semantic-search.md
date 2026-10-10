# Offline semantic search

Version 0.6.0 adds an optional Semantic · local mode to the viewer. Keyword remains the default for existing preferences. The mode and sorting are remembered independently in All/Saved/Applied. Enabling semantic mode selects Relevance, strongest first; expired-last grouping still precedes relevance. Users can select ordinary column sorting. Clearing filters retains search mode and other display preferences.

## Ranking and exact constraints

The worker embeds stable labelled text: cleaned positionTitle, organization, division, and original location. Field-specific scopes embed only the cleaned title, organization, division or location. Posting-ID scope uses literal keyword matching without inference. Raw titles, exports, captured deadlines and source records are unchanged. Employer requisition numbers remain intact. IDs, deadlines, application counts and library marks are not embedded. Numeric-only queries perform exact ID lookup without inference.

MiniLM returns 384-dimensional float32 vectors with mean pooling and normalization, truncated at 256 word pieces. Queries use the same model. Ranking is 85% cosine similarity and 15% literal query-token coverage; quotes group tokens for the lexical component, not an exact semantic requirement. Results require cosine at least 0.10, or complete literal token coverage. The earlier 0.20 floor and strongest-result-dependent cutoff were lowered/removed at the user's request to include weaker matches. This is a recall/precision heuristic, not a probability or guarantee; representative relevance evaluation remains pending.

Each scored result has a 2px muted green bar along its bottom edge, also when column sorting is selected. Its width is the composite ranking score times the full row/card width, clamped to 0–100% for painting. The exact score (three decimal places) remains in the row hover tooltip and visually hidden screen-reader text; there is no visible numeric label. This is not a confidence percentage, and the 0.10 inclusion cutoff applies to cosine similarity rather than the composite score. Bars appear only for completed current-query semantic results; keyword, loading/error fallback, and posting-ID scope have no bar. Editing the query removes stale bars and tooltips immediately during debounce. This is derived UI, never added to snapshots, library records or raw exports.

Semantic scoring covers the full active collection, including retained Saved/Applied records, before existing exclusions, exact facets, dates, counts, flags and pagination. Globe receives the same filtered matches. Exclusions remain literal and scope-dependent. Expired-last remains authoritative and can be disabled using the existing control. Unknown deadlines remain unknown. Date calculations use browser-local time. Natural-language constraints such as “before Friday” or “in Vancouver” are not parsed into filters; users must use the exact controls. Relative deadlines are never embedded or cached.

While loading or after an inference failure, the viewer displays ordinary keyword results and states this explicitly. A failed attempt does not automatically retry on every render; Retry semantic search restarts it. Request revisions reject stale query/scope/snapshot replies, including the input debounce interval. New worker requests supersede queued work and interrupt between records; disabling mode/clearing the query terminates active inference. Collection state and posting-opening authorization are independent.

## Assets and privacy

Normal ready/idle semantic search has no persistent status/helper message below the input. Loading, inference failure/retry, and unavailable persistent-cache feedback remain visible when applicable. The relevance bar mixes 40% of the theme green with 60% of the surface color to reduce brightness in light and dark themes; its width still represents the same score.

Transformers.js 3.8.1 and its matching ONNX Runtime run single-threaded WebAssembly inside a packaged module worker. They load lazily; ordinary keyword browsing never starts inference. No WebGPU, native program, remote service, new API permission or new host permission is required. The manifest allows WebAssembly with script-src 'self' 'wasm-unsafe-eval'; workers and connections are restricted to self. Remote model loading is disabled, and model/runtime URLs explicitly point into the extension package.

`scripts/semantic-assets.mjs` prepares the public Xenova/all-MiniLM-L6-v2 ONNX conversion at pinned revision 751bff37182d3f1213fa05d7196b954e230abad9. It verifies model SHA-256 and tokenizer/config Git blob identities and lengths before writing. First setup requires internet access; subsequent builds verify/reuse local files. Run npm run setup:search separately if needed. Installed extensions never fetch from Hugging Face or a CDN.

The quantized model is 22,972,370 bytes; the matching WASM runtime is approximately 21.6 MB, plus tokenizer/JS/license overhead. These assets increase package size and have runtime memory overhead beyond file size. Model and runtime code/data are generated/ignored; preparation scripts, model attribution and ONNX license are tracked. Builds include full Apache-2.0/MIT licenses and public/models/SOURCES.txt. A checked build adaptation removes the legacy Function global fallback, fixes the WASM factory import to the packaged module and removes missing source-map references; runtime/SCOPED-RUNTIME-CHANGES.txt records those modifications. No JavaScript eval permission is added.

## Derived cache

IndexedDB scoped-semantic-v1 stores disposable vectors separately from authoritative extension storage. Keys contain model/revision/quantization/pooling/text-format version plus SHA-256 of the exact input. Same text reuses vectors across searches and views; changed embedded fields create a new entry. Deadline or mark changes do not invalidate embeddings. Model/text-format changes must bump embeddingVersion.

Vectors are validated for dimension, finite components and nonzero content. Corrupt entries are recomputed. Storage failure/private-browser restrictions degrade to bounded worker memory and a visible cache warning. Persistent storage is pruned every 100 writes to 12,000 entries (at most 99 extra between prunes); memory holds at most 6,000. Pruning may discard reusable derived vectors, which are regenerated when needed. The cache is not included in CSV/JSON exports and never grants posting-opening access.

## Verification

Run npm test, npm run build, npm run validate. The package validator verifies pinned model bytes, runtime assets/licenses, the CSP, and the inference worker in both packages.

Optional npm run test:semantic:browser launches an isolated headless Edge/Chromium profile with the built Chrome extension and synthetic postings; set SCOPED_BROWSER if necessary. It blocks external requests, checks actual WASM inference, related-title recall, exact location filtering, reload/cache reuse, and narrow viewport width. It uses no personal profile or signed-in SCOPE page. See [acceptance](acceptance.md) for recorded results and pending Firefox/Chrome checks.
