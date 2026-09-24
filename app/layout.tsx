import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, IBM_Plex_Mono, Inter } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Portail',
  description: 'Portail d’accès aux applications',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Hub',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/hub-icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#28453A',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} ${inter.variable}`}>
      <body style={{ fontFamily: 'var(--font-body), Inter, sans-serif' }}>{children}</body>
    </html>
  );
}
