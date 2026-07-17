# DEC-0003 — MVP Language Policy

**Identifier:** DEC-0003
**Version:** 1.0
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, UJ-0001, UJ-0002, UX-0001, PRD-0001, RFC-0001

## Decision

Pulso supports French and English in the Montréal MVP across the responsive website and mobile application.

The initial interface language follows the browser or device preference when that preference is French or English. French is the fallback when no supported preference is detected. A manual language switch remains available, and the selected language is preserved locally without requiring an account.

This decision does not change the Accepted product structure, screen inventory, anonymous-access boundary, search behavior, or MVP scope.

## Pulso interface language

Pulso-owned interface copy is available in French and English. This includes:

- navigation, actions, overlays, screen content, and system feedback;
- filter labels and controls;
- loading, empty, partial-data, unavailable-destination, and recoverable-error states;
- trust, freshness, uncertainty, cancellation, and postponement disclosures;
- clarifications, alternatives, and no-reliable-result feedback;
- accessibility labels, instructions, and status copy.

The initial supported browser or device language determines the first interface language. The user can switch languages manually at any time. The selected language is stored locally for the product surface and does not depend on account creation, authentication, or an account preference.

Manual filters remain available and functionally equivalent in both languages. Language changes do not alter active product rules, criteria, data, or map context.

## Deterministic-search language

The deterministic intelligent-search foundation understands French and English. Users may formulate supported MVP criteria in either language.

Search interpretation, visible criteria, explanations, clarifications, alternatives, errors, trust disclosures, filter labels, and accessibility copy are available in both languages. The same Accepted hard constraints, ranking signals, one-material-clarification limit, deterministic retrieval, transparency requirements, and manual-filter controls apply in French and English.

This bilingual behavior remains deterministic and provider-neutral. It introduces no external AI, translation, embedding, or language provider.

## External event-source content

Event titles, descriptions, organizer text, and other content obtained from external event sources remain in their source language in the MVP. Pulso does not automatically translate or rewrite that content.

Pulso-owned labels, controls, system states, trust disclosures, and accessibility copy surrounding external content remain available in the selected interface language. The original event-source content itself is preserved.

## Rationale

- French and English support reflects the approved Montréal MVP context while keeping launch scope limited to two languages.
- Browser or device preference provides a useful initial state without adding an onboarding gate.
- A persistent local switch preserves user control and keeps the product fully usable without an account.
- Bilingual deterministic search gives both supported languages the same transparent behavior without introducing a provider dependency.
- Preserving external content in its source language avoids unsupported translation claims and keeps source information faithful.

## Consequences

- Responsive web and mobile must expose equivalent French and English product behavior.
- Every Pulso-owned user-facing string in MVP scope requires French and English copy, including accessibility and trust-related copy.
- Deterministic-search vocabulary, interpretation, explanations, clarifications, alternatives, errors, and tests must cover both supported languages.
- Language selection must be initialized from a supported browser or device preference, fall back to French, remain manually changeable, and persist locally without authentication.
- External event-source content remains unchanged even when its source language differs from the selected interface language.
- This decision creates no additional primary screen, account capability, external provider, or product module.

## Explicit exclusions

The MVP excludes:

- automatic translation of external event-source content;
- external translation providers;
- AI-based translation;
- an account-dependent language preference;
- languages other than French and English;
- any change to the Accepted event, map, filter, search, trust, booking, account, or navigation scope.

## Implementation boundary

Bilingual implementation is the next functional task. It must extend the existing product behavior without reopening unrelated Accepted decisions, adding a provider, or changing externally sourced event content.
