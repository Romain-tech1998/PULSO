# Pulso logo candidates v2

## Candidate status

These are review candidates only. V2 preserves V1 and the supplied `Brand/` references unchanged. It refines the reconstructed Pulso gradient location-pin/pulse symbol and rounded lowercase `pulso` wordmark; it is not Accepted and must not be integrated into web or mobile applications without explicit product-owner approval.

## V2 corrections from V1

- The V1 outer pin/pulse geometry is retained as the starting silhouette so the open-loop character remains intact.
- The central dot radius is reduced from 18 to 15 viewBox units, a 16.7% diameter reduction.
- The gradient uses only the approved endpoints and transition: purple `#7F77DD` at the lower tail, pink `#D4537E` through the middle, and coral `#D85A30` at the upper/right portion. No lavender stop or endpoint is present.
- The primary wordmark is outlined from official Satoshi Bold 700. It is lower in height than V1, optically centred with the symbol, begins 39 viewBox units after the symbol, and preserves the font's natural advances without horizontal stretching.
- The primary composition makes the pin approximately 15% taller than the complete visible wordmark.
- Favicons are rendered 12.5% larger than V1 before centre-cropping to their final transparent canvases; the 32-pixel favicon uses approximately 86% of its height with clear edge padding.
- The app icon increases the source symbol from 640 to 760 pixels inside its 1024-pixel opaque dark canvas. The adaptive foreground grows from 240 to 268 pixels within its 432-pixel transparent canvas.

## Wordmark comparison and recommendation

`wordmark-weight-comparison.svg` and `wordmark-weight-comparison.png` compare V1 Satoshi Medium 500, variable weight 600, and Bold 700 at equivalent scale. Bold 700 is the primary V2 master, as requested for this review.

**Recommendation for the next review:** variable weight 600 is closer to the visual density of the supplied reference wordmark while retaining a more compact, rounded appearance than V1. Keep Bold 700 as the explicit V2 primary candidate, but use the 600 comparison to decide whether reference fidelity should take priority over the bolder V2 direction.

All wordmark glyphs, including the comparison labels, are converted to vector paths. The wordmark reads exactly `pulso`; no runtime font, live SVG text, or font file is included.

## Approved colors

- Purple: `#7F77DD`
- Pink: `#D4537E`
- Coral: `#D85A30`
- Dark background: `#0C0A12`
- Surface: `#15121E`
- Elevated or border surface: `#2C2938`

The light horizontal mark is review/reference only and does not authorize a light MVP theme.

## Masters

| File                                  | Role                                               | Canvas            | Transparency |
| ------------------------------------- | -------------------------------------------------- | ----------------- | ------------ |
| `pulso-symbol-gradient.svg`           | Primary V2 gradient symbol master                  | 256 × 256 viewBox | Yes          |
| `pulso-symbol-white.svg`              | Monochrome light symbol master                     | 256 × 256 viewBox | Yes          |
| `pulso-symbol-black.svg`              | Monochrome dark symbol master                      | 256 × 256 viewBox | Yes          |
| `pulso-wordmark-horizontal-dark.svg`  | Primary V2 700 horizontal mark for dark interfaces | 900 × 256 viewBox | Yes          |
| `pulso-wordmark-horizontal-light.svg` | Light-background review/reference mark             | 900 × 256 viewBox | Yes          |
| `pulso-wordmark-white.svg`            | Monochrome light horizontal master                 | 900 × 256 viewBox | Yes          |
| `pulso-wordmark-black.svg`            | Monochrome dark horizontal master                  | 900 × 256 viewBox | Yes          |

## Runtime export candidates

| File                               | Intended role                                    | Dimensions        | Transparency         |
| ---------------------------------- | ------------------------------------------------ | ----------------- | -------------------- |
| `symbol-gradient-1024.png`         | General symbol export                            | 1024 × 1024       | Yes                  |
| `wordmark-dark-2048.png`           | Primary 700 horizontal mark for dark surfaces    | 2048 × 583        | Yes                  |
| `wordmark-light-2048.png`          | Light-background review export                   | 2048 × 583        | Yes                  |
| `app-icon-dark-1024.png`           | Full app-icon source; platform masks apply later | 1024 × 1024       | No; opaque `#0C0A12` |
| `adaptive-icon-foreground-432.png` | Android adaptive-icon foreground                 | 432 × 432         | Yes                  |
| `splash-mark-1024.png`             | Splash-symbol candidate                          | 1024 × 1024       | Yes                  |
| `favicon-32.png`                   | Browser favicon candidate                        | 32 × 32           | Yes                  |
| `favicon-192.png`                  | Web manifest icon candidate                      | 192 × 192         | Yes                  |
| `favicon-512.png`                  | Web manifest icon candidate                      | 512 × 512         | Yes                  |
| `wordmark-weight-comparison.svg`   | Outlined 500/600/700 comparison                  | 900 × 320 viewBox | Yes                  |
| `wordmark-weight-comparison.png`   | Raster review export of the comparison           | 2048 × 728        | Yes                  |

## Safe area and minimum size

- Keep a clear space of at least 12.5% of standalone symbol height around the symbol.
- Keep a clear space of at least 8% of horizontal-mark height around the complete mark.
- Do not render a standalone symbol below 16 CSS pixels; use 24 CSS pixels or more when possible.
- Do not render the horizontal mark below 96 CSS pixels wide; use 120 CSS pixels or more when possible.
- The full app icon keeps a 132-pixel canvas inset around its 760-pixel SVG canvas. The visible pin remains clear of circular, rounded-square, and squircle mask bounds.
- The adaptive foreground is centred at a 82-pixel inset around a 268-pixel SVG canvas and remains inside Android's central safe region.

## Prohibited alterations

Do not add a tagline, mockup frame, label, presentation background, drop shadow, event imagery, source-color encoding, itinerary/routing reference, or third-party mark. Do not stretch, crop, outline, recolor, or otherwise alter a candidate outside its documented monochrome variants.

## Font source and license

The V2 candidates use official Fontshare Satoshi variable-font outlines instantiated at weights 600 and 700. The official source and license are recorded in `FONT-LICENSE-REFERENCE.md`. No Fontshare font software is included, and application-font integration remains outside this task.

## Asset classes

- **Master source:** the SVG masters and outlined comparison SVG; no embedded raster or live text.
- **Runtime export candidate:** the PNG exports; review only and not integrated.
- **Reference mockup:** all pre-existing files under `Brand/` plus protected web/mobile image files. They remain unchanged.

Explicit product-owner approval is required before any V2 asset becomes a production asset or is integrated into the application.
