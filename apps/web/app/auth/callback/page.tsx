import { resolveRequestLocale } from '../../locale-server';
import { AuthCallbackClient } from './callback-client';

/**
 * Where Google sign-in lands before the app proper.
 *
 * The locale is resolved on the server so the first paint is already in the
 * visitor's language - this page is the one screen where a flash of the
 * wrong language would land squarely on an error message.
 */
export default async function AuthCallbackPage() {
  const locale = await resolveRequestLocale();
  return <AuthCallbackClient locale={locale} />;
}
