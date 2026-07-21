# Pulso logo candidates — V3 faithful reconstruction

**Status:** Candidate for visual review only. Not approved, integrated, staged, or committed.

## Source and reconstruction intent

V3 traces the upper-left **LOGO PRINCIPAL** lockup in [`Brand/logo.png`](../../../logo.png) as its principal visual source. That reference shows a slender, single open stroke forming a map-pin/pulse loop, a long lower-left tail, and a small central dot. It is deliberately different from the filled-loop construction used in V1 and V2.

Other original `Brand/` references were consulted only to cross-check context and variants; they do not supersede the principal source. V1 and V2 remain intact as earlier, unapproved explorations.

## V3 corrections from V2

- Reconstructed the symbol as one rounded, open vector stroke rather than a filled silhouette.
- Restored the long lower-left tail and open lower-right ending visible in the principal reference.
- Reduced the dot from V2’s 30-unit diameter to 28 units and tuned it against the slimmer stroke.
- Used the logo-specific sampled gradient: `#7336C1` at the tail, `#EA3E81` in transition, and `#FE7C5C` at the upper/right curve. These are artwork colors only; they do not revise UI-0001’s approved semantic palette.
- Rebuilt the wordmark with official Satoshi Variable at weight 600, converted to paths. It is more compact, lighter, and closer to the reference than the V2 Bold 700 treatment.
- Tightened the lockup: the symbol is visually taller than the letter body and the gap is approximately one stroke width.
- Enlarged the standalone symbol in the favicon and icon exports while retaining mask-safe padding.

## Wordmark comparison and recommendation

`wordmark-weight-comparison.svg` and `.png` place outlined Satoshi 600 and 700 specimens at the same scale. **Satoshi Variable 600 is the recommended V3 candidate**: 700 is visibly denser and heavier than the principal reference, while 600 preserves its compact, rounded appearance. Both comparison specimens are vector paths; no final master contains live text.

This recommendation remains subject to product-owner visual approval. It is not a typography decision for the product interface.

## Deliverables

### Reusable vector masters (outlined paths only)

- `pulso-symbol-gradient.svg` — principal gradient symbol
- `pulso-symbol-white.svg` — white monochrome symbol
- `pulso-symbol-black.svg` — black monochrome symbol
- `pulso-wordmark-horizontal-dark.svg` — gradient symbol with white wordmark for dark backgrounds
- `pulso-wordmark-horizontal-light.svg` — gradient symbol with black wordmark for light backgrounds
- `pulso-wordmark-white.svg` — white monochrome lockup
- `pulso-wordmark-black.svg` — black monochrome lockup

### Export candidates

- `symbol-gradient-1024.png`
- `wordmark-dark-2048.png`
- `wordmark-light-2048.png`
- `app-icon-dark-1024.png` — opaque `#0C0A12` background
- `adaptive-icon-foreground-432.png` — transparent foreground with Android mask-safe inset
- `splash-mark-1024.png` — transparent centered symbol
- `favicon-32.png`, `favicon-192.png`, `favicon-512.png`

### Review-only artifacts

- `wordmark-weight-comparison.svg` and `.png` — outlined 600/700 comparison; not a runtime asset
- `reference-alignment-overlay-review.png` — source-crop, reconstruction, overlay, and difference review. It contains a raster crop of the source reference and must not be reused as an app asset.

## Usage limits pending approval

These are review candidates only. Do not copy them into application bundles, configure them in `app.json`, or treat them as the canonical production identity until V3 (or another approved candidate) is explicitly accepted. Do not add a tagline, presentation frame, or new product/visual direction.

## Font and license reference

The wordmark geometry was generated from the official Satoshi variable font and then converted to paths. No font file is included here. See [FONT-LICENSE-REFERENCE.md](FONT-LICENSE-REFERENCE.md) for the official source and license references.
