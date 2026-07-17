import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import { translate } from '@pulso/domain/localization';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { resolveRequestLocale } from './locale-server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();
  return {
    title: `Pulso — ${translate(locale, 'app.title')}`,
    description: translate(locale, 'app.description')
  };
}

export default async function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  const locale = await resolveRequestLocale();
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
