# Pulso logo candidates v1

## Candidate status

These are review candidates only. They reconstruct the product-owner-approved Pulso concept from the supplied reference sheets: a gradient location-pin/pulse symbol and a rounded lowercase `pulso` wordmark. They are not Accepted, must not be integrated into web or mobile applications, and require explicit product-owner review before any use.

## Reconstruction rationale

The original artwork master was unavailable. The symbol was reconstructed as a small set of clean, closed vector geometry from the common proportions visible in `Brand/logo.png` and the large logo sheets. It has no raster content, mockup frame, label, background, or tagline.

The wordmark reads exactly `pulso`. It was set with official Satoshi Medium and converted to vector glyph paths for these SVG candidates; the SVGs therefore do not require a runtime font installation. No Satoshi font file is included in this package.

## Approved colors

- Purple: `#7F77DD`
- Coral: `#D85A30`
- Pink: `#D4537E`
- Dark background: `#0C0A12`
- Surface: `#15121E`
- Elevated or border surface: `#2C2938`

The gradient runs purple to pink to coral. The horizontal-dark mark uses a white wordmark for the dark-only MVP. The horizontal-light and black variants exist solely as review/reference exports; they do not authorize a light MVP theme.

## Masters

| File                                  | Role                                                    | Canvas            | Transparency |
| ------------------------------------- | ------------------------------------------------------- | ----------------- | ------------ |
| `pulso-symbol-gradient.svg`           | Primary gradient symbol master                          | 256 × 256 viewBox | Yes          |
| `pulso-symbol-white.svg`              | Monochrome light symbol master                          | 256 × 256 viewBox | Yes          |
| `pulso-symbol-black.svg`              | Monochrome dark symbol master                           | 256 × 256 viewBox | Yes          |
| `pulso-wordmark-horizontal-dark.svg`  | Primary horizontal mark for a dark interface            | 960 × 256 viewBox | Yes          |
| `pulso-wordmark-horizontal-light.svg` | Review/reference horizontal mark for a light background | 960 × 256 viewBox | Yes          |
| `pulso-wordmark-white.svg`            | Monochrome light horizontal master                      | 960 × 256 viewBox | Yes          |
| `pulso-wordmark-black.svg`            | Monochrome dark horizontal master                       | 960 × 256 viewBox | Yes          |

## Runtime export candidates

| File                               | Intended role                                           | Dimensions  | Transparency             |
| ---------------------------------- | ------------------------------------------------------- | ----------- | ------------------------ |
| `symbol-gradient-1024.png`         | General symbol export                                   | 1024 × 1024 | Yes                      |
| `wordmark-dark-2048.png`           | Horizontal mark for dark surfaces                       | 2048 × 546  | Yes                      |
| `wordmark-light-2048.png`          | Horizontal mark for light review surfaces               | 2048 × 546  | Yes                      |
| `app-icon-dark-1024.png`           | Full dark app-icon source; platform masks applied later | 1024 × 1024 | No; `#0C0A12` background |
| `adaptive-icon-foreground-432.png` | Android adaptive-icon foreground                        | 432 × 432   | Yes                      |
| `splash-mark-1024.png`             | Splash-symbol candidate                                 | 1024 × 1024 | Yes                      |
| `favicon-32.png`                   | Browser favicon candidate                               | 32 × 32     | Yes                      |
| `favicon-192.png`                  | Web manifest icon candidate                             | 192 × 192   | Yes                      |
| `favicon-512.png`                  | Web manifest icon candidate                             | 512 × 512   | Yes                      |

## Safe area and minimum size

- Keep a clear space of at least 12.5% of the symbol height around a standalone symbol.
- Keep a clear space of at least 8% of the horizontal-mark height around the complete horizontal mark.
- Do not render the standalone symbol below 16 CSS pixels; use 24 CSS pixels or more where possible.
- Do not render the horizontal mark below 96 CSS pixels wide; use 120 CSS pixels or more where possible.
- The app icon has a 192-pixel inset around a 640-pixel symbol. The adaptive foreground has a 96-pixel inset around a 240-pixel symbol; do not add a rounded mask to either source.

## Prohibited alterations

Do not add a tagline, frame, label, presentation background, drop shadow, event imagery, source-color encoding, itinerary/routing reference, or third-party mark. Do not redraw the symbol, change the wordmark text, alter the approved gradient, stretch, crop, outline, or recolor these candidates outside the supplied monochrome variants.

## Font source and license

The source font was Satoshi Medium, obtained directly from Fontshare's official Satoshi CSS/API endpoint solely to create the outlined candidate wordmark. The official source and license are recorded in `FONT-LICENSE-REFERENCE.md`. Fontshare's ITF Free Font License permits use to create logos and vector drawings, subject to its terms. Application-font integration is outside this task.

## Asset classes

- **Master source:** the seven SVG files above; self-contained vector paths with no embedded raster image.
- **Runtime export candidate:** the PNG files above; review only and not integrated.
- **Reference mockup:** all pre-existing files under `Brand/` and the protected web/mobile image files. They remain reference material and are not altered by this package.

Explicit product-owner approval is required before any candidate becomes a production asset or is integrated into the application.
