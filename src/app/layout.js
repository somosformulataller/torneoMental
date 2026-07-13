import './globals.css';

export const metadata = {
  title: 'Torneo Mental - Juego de Memoria',
  description: 'Compite en torneos de memoria con cartas temáticas. ¡Gana premios y demuestra tu agilidad mental!',
  manifest: '/manifest.json',
  themeColor: '#00f5ff',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Torneo Mental',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
