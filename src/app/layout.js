import './globals.css';

export const metadata = {
  title: 'Torneo Mental - Juego de Memoria',
  description: 'Compite en torneos de memoria con cartas temáticas. ¡Gana premios y demuestra tu agilidad mental!',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Torneo Mental',
  },
};

/** @type {import('next').Viewport} */
export const viewport = {
  themeColor: '#00f5ff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
