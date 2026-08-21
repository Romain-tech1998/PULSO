import type { ReportTargetType } from '@pulso/contracts';
import { displayLocale, translate } from '@pulso/domain/localization';
import type { SupportedLocale } from '@pulso/domain/localization';
import type maplibregl from 'maplibre-gl';
import type { ReactNode } from 'react';

/**
 * The handful of definitions shared between `explore-map.tsx` and the
 * group workspace in `groups.tsx`. Extracted verbatim when the group
 * feature moved out of `explore-map.tsx`; nothing here changed behaviour.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

// Pulso's own vector style, served from public/ - the project's art
// direction (deep violet #100e19, muted roads) rather than a generic grey
// basemap. It used to sit behind NEXT_PUBLIC_MAP_STYLE_URL, so whenever
// that variable was missing - Next reads .env from apps/web, not from the
// monorepo root - every map silently fell back to a flat CartoDB raster
// that looked nothing like the rest of the product.
const MAP_STYLE_PULSO = '/map-styles/pulso-dark.json';

export const MAP_STYLE_URL: string | maplibregl.StyleSpecification =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? MAP_STYLE_PULSO;

// Minimal safety net (DEC-0012): captures the report only, no moderation
// queue or automated action exists yet - the acknowledgment says exactly
// that rather than implying a review will happen.
export function reportContent(
  authToken: string | undefined,
  targetType: ReportTargetType,
  targetId: string,
  locale: SupportedLocale
) {
  if (!authToken) return;
  // Cancelling the prompt aborts the report entirely; confirming with an
  // empty reason still sends it (the target/reporter/timestamp alone are
  // useful even with no reason given).
  const input = window.prompt(translate(locale, 'report.prompt'));
  if (input === null) return;
  fetch(`${API_BASE_URL}/reports`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      targetType,
      targetId,
      ...(input.trim() ? { reason: input.trim() } : {})
    })
  })
    .then((response) => {
      if (response.ok) alert(translate(locale, 'report.sent'));
    })
    .catch(() => {});
}

// DEC-0026 §4 acceptance criterion 4: the four legal documents must be
// reachable from the interface without an account. Plain anchors, not client
// navigation - /legal/* is server-rendered on its own and must stay reachable
// when the map shell does not load.
export function LegalLinks({ locale }: { locale: SupportedLocale }) {
  return (
    <nav className="legal-links" aria-label="Pulso">
      <a href="/legal/privacy">{translate(locale, 'legal.privacy')}</a>
      <a href="/legal/terms">{translate(locale, 'legal.terms')}</a>
      <a href="/legal/tickets">{translate(locale, 'legal.tickets')}</a>
      <a href="/legal/notice">{translate(locale, 'legal.notice')}</a>
    </nav>
  );
}

export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function formatRelativeTime(
  iso: string,
  locale: SupportedLocale
): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return translate(locale, 'time.justNow');
  if (minutes < 60)
    return translate(locale, 'time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate(locale, 'time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return translate(locale, 'time.daysAgo', { count: days });
  return new Date(iso).toLocaleDateString(displayLocale(locale));
}

// Brand-gradient banner presets (Phase 4.7) - never a photo upload, Pulso
// stores no user images beyond the Google avatar. Keys match
// PROFILE_COVER_STYLES in @pulso/contracts.
export const PROFILE_COVER_GRADIENTS: Record<string, string> = {
  aurora: 'linear-gradient(135deg, #a73ee8, #ff2a7a)',
  sunset: 'linear-gradient(135deg, #ff8a3d, #ff2a7a)',
  midnight: 'linear-gradient(135deg, #1c192b, #5b3fe0)',
  nebula: 'linear-gradient(135deg, #5b3fe0, #00c2a8)'
};
export const DEFAULT_PROFILE_COVER = 'aurora';

// Preset avatars (Phase 4.7) - picking one overrides the Google avatar photo
// everywhere the user's own avatar appears (Sidebar profile card, TopBar
// account menu, profile header), same "no upload" rationale as the cover
// presets. Reuses the same brand gradients rather than inventing a second
// palette.
export const PROFILE_AVATAR_PRESETS: Record<
  string,
  { emoji: string; gradient: string }
> = {
  note: { emoji: '🎧', gradient: PROFILE_COVER_GRADIENTS['aurora']! },
  disco: { emoji: '🪩', gradient: PROFILE_COVER_GRADIENTS['midnight']! },
  moon: { emoji: '🌙', gradient: PROFILE_COVER_GRADIENTS['nebula']! },
  star: { emoji: '⭐', gradient: PROFILE_COVER_GRADIENTS['sunset']! },
  flame: { emoji: '🔥', gradient: PROFILE_COVER_GRADIENTS['aurora']! },
  heart: { emoji: '💜', gradient: PROFILE_COVER_GRADIENTS['midnight']! }
};

// Shared by every spot an avatar appears (AccountMenu, Sidebar profile
// card, ProfilHeader, conversation list, friends list). One resolution
// order, defined once, per DEC-0020:
//
//   uploaded photo -> chosen preset -> Google photo -> initial
//
// The uploaded photo leads because it is the only one the user deliberately
// put there as their face. The presets stay ahead of the Google photo, as
// they were before DEC-0020, since choosing one is still an explicit "not
// my Google picture".
//
// Takes the structural minimum rather than a User, so a PublicUser (a
// friend, a participant) resolves through exactly the same order instead of
// a second, drifting copy.
export function renderAvatarContent(user: {
  displayName: string;
  avatarUrl?: string | undefined;
  avatarStyle?: string | undefined;
  photoUrl?: string | undefined;
}): ReactNode {
  if (user.photoUrl) {
    return <img src={user.photoUrl} alt="" />;
  }
  const preset = user.avatarStyle
    ? PROFILE_AVATAR_PRESETS[user.avatarStyle]
    : undefined;
  if (preset) {
    return (
      <span
        className="user-avatar-preset"
        style={{ background: preset.gradient }}
        aria-hidden="true"
      >
        {preset.emoji}
      </span>
    );
  }
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" />;
  }
  return user.displayName.slice(0, 1).toUpperCase();
}
