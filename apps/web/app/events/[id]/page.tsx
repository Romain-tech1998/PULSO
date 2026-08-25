import { eventDetailsResponseSchema } from '@pulso/contracts';
import { translate } from '@pulso/domain/localization';
import type { Metadata } from 'next';

import { resolveRequestLocale } from '../../locale-server';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const response = await fetch(`${API_BASE_URL}/events/${id}`);
    if (!response.ok) return {};
    const result = eventDetailsResponseSchema.parse(await response.json());
    const event = result.data;
    const locale = await resolveRequestLocale();
    const title = `${event.title} - Pulso`;
    // This is what a shared link previews as, so it follows the visitor's
    // language like the rest of the app rather than being French for
    // everyone.
    const description = translate(locale, 'details.shareDescription', {
      title: event.title,
      venue: event.venue.name
    });

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `/events/${id}`,
        type: 'website'
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description
      }
    };
  } catch {
    return {};
  }
}

export default async function EventPage({ params }: Props) {
  const { id } = await params;
  const locale = await resolveRequestLocale();

  return (
    <div className="redirect-shell">
      <span className="redirect-spinner" aria-hidden="true" />
      <p role="status">{translate(locale, 'details.loading')}</p>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace("/?eventId=${id}");`
        }}
      />
      {/* The redirect above is the whole page. If it cannot run, this is
          the only way out - without it the visitor keeps a loading line
          that nothing will ever replace. */}
      <noscript>
        <a className="redirect-action primary" href={`/?eventId=${id}`}>
          {translate(locale, 'details.openManually')}
        </a>
      </noscript>
    </div>
  );
}
