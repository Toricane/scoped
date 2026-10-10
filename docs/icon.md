# Scoped app icon

Source artwork: [assets/scoped-icon.png](../assets/scoped-icon.png), generated with the built-in image generation tool. The transparent image combines a green optical spotting scope and a spreadsheet sheet. The user approved it as the extension icon.

Browser-ready PNG sizes are checked in under [public/icons/](../public/icons/) (16, 32, 48, 64, 96, 128, and 256 pixels). These are downscaled from the source with alpha preserved. Vite copies them into each browser package. Manifests reference the toolbar and extension-management sizes; the popup uses the 96-pixel asset at 48 CSS pixels. Packaging is defined in [scripts/build.mjs](../scripts/build.mjs); [scripts/validate.mjs](../scripts/validate.mjs) verifies packaged dimensions.

## Generation prompt

Use case: logo-brand. Asset type: square app icon for Scoped, a Firefox/Chrome extension for gathering job postings into spreadsheets. Primary request: a recognizable real optical spotting scope/telescope paired with a spreadsheet grid, predominantly green. Style: polished, simple, dimensional illustration with bold silhouettes, minimal details, crisp edges. Subject: short emerald-green spotting scope with large circular front lens, angled eyepiece and compact mount, alongside an ivory spreadsheet sheet with a green header and a clear 3-by-3 grid. Composition: a single coherent centered icon filling about 85% of a square, scope and sheet overlap naturally, readable at toolbar size. Palette: emerald and forest green with mint lens highlights and ivory sheet. Transparent background, no lettering, no typography, no watermark, no extra symbols, no surrounding scene. Produce one icon, not a sheet of variants.
