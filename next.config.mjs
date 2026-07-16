import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  fallbacks: {
    document: '/~offline',
  },
  // Copa Mental siempre necesita datos en vivo (tickets, ranking, torneo
  // activo) — no tiene sentido, y de hecho es activamente dañino, que el
  // service worker cachee páginas/RSC/datos y los sirva desde caché cuando
  // ya no coinciden con lo que hay en el servidor tras un deploy nuevo (la
  // causa de los "This page couldn't load"). Se deja sin reglas de runtime
  // caching: cada request va directo a la red, como en un sitio normal sin
  // PWA; el service worker solo queda para la instalabilidad.
  workboxOptions: {
    runtimeCaching: [],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
};

export default withPWA(nextConfig);
