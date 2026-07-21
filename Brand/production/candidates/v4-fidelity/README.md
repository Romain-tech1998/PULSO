# Pulso logo candidate — V4 fidelity correction

**Status:** Candidate for visual review only. V4 is not approved, integrated, staged, or committed.

## Scope and source

V4 is a narrow correction of V3, not a new visual direction. It retains V3’s open, slender pin construction, long lower-left tail, no-tagline rule, and logo-specific gradient: `#7336C1` → `#EA3E81` → `#FE7C5C`.

The upper-left **LOGO PRINCIPAL** panel in [`Brand/logo.png`](../../../logo.png) is the primary source. Its colored symbol and white wordmark were measured on a normalized 390×137 crop. Four luminance thresholds (100, 140, 180, and 210) were used to reduce antialiasing/glow sensitivity. Other original Brand sheets were not used to introduce any alternate geometry.

## Measured composition

| Measurement                        | Reference |    V3 |    V4 |
| ---------------------------------- | --------: | ----: | ----: |
| Central-dot / symbol-height ratio  |     0.228 | 0.135 | 0.227 |
| Symbol aspect ratio                |     0.781 | 0.729 | 0.783 |
| Wordmark aspect ratio              |     2.614 | 2.457 | 2.613 |
| Symbol / wordmark height           |     1.295 | 1.278 | 1.294 |
| Horizontal gap / symbol height     |     0.202 | 0.251 | 0.203 |
| Total horizontal-logo aspect ratio |     3.000 | 2.903 | 3.005 |

Reference values use the median visible bounds across the four thresholds. V3 and V4 values use rendered vector bounds at the same scale. The source and V4 in `reference-v4-measurement-review.png` use the exact same canvas, scale, and alignment.

## V3-to-V4 corrections

### Central dot

The principal reference’s dot measures 24–26 px against a 110–114 px symbol height. V3’s 28-unit diameter represented only 13.5% of its rendered symbol height. V4 moves the dot to the measured optical center and sets it to a 47-unit rendered diameter (22.7% of rendered symbol height), matching the source ratio within 0.1 percentage points.

### Wordmark

V4 starts from official Satoshi Variable 600 outlines only; it does not select a new font weight. The final SVGs contain path outlines, not live text or font files. Local optical corrections are applied per letter before lockup spacing is resolved:

- **p:** narrowed the bowl’s overall outline so its opening reads less wide and more like the source.
- **u:** widened the letter and deepened its lower curve proportionally.
- **l:** reduced the stem’s apparent width and calibrated its cap-height relationship to the other letters.
- **s:** expanded the curved outline and terminal spacing to reduce the standard-font stiffness.
- **o:** adjusted width independently to keep the outer bowl and counter visually circular at the source’s wordmark aspect.

The resulting wordmark is 418×160 normalized units versus the source’s 230×88 ratio. The V4 lockup aligns its baseline, symbol/wordmark height relationship, and gap to the measured principal reference rather than retaining V3’s independent balance.

## Deliverables

### Reusable vector masters

- `pulso-symbol-gradient.svg`
- `pulso-symbol-white.svg`
- `pulso-symbol-black.svg`
- `pulso-wordmark-horizontal-dark.svg`
- `pulso-wordmark-horizontal-light.svg`
- `pulso-wordmark-white.svg`
- `pulso-wordmark-black.svg`

All masters are SVG paths and circles only. They contain no live text, embedded raster, or tagline.

### Raster exports

- `symbol-gradient-1024.png`
- `wordmark-dark-2048.png`
- `wordmark-light-2048.png`
- `app-icon-dark-1024.png` — opaque `#0C0A12`
- `adaptive-icon-foreground-432.png` — transparent Android-mask-safe foreground
- `splash-mark-1024.png` — transparent
- `favicon-32.png`, `favicon-192.png`, `favicon-512.png`

### Review-only evidence

- `reference-v4-measurement-review.png` — direct, overlay, edge, difference, and measurement review. It includes a raster source crop and is not a reusable master or runtime asset.
- An expanded V1–V4 contact sheet is retained outside the repository for review only.

## Pending approval and exclusions

V4 does not authorize application integration, `app.json` changes, runtime asset replacement, UI-0001 changes, or a new product/visual direction. It must remain a candidate until explicit visual approval. Do not add a tagline, mockup frame, or external asset provider.

## Font reference

Satoshi Variable 600 was used as an outline-construction base and converted to paths. No font file is included. See [FONT-LICENSE-REFERENCE.md](FONT-LICENSE-REFERENCE.md).
