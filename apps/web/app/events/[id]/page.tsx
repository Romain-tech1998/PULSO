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

    return {
      title: `${event.title} - Pulso`,
      description: `Découvre ${event.title} à ${event.venue.name} sur Pulso.`,
      openGraph: {
        title: `${event.title} - Pulso`,
        description: `Découvre ${event.title} à ${event.venue.name} sur Pulso.`,
        url: `/events/${id}`,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: `${event.title} - Pulso`,
        description: `Découvre ${event.title} à ${event.venue.name} sur Pulso.`,
      },
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
      <p role="status">{translate(locale, 'details.loading')}</p>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace("/?eventId=${id}");`
        }}
      />
    </div>
  );
}
