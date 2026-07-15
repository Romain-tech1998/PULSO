# Mobile validation notes

This Expo SDK 57 surface uses `@maplibre/maplibre-react-native` 11 and therefore requires a native development build; Expo Go is not a valid map test environment.

The committed validation command checks the Expo configuration, strict TypeScript, and an Android JavaScript export. A real Android development build and rendered-point check remain required on a machine with Java and an Android SDK/emulator. No production map-style provider is configured; the slice intentionally uses a local empty style.
