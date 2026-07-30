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
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_BASE_URL ?? 'https://pulso.app'
    ),
    title: `Pulso — ${translate(locale, 'app.title')}`,
    description: translate(locale, 'app.description'),
    openGraph: {
      title: `Pulso — ${translate(locale, 'app.title')}`,
      description: translate(locale, 'app.description'),
      url: '/',
      siteName: 'Pulso',
      images: [
        {
          url: '/brand/pulso-favicon-192.png', // Temporary placeholder for OG image
          width: 1200,
          height: 630
        }
      ],
      locale: locale === 'fr' ? 'fr_CA' : 'en_US',
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title: `Pulso — ${translate(locale, 'app.title')}`,
      description: translate(locale, 'app.description'),
      images: ['/brand/pulso-favicon-192.png']
    },
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

export const viewport = {
  themeColor: '#EA3E81'
};

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
