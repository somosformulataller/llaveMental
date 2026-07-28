import type { Metadata, Viewport } from 'next';
import { Inter, Rajdhani, Cinzel } from 'next/font/google';
import { PlayerProvider } from '@/components/providers/PlayerProvider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rajdhani',
  display: 'swap',
});

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-cinzel',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'La Llave Correcta — ¿Puedes abrir la cerradura?',
  description:
    'Juego de azar tipo scratch-card. Elige la llave correcta y gana hasta $10. RTP 98%, baja volatilidad. ¡Juega ahora!',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'La Llave Correcta',
  },
  openGraph: {
    title: 'La Llave Correcta',
    description: '¿Puedes abrir la cerradura y ganar el pozo?',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0D0F14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${rajdhani.variable} ${cinzel.variable}`}>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />
      </head>
      <body className="app-body">
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
