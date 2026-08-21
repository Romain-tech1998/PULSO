import { displayLocale } from '@pulso/domain/localization';
import type { SupportedLocale } from '@pulso/domain/localization';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { resolveRequestLocale } from '../../locale-server';
import {
  LEGAL_CONTENT,
  LEGAL_DOCS,
  LEGAL_UPDATED,
  type LegalDocSlug
} from '../content';

/**
 * The four documents DEC-0026 §4 requires before the first invitation, on one
 * renderer. They are server-rendered plain pages with no client bundle: a
 * privacy policy that needs the map, the account layer and 22 000 lines of
 * explore shell to load is a privacy policy Google's consent screen cannot
 * link to reliably.
 */

type Props = { params: Promise<{ doc: string }> };

const UI: Record<
  SupportedLocale,
  { updated: string; back: string; other: string }
> = {
  fr: {
    updated: 'Dernière mise à jour',
    back: "Retour à l'application",
    other: 'Autres documents'
  },
  en: {
    updated: 'Last updated',
    back: 'Back to the app',
    other: 'Other documents'
  }
};

function isLegalDoc(value: string): value is LegalDocSlug {
  return (LEGAL_DOCS as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return LEGAL_DOCS.map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalDoc(doc)) return {};
  const locale = await resolveRequestLocale();
  const document = LEGAL_CONTENT[locale][doc];
  return {
    title: `${document.title} — Pulso`,
    description: document.summary
  };
}

export default async function LegalPage({ params }: Props) {
  const { doc } = await params;
  if (!isLegalDoc(doc)) notFound();

  const locale = await resolveRequestLocale();
  const document = LEGAL_CONTENT[locale][doc];
  const ui = UI[locale];
  const updated = new Date(`${LEGAL_UPDATED}T00:00:00Z`).toLocaleDateString(
    displayLocale(locale),
    { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
  );

  return (
    <main className="legal-page">
      <a className="legal-back" href="/">
        ← {ui.back}
      </a>

      <header className="legal-header">
        <h1>{document.title}</h1>
        <p className="legal-summary">{document.summary}</p>
        <p className="legal-updated">
          {ui.updated} : <time dateTime={LEGAL_UPDATED}>{updated}</time>
        </p>
      </header>

      {document.sections.map((section) => (
        <section className="legal-section" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
          {section.list ? (
            <ul>
              {section.list.map((item) => (
                <li key={item.slice(0, 40)}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <nav className="legal-nav" aria-label={ui.other}>
        <h2>{ui.other}</h2>
        <ul>
          {LEGAL_DOCS.filter((slug) => slug !== doc).map((slug) => (
            <li key={slug}>
              <a href={`/legal/${slug}`}>{LEGAL_CONTENT[locale][slug].title}</a>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
