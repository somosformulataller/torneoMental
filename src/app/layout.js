import './globals.css';
import ServiceWorkerReload from '@/components/ui/ServiceWorkerReload';

export const metadata = {
  title: 'Copa Mental - Juego de Memoria',
  description: 'Compite en torneos de memoria con cartas temáticas. ¡Gana premios y demuestra tu agilidad mental!',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Copa Mental',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/icon-192x192.png',
  },
};

/** @type {import('next').Viewport} */
export const viewport = {
  themeColor: '#06B6D4',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>
        <ServiceWorkerReload />
        {children}
      </body>
    </html>
  );
}
