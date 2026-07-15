# Mobile validation notes

This Expo SDK 57 surface uses `@maplibre/maplibre-react-native` 11 and therefore requires a native development build; Expo Go is not a valid map test environment.

The native Android development build and visible MapLibre point render were validated for DEC-0002. Functional Sprint 1 extends that same fictional, provider-free surface with anonymous marker preview, Event Details, known access information, safe external-source handling, recoverable states, and return to the preserved map context. No production map-style provider is configured; the slice intentionally uses a local empty style.
