# UI-0001 — Visual Identity and Branding

**Identifier:** UI-0001
**Version:** 1.0
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, DATA-0001, UJ-0001, UJ-0002, UX-0001, PRD-0001, RFC-0001, DEC-0003

## Purpose

Record the approved visual foundation for Pulso without changing the Accepted MVP structure, interaction model, event-data rules, external-link boundary, or bilingual language policy. This document governs presentation and production-asset preparation only.

UI-0001 is the Accepted visual-identity baseline. It does not itself authorize visual implementation, a new product feature, screen, destination, or provider. Visual integration into the existing web and mobile surfaces remains a separate implementation task.

## Approved MVP presentation decisions

### Theme and palette

- The MVP uses a single dark theme. A light theme is outside the MVP and deferred to Roadmap.
- The sole approved MVP palette is:
  - primary purple: `#7F77DD`;
  - coral: `#D85A30`;
  - pink: `#D4537E`;
  - primary background: `#0C0A12`;
  - surface: `#15121E`;
  - elevated or border surface: `#2C2938`.
- The differing palette in `Brand/moodboard.png` is a non-binding historical reference and must not override this palette.

### Mark and copy

- The official Pulso identity is approved V5. Its canonical production assets live in `Brand/production/approved/v1`.
- The official mark is the fixed external symbol geometry with its centred point and custom directly traced vector `pulso` wordmark. Do not alter symbol proportions, recenter the point, replace the wordmark, or modify the lockup without a new documented decision.
- The official brand-asset gradient is `#7336C1` → `#EA3E81` → `#FE7C5C`. It is distinct from, and does not replace, the Accepted semantic UI palette above.
- Do not display a tagline inside product UI. Any future marketing tagline must be available in French and English.
- The logo wordmark is not Satoshi. Satoshi may be used for application interface typography only when the required official Fontshare files and license text are bundled with the application. No unofficial mirror or external runtime font provider is authorized.

### Provenance, imagery, and external actions

- Source provenance remains textual. Do not encode event source through marker, card, or badge colors.
- Existing Accepted source, trust, freshness, uncertainty, cancellation, and postponement information remains visible with non-color differentiation.
- Do not use external event imagery until DATA-0001 image rights and usage rules are Accepted.
- Pulso provides no itinerary, route, navigation, transportation, or Google Maps action. Event Details retains only Accepted known address/access information and the clearly identified external ticketing or event-source action when applicable.

## Accessibility baseline

- Text and meaningful controls must meet WCAG AA contrast requirements in their rendered context.
- Keyboard focus must remain visible with a focus indicator distinguishable from adjacent surfaces.
- State, source, trust, and status information must not rely on color alone.
- Motion must respect the user’s reduced-motion preference.
- Interactive controls require accurate screen-reader labels and state announcements.
- Primary touch targets must be at least 44 by 44 CSS pixels unless a documented platform accessibility exception applies.

## Draft semantic token categories

The approved palette above is fixed. The following semantic assignment and numerical token values remain Draft until visual implementation review:

- text;
- background and surface;
- accent;
- border;
- success, warning, and error;
- focus;
- spacing;
- radii;
- elevation;
- typography scale.

Tokens must support the dark MVP, bilingual French/English labels, map-first overlays, loading/error/trust states, responsive web, Android mobile, keyboard navigation, and screen readers without changing functional behavior.

## Reference material and exclusions

`Brand/production/approved/v1` is the only approved runtime-asset baseline. The original reference sheets, reference boards, supplied crops, mockups, and candidates V1–V4 remain non-binding and must not be used in the application. Candidate V5 remains preserved as approval evidence; its canonical copies are the production source.

The reference boards depict elements that are not authorized for the MVP: general venue or restaurant listings, alternate list and calendar surfaces, profiles, social or community features, sharing, notifications, stored preferences, personalized recommendations, distance or travel controls, itinerary/routing actions, and external event imagery. Their appearance in a reference board does not authorize implementation.

## Approved production assets

The canonical directory contains clean, validated exports of the gradient symbol; dark, light, white, and black horizontal marks; square app icon; adaptive-icon foreground; splash mark; and favicon sizes. The approved logo contains no tagline, live SVG text, embedded raster master, or external font dependency.

Use the canonical files without cropping, recoloring, replacing the custom lettering, or changing the point placement. The existing viewBox and export padding are the approved clear-space boundary. Use the supplied favicon assets for their named sizes; do not create a smaller reconstructed mark without a new decision.

The approved assets retain dark-only MVP presentation. Textual source provenance, DATA-0001 event-imagery rights constraints, accessibility requirements, and all excluded product functionality remain binding.

## Follow-on work

- Integrate the canonical identity into the existing web and mobile surfaces as a separate implementation task.
- Bundle only the required official Fontshare Satoshi interface weights and the applicable license text after a license-file review, if Satoshi remains the selected interface font.
- Define the Draft semantic token values through visual implementation review and accessibility validation.
- Resolve event-image rights and usage policy through DATA-0001 before any event imagery is used.

## Non-goals

UI-0001 does not authorize a light theme, automatic translation, external font/translation/AI providers, native booking or payment, ticket storage, routing or itinerary, general venue directories, additional screens, profiles, social features, calendar/list modules, personalization, or any Roadmap or Vision capability.
