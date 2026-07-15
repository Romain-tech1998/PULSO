import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Pulso — Explore Montréal',
  description: 'Anonymous free exploration for fictional Montréal events.'
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
