# DATA-0002 — Montréal Source Registry

**Identifier:** DATA-0002
**Version:** 0.1
**Status:** Draft
**Dependencies:** PDR-0001, MVP-0001, PRD-0001, RFC-0001, DATA-0001

## Purpose and scope

This draft establishes a research registry of Montréal sources that may help discover MVP-eligible scheduled events. It is not an exhaustive directory, an ingestion connector, or evidence that a venue publication is an eligible event. The machine-readable baseline is [montreal-source-registry.csv](research/montreal-source-registry.csv); the supplied unaltered input is [montreal-source-watchlist-raw.md](research/montreal-source-watchlist-raw.md).

## Taxonomy and authority

The registry distinguishes venue, nightclub, bar, promoter, festival, comedy, cultural space, activity, hybrid space, food event, and media curator. primary_official and organizer_official sources normally provide the strongest confirmation. secondary_curator and discovery_lead sources can discover leads but cannot confirm an event by themselves. A registered bar, restaurant, club, or venue is relevant only when it hosts a qualifying scheduled MVP event.

## Normalization and duplicates

Rows use stable lowercase IDs and Instagram handles without @; unknown handles stay blank and are marked needs_research. The current snapshot contains 267 literal raw entries and 264 normalized sources: the three confirmed shared-account consolidations are Café Campus / Petit Campus, L’Abreuvoir / L’Abreuvoir Comedy Club, and Wills Bar / Bar Wills. Exact shared-account aliases are recorded against the canonical row. Similar names, venue/promoter relationships, and uncertain aliases are retained separately with notes until evidence supports a merge; Montréalité and Montréalités remain separate.

## Verification, priority, and correction

unverified is the initial state. Promotion to verified requires dated public evidence connecting the source identity to its official account or website, plus a review of its authority and access constraints. Scan priority is a research hypothesis based on likely event yield, not an eligibility or publication rule. Corrections must preserve the original input, record the evidence URL and date, and never overwrite uncertainty with an inference.

## Discovery is not confirmation

Source monitoring may create candidates. Candidate facts require source, capture timestamp, confidence, freshness information, and deduplication against known events. A human review is required for uncertainty and for secondary-source leads. Only a validated candidate satisfying DATA-0001 and the Accepted MVP scope may become publishable; every published event retains source evidence and correction provenance.

## Freshness and provenance

Freshness must be visible where it matters. The registry records source-level research, while each event retains event-level source evidence, timestamp, confidence, and cancellation/postponement handling. Any media retained for research must be limited to the minimum needed to extract and review event facts.
