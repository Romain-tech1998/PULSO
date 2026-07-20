import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import { translate } from '@pulso/domain/localization';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { resolveRequestLocale } from './locale-server';
import localFont from 'next/font/local';

const satoshi = localFont({
  src: [
    {
      path: '../public/fonts/satoshi/Satoshi-Regular.woff2',
      weight: '400',
      style: 'normal'
    },
    {
      path: '../public/fonts/satoshi/Satoshi-Medium.woff2',
      weight: '500',
      style: 'normal'
    },
    {
      path: '../public/fonts/satoshi/Satoshi-Bold.woff2',
      weight: '700',
      style: 'normal'
    }
  ],
  variable: '--font-satoshi'
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();
  return {
    title: `Pulso — ${translate(locale, 'app.title')}`,
    description: translate(locale, 'app.description'),
    icons: {
      icon: [
        {
          url: '/brand/pulso-favicon-32.png',
          sizes: '32x32',
          type: 'image/png'
        },
        {
          url: '/brand/pulso-favicon-192.png',
          sizes: '192x192',
          type: 'image/png'
        }
      ]
    }
  };
}

export default async function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  const locale = await resolveRequestLocale();
  return (
    <html lang={locale} className={satoshi.variable}>
      <body>{children}</body>
    </html>
  );
}
