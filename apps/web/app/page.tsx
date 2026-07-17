import { ExploreMap } from './explore-map';
import { resolveRequestLocale } from './locale-server';

export default async function Page() {
  const locale = await resolveRequestLocale();
  return <ExploreMap initialLocale={locale} />;
}
