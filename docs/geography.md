# Offline geography

The globe uses D3 orthographic projection; Flat map uses Natural Earth projection. SVG supports pointer rotation/panning, wheel and button zoom, keyboard arrows/+/- on the focused map, accessible city circles, and a separate city-button list. Circle area, rather than radius, is proportional to the count of currently filtered postings in that city.

## Data sources and attribution

- [GeoNames gazetteer](https://download.geonames.org/export/dump/): cities1000.zip, admin1CodesASCII.txt, and countryInfo.txt, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The packaged derivative retains canonical/ASCII names, country/admin/region, longitude, and latitude; other fields and alternate-language names are omitted.
- [World Atlas](https://github.com/topojson/world-atlas): countries-110m.json, countries-50m.json, and countries-10m.json, based on [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) world geometry.
- [D3 projection reference](https://d3js.org/d3-geo/projection): globe rotation, clipping, and planar projections. d3-geo/topojson-client and their dependency license notices are included in [packaged notices](../public/maps/SOURCES.txt).

The October 10, 2026 extract contains 171,176 places. City centres are approximate, not employer office addresses. The dataset includes populated places over 1,000 people and some administrative seats; smaller places may be missing. Boundaries are illustrative, not authoritative jurisdiction advice.

## Packaging and refresh

`public/maps/cities.json` contains version, generation timestamp, country names, total count, and chunk filenames. Five numbered JSON chunks contain tuples in this order: name, ASCII name, country code, admin code, region name, longitude, latitude. Each chunk remains below Mozilla lint's 5 MB parsing limit. `countries.json` holds the overview topology; countries-50m.json and countries-10m.json contain finer zoom levels; SOURCES.txt preserves attribution and license notices.

Geography JSON is generated locally and ignored by Git. Keep scripts/geography.mjs, scripts/update-geodata.mjs, package-lock.json, and public/maps/SOURCES.txt in version control. Build automatically prepares missing assets, then Vite copies them into both packages. Initial preparation needs internet access; existing assets or a complete verified source cache allow offline builds.

Commands:

```sh
npm run setup:maps  # prepare missing assets or reuse the local cache
npm run update:maps # explicitly download current public data again
npm run build
npm run validate
```

The update script fetches only fixed public dataset URLs; it receives no posting data. Review updated counts, output, notices, and licenses after an update; generated JSON remains untracked. The globe lazy-loads its code and packaged JSON only when first opened. No external geocoding, map tile server, API key, or additional host permission is used.

## Matching and counts

`src/location-model.ts` indexes canonical/ASCII names, handles accents/punctuation and St./Saint, and accepts explicit City-suffix variants such as New York City/New York. Comma-separated country/region hints must match the dataset, with Canadian province abbreviations and common UK/USA variants supported. A name must resolve to exactly one place. Ambiguous duplicate names, broad labels, multiple-city strings, blanks, and absent places remain unmapped; the matcher does not choose the most populous candidate or invent coordinates.

Postings at the same resolved city centre group together. Source location strings remain unchanged and are retained on each group so choosing a city can filter the list by every matching source variant. Each filtered posting is counted once, either in a city group or the unmapped list. All/Saved/Applied selection and other viewer filters apply before grouping. Map view includes all matching postings, independently of list pagination.

The current sample preview mapped 663 of 764 postings into 85 cities and showed 101 unmapped postings separately. This describes that sample and dataset, not universal coverage. City/unmapped buttons provide a usable fallback for small/overlapping circles and inaccessible or ambiguous map points.

## Zoom and hover text (0.5.0)

Both projections support 0.7–80× zoom. Wheel zoom preserves the point under the cursor; buttons/keyboard zoom around the centre. Globe dragging/arrows slow down at high zoom; geometry clips to the canvas. Circle hover/focus adds SVG location/count text beside the circle without a native title tooltip. The status line and city list provide accessible alternatives.

## Optional Greater Vancouver group

The Locations option combines only Vancouver, North Vancouver, Burnaby, Richmond, Delta, and Surrey with a BC/British Columbia label (optional Canada/CA country), plus exactly “North Vancouver” without a province. The latter is an explicit exception based on the supplied SCOPE export; it does not extend to ambiguous bare Vancouver/Richmond names or contradictory province hints. It is a user-requested convenience group, not all municipalities in an official region. The globe circle aggregates filtered postings once, placed at the bundled Vancouver city centre; it is not an individual workplace pin. Original location variants are retained for selection. Other cities and unresolved locations remain separate.

## Higher-detail boundaries (0.5.2)

The globe/flat map starts with the 110m overview, lazily loads 50m at 2×, and loads 10m at 6×. These are Natural Earth map scales (not metres per pixel). Each topology is bundled below 5 MB, cached per explorer, and selected according to current zoom; late loads cannot override a zoomed-out view. Failed detail loads retain lower-detail geometry and display a retry-via-reload message without a fetch loop. Adaptive SVG projection precision is 0.2 viewBox pixels. This improves coastlines/islands/borders; it does not add street tiles or workplace geocoding.

High-detail globe rendering indexes polygon bounds and omits offscreen countries/islands before projection. The visibility envelope includes the entire rectangular viewport, dateline wrapping, and pole coverage. This reduces streaming work without simplifying the visible geometry.

## Formatting and canonical-name aliases (0.5.3)

Matching accepts Victoria BC, Toronto. ON, and punctuation-only trailing comma fields such as Vancouver, BC, . without rewriting source text. Quebec City, QC matches Québec; Sudbury, ON matches Greater Sudbury. City/Greater aliases must yield one candidate after all substantive hints agree. Ambiguous bare names, remote/broad areas, multiple-city strings, and absent places stay unmapped. No remote geocoding or inferred workplace coordinates are added.

## Build cache and reproducibility

The ignored .cache/geography directory stores downloaded source files and retrieval timestamps/URLs/SHA-256 hashes. Regenerating from this verified cache produces the same city JSON; corrupt cached inputs fail with an explicit update:maps instruction. Country topologies come from the lockfile-pinned world-atlas dependency. GeoNames publishes changing dumps, so a fresh download on another date may contain different data: this workflow reproduces the preparation process, not a permanently pinned historical city extract. Existing packages embed their data and never download it at runtime. Unit tests use synthetic source archives and dependency-provided topology, so npm test needs no geography download.
