import type { ReportTargetType } from '@pulso/contracts';
import { displayLocale, translate } from '@pulso/domain/localization';
import type { SupportedLocale } from '@pulso/domain/localization';
import type maplibregl from 'maplibre-gl';

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
  if (minutes < 60) return translate(locale, 'time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate(locale, 'time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return translate(locale, 'time.daysAgo', { count: days });
  return new Date(iso).toLocaleDateString(displayLocale(locale));
}
