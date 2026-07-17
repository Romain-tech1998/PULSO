# UI-0001 — Visual Identity and Branding

**Identifier:** UI-0001
**Version:** 0.2
**Status:** Draft
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, DATA-0001, UJ-0001, UJ-0002, UX-0001, PRD-0001, RFC-0001, DEC-0003

## Purpose

Record the approved visual foundation for Pulso without changing the Accepted MVP structure, interaction model, event-data rules, external-link boundary, or bilingual language policy. This document governs presentation and production-asset preparation only.

UI-0001 remains Draft until clean production logo exports are created and reviewed. It does not authorize visual implementation, a new product feature, screen, destination, or provider.

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

- Preserve the approved gradient Pulso pin and rounded `pulso` wordmark.
- Do not display a tagline inside product UI. Any future marketing tagline must be available in French and English.
- Use Satoshi only when the required official Fontshare files and their license text are bundled with the application. No unofficial mirror or external runtime font provider is authorized.

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

All files under `Brand/`, the current icon/logo crops, `Brand/Appli.png`, `Brand/Landing page.png`, `Brand/logo.png`, `Brand/moodboard.png`, and the large transparent source sheets are non-binding inspiration and references, not production assets.

The reference boards depict elements that are not authorized for the MVP: general venue or restaurant listings, alternate list and calendar surfaces, profiles, social or community features, sharing, notifications, stored preferences, personalized recommendations, distance or travel controls, itinerary/routing actions, and external event imagery. Their appearance in a reference board does not authorize implementation.

## Production-asset preparation

Current supplied crops and mockups are not production sources. Production assets require clean reviewed exports for the approved mark, including the gradient symbol, dark/light/white/black horizontal wordmarks, square app icon, adaptive-icon foreground, splash mark, and favicon sizes.

The original vector or a clean high-resolution transparent master export is required before exact production reconstruction. Do not approximate, redraw, generatively recreate, crop from a mockup, or integrate an asset that cannot preserve the approved mark faithfully.

When clean sources are available, asset preparation must document intended use, dimensions, alpha requirements, approved colors, clear space, minimum size, prohibited modifications, source provenance, generation method, and Satoshi/Fontshare license requirements.

## Open items before acceptance

- Obtain and review the original vector or clean transparent master exports.
- Bundle only the required official Fontshare Satoshi weights and the applicable license text after a license-file review.
- Define the Draft semantic token values through visual implementation review and accessibility validation.
- Resolve event-image rights and usage policy through DATA-0001 before any event imagery is used.
- Review the prepared production assets against the approved mark and dark MVP palette.

## Non-goals

UI-0001 does not authorize a light theme, automatic translation, external font/translation/AI providers, native booking or payment, ticket storage, routing or itinerary, general venue directories, additional screens, profiles, social features, calendar/list modules, personalization, or any Roadmap or Vision capability.
