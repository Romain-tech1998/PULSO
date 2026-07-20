# Pulso official production identity — v1

**Status:** Approved by the product owner on 2026-07-20.

This directory is the canonical Pulso production-brand baseline. It is copied byte-for-byte from the approved V5 candidate (`Brand/production/candidates/v5-wordmark`) and uses stable production filenames.

## Binding identity

- The approved logo has no tagline.
- The symbol uses fixed external geometry and a centred point. Do not alter proportions or recenter the point.
- The wordmark is custom directly traced vector lettering; it is not Satoshi and must not be replaced.
- The official brand-asset gradient is `#7336C1` → `#EA3E81` → `#FE7C5C`.
- This logo gradient is distinct from the Accepted semantic UI palette and must not replace it.
- Candidates V1–V4 are rejected historical candidates and are not approved for application use.

## Canonical files and intended use

| File | Intended use |
| --- | --- |
| `pulso-symbol-gradient.svg` | Primary scalable standalone symbol |
| `pulso-symbol-white.svg` / `pulso-symbol-black.svg` | Monochrome standalone symbol |
| `pulso-logo-horizontal-dark.svg` | Horizontal mark on dark surfaces |
| `pulso-logo-horizontal-light.svg` | Horizontal mark on light documentation or non-MVP contexts |
| `pulso-logo-horizontal-white.svg` / `pulso-logo-horizontal-black.svg` | Monochrome horizontal mark |
| `pulso-symbol-gradient.png` | 1024 px raster standalone symbol |
| `pulso-logo-horizontal-dark.png` / `pulso-logo-horizontal-light.png` | 2048 px horizontal raster exports |
| `pulso-app-icon-dark.png` | Opaque `#0C0A12` 1024 px app-icon candidate |
| `pulso-adaptive-foreground.png` | Transparent 432 px Android adaptive foreground |
| `pulso-splash-mark.png` | Transparent 1024 px splash mark |
| `pulso-favicon-32.png` / `pulso-favicon-192.png` / `pulso-favicon-512.png` | Named favicon sizes |

## Usage safeguards

- Use files as supplied. Do not crop their viewBox or export padding; that padding is the validated clear-space boundary.
- Use the supplied favicon files at their named sizes. Do not reconstruct a smaller logo variant without a new documented decision.
- Do not recolor the gradient, alter the symbol or point, change lockup proportions, or replace the wordmark without a new documented decision.
- No tagline may be attached to the logo.
- Satoshi may remain an application interface font only under UI-0001’s separate Fontshare-license conditions; it is not the logo font.

The checksum manifest in `SHA256SUMS.txt` verifies this canonical baseline. Review sheets, mockups, original reference rasters, and candidate directories are not runtime assets.
