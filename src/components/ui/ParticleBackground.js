'use client';

import { useSyncExternalStore } from 'react';
import { Particles, ParticlesProvider } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import styles from './particleBackground.module.css';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// Must be a stable reference across the app lifecycle (ParticlesProvider requirement).
async function initEngine(engine) {
  await loadSlim(engine);
}

function subscribeReducedMotion(callback) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

const PARTICLE_OPTIONS = {
  fullScreen: { enable: false },
  background: { color: 'transparent' },
  fpsLimit: 60,
  particles: {
    number: { value: 26, density: { enable: true, width: 900, height: 900 } },
    color: { value: ['#F59E0B', '#7c3aed', '#7c3aed'] },
    opacity: { value: { min: 0.15, max: 0.5 } },
    size: { value: { min: 1, max: 3 } },
    move: {
      enable: true,
      speed: 0.4,
      direction: 'top',
      random: true,
      straight: false,
      outModes: { default: 'out' },
    },
    links: { enable: false },
  },
  detectRetina: true,
};

export default function ParticleBackground() {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  if (reducedMotion) return null;

  return (
    <ParticlesProvider init={initEngine}>
      <Particles id="tm-particles" className={styles.particles} options={PARTICLE_OPTIONS} />
    </ParticlesProvider>
  );
}
