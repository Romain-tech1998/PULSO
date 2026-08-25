'use client';

import { translate, type SupportedLocale } from '@pulso/domain/localization';
import { useEffect, useState } from 'react';

import { API_BASE_URL } from '../../shared';

const AUTH_TOKEN_KEY = 'pulso-auth-token';

/**
 * How long the "signing you in" state is allowed to last before it is
 * treated as a failure.
 *
 * This page used to be an inline script with exactly two outcomes: store a
 * token and leave, or - for every other case - sit on "Connexion en cours…"
 * with nothing scheduled to change it. A visitor whose sign-in failed saw a
 * loader that never resolved, which is indistinguishable from the app being
 * broken. Nothing here may end in that state, so even the cases this code
 * cannot name still time out into something the visitor can act on.
 */
const RESOLUTION_TIMEOUT_MS = 8000;

/** Failure codes apps/api's OAuth callback can hand back in `?error=`. */
const KNOWN_ERRORS = [
  'ACCESS_DENIED',
  'GOOGLE_REFUSED',
  'GOOGLE_USERINFO_FAILED',
  'OAUTH_EXCHANGE_FAILED',
  'MISSING_TOKEN',
  'TIMEOUT'
] as const;

type AuthErrorCode = (typeof KNOWN_ERRORS)[number];

function normalizeError(value: string | null): AuthErrorCode {
  return (KNOWN_ERRORS as readonly string[]).includes(value ?? '')
    ? (value as AuthErrorCode)
    : 'OAUTH_EXCHANGE_FAILED';
}

function errorMessage(locale: SupportedLocale, code: AuthErrorCode): string {
  switch (code) {
    case 'ACCESS_DENIED':
      return translate(locale, 'auth.errorAccessDenied');
    case 'GOOGLE_REFUSED':
      return translate(locale, 'auth.errorGoogleRefused');
    case 'GOOGLE_USERINFO_FAILED':
      return translate(locale, 'auth.errorUserinfo');
    case 'MISSING_TOKEN':
      return translate(locale, 'auth.errorMissingToken');
    case 'TIMEOUT':
      return translate(locale, 'auth.errorTimeout');
    default:
      return translate(locale, 'auth.errorExchange');
  }
}

export function AuthCallbackClient({ locale }: { locale: SupportedLocale }) {
  const [failure, setFailure] = useState<AuthErrorCode>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const error = params.get('error');

    if (error) {
      setFailure(normalizeError(error));
      return;
    }

    if (token) {
      try {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
      } catch {
        // Private browsing, or storage disabled entirely. The session is
        // real but there is nowhere to keep it, so say so rather than
        // bouncing the visitor to a home page that will show them signed
        // out with no explanation.
        setFailure('OAUTH_EXCHANGE_FAILED');
        return;
      }
      // replace(), not assign(): the callback URL carries a session token in
      // its query string and must not stay in history where a Back press
      // would re-enter it.
      window.location.replace('/');
      return;
    }

    // Reached the callback with neither outcome - a bookmarked or truncated
    // URL, or a redirect that lost its query string.
    setFailure('MISSING_TOKEN');
  }, []);

  useEffect(() => {
    if (failure) return;
    const timer = setTimeout(
      () => setFailure('TIMEOUT'),
      RESOLUTION_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [failure]);

  if (!failure) {
    return (
      <div className="redirect-shell">
        <span className="redirect-spinner" aria-hidden="true" />
        <p role="status">{translate(locale, 'auth.signingIn')}</p>
      </div>
    );
  }

  return (
    <div className="redirect-shell redirect-shell-error">
      <h1 className="redirect-title">
        {translate(locale, 'auth.failedTitle')}
      </h1>
      <p role="alert" className="redirect-message">
        {errorMessage(locale, failure)}
      </p>
      <div className="redirect-actions">
        {/* Restarts the flow at its real beginning rather than dropping the
            visitor on the map to find the button again. */}
        <a
          className="redirect-action primary"
          href={`${API_BASE_URL}/auth/google`}
        >
          {translate(locale, 'auth.retry')}
        </a>
        <a className="redirect-action" href="/">
          {translate(locale, 'auth.back')}
        </a>
      </div>
    </div>
  );
}
