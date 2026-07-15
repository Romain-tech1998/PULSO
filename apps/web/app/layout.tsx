import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Pulso — synthetic map slice',
  description: 'Technical validation surface for the Pulso Montréal MVP.'
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
