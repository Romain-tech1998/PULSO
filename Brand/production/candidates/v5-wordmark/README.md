# Pulso logo candidate — V5 point-centering and direct wordmark trace

**Status:** Candidate for product-owner review only. V5 is not approved, integrated, staged, or committed.

## Scope

V5 is a strictly targeted correction of V4. It preserves V4’s exterior symbol geometry: the open stroke, tail, external contour, rendered scale target, and source-faithful gradient `#7336C1` → `#EA3E81` → `#FE7C5C`. It introduces only:

1. a recentered point; and
2. a direct vector trace of the reference wordmark.

The binding source is the upper-left **LOGO PRINCIPAL** panel of [`Brand/logo.png`](../../../logo.png). No alternate font is used in V5.

## Point-centering measurement

The upper loop was fitted as a circle from the three cubic segments that form its circular arc. The tail was excluded from the fit.

| Measure | Value |
| --- | ---: |
| Fitted loop centre before V4’s retained x transform | `(109.295, 98.036)` |
| V4 point centre | `(109.000, 107.000)` |
| V5 final point centre | `(109.246, 98.036)` |
| V4 → V5 point movement | `(+0.246, −8.964)` |
| Retained V4/V5 vertical point diameter | `47` units |

V5 uses the fitted loop centre after applying V4’s unchanged `translate(-7.700 0) scale(1.070 1)` transform. It does not use the complete symbol bounds or the tail to calculate point placement. The point is reviewed at 32, 48, 64, and 256 px in the comparison sheet; no small-size diameter change was needed.

## Direct wordmark reconstruction

The original wordmark was isolated from a 230×88 pixel crop of the principal panel. White-neutral pixels were segmented at a luminance threshold of 180, with four-neighbour connected components. The original antialiased pixel boundaries were simplified and smoothed into closed paths, preserving the perceived visible contours rather than substituting a font.

Each letter remains independently editable in every horizontal master:

- `letter-p` — traced rounded bowl, open counter, and descending stem.
- `letter-u` — traced curved lower construction and rounded vertical terminals.
- `letter-l` — traced tall rounded stem.
- `letter-s` — traced source-specific bend, terminal widths, and curvature.
- `letter-o` — traced outer bowl and inner counter independently.

The five groups are direct vector paths with an `evenodd` fill rule for counters. There is no Satoshi geometry, live SVG text, embedded font, or embedded raster image in reusable masters.

## Composition

The traced 230×88 wordmark is placed at `(232, 51)` and scaled by `1.815789`, yielding the original-reference composition target:

- wordmark height: approximately 160 units;
- wordmark width: approximately 418 units;
- symbol-to-wordmark height ratio: approximately `1.295`;
- horizontal gap: approximately `42` units / `0.202` of symbol height;
- total lockup aspect: approximately `3.000`.

The wordmark is not distorted to preserve V4’s former Satoshi measurements; it follows the measured raster reference.

## Deliverables

### Reusable vector masters

- `pulso-symbol-gradient.svg`
- `pulso-symbol-white.svg`
- `pulso-symbol-black.svg`
- `pulso-wordmark-horizontal-dark.svg`
- `pulso-wordmark-horizontal-light.svg`
- `pulso-wordmark-white.svg`
- `pulso-wordmark-black.svg`

### Raster exports

- `symbol-gradient-1024.png`
- `wordmark-dark-2048.png`
- `wordmark-light-2048.png`
- `app-icon-dark-1024.png` — opaque `#0C0A12`
- `adaptive-icon-foreground-432.png` — transparent
- `splash-mark-1024.png` — transparent
- `favicon-32.png`, `favicon-192.png`, `favicon-512.png`

### Review-only evidence

- `reference-v5-comparison-review.png` shows the reference, V4, V5, identical-canvas overlay and difference views, point-centering guides, isolated letter comparisons, small-size symbols, horizontal variants, favicons, and mask tests. It contains a raster reference crop and is not a reusable app asset.

## Exclusions

V5 does not authorize app integration, asset replacement, `app.json` changes, UI-0001 or PROJECT_INDEX changes, a tagline, a new product direction, or a font/provider decision. It remains pending explicit product-owner approval.

