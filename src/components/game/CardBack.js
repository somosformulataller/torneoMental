'use client';

import styles from './card.module.css';

// Reverso de carta dibujado 100% en código (SVG). Reemplaza a los PNG con
// borde cian. Base oscura compartida + color de acento por temática + patrón
// sutil + monograma "CM". Nítido a cualquier resolución y muy liviano.
const THEMES = {
  tecnologia: { a: '#A78BFA', b: '#818CF8', pattern: 'circuit' },
  naturaleza: { a: '#34D399', b: '#4ADE80', pattern: 'topo' },
  animales: { a: '#FB923C', b: '#FBBF24', pattern: 'lowpoly' },
};

function CircuitPattern({ a, b }) {
  const rows = [140, 340, 560, 780, 1000];
  const els = [];
  rows.forEach((y, i) => {
    const even = i % 2 === 0;
    const x0 = even ? 90 : 810;
    const x1 = even ? 430 : 470;
    els.push(<path key={`r${i}`} d={`M${x0} ${y} H${x1} V${y + 120}`} fill="none" stroke={a} strokeWidth="3" />);
    els.push(<circle key={`r${i}a`} cx={x0} cy={y} r="7" fill={a} />);
    els.push(<circle key={`r${i}b`} cx={x1} cy={y + 120} r="7" fill={b} />);
  });
  [220, 680].forEach((x, i) => {
    els.push(<path key={`v${i}`} d={`M${x} 120 V300 H${x + 140}`} fill="none" stroke={b} strokeWidth="3" />);
    els.push(<circle key={`v${i}c`} cx={x + 140} cy="300" r="6" fill={a} />);
  });
  return <g opacity="0.22">{els}</g>;
}

function TopoPattern({ a, b }) {
  const lines = [];
  for (let k = 0; k < 12; k++) {
    const y = 40 + k * 100;
    const up = k % 2 === 0 ? -34 : 34;
    const d = `M -40 ${y} Q 65 ${y + up}, 170 ${y} T 380 ${y} T 590 ${y} T 800 ${y} T 1010 ${y}`;
    const op = k % 2 === 0 ? 0.28 : 0.16;
    const col = k % 3 === 0 ? b : a;
    lines.push(<path key={k} d={d} fill="none" stroke={col} strokeWidth="2.5" opacity={op} />);
  }
  return <g>{lines}</g>;
}

function LowPolyPattern({ a, b }) {
  const s = 150;
  const els = [];
  for (let gy = 0; gy <= 1200; gy += s) {
    for (let gx = 0; gx <= 900; gx += s) {
      els.push(<path key={`${gx}-${gy}-1`} d={`M${gx} ${gy} L${gx + s} ${gy} L${gx} ${gy + s} Z`} fill="none" stroke={a} strokeWidth="1.6" />);
      els.push(<path key={`${gx}-${gy}-2`} d={`M${gx + s} ${gy} L${gx + s} ${gy + s} L${gx} ${gy + s} Z`} fill="none" stroke={b} strokeWidth="1.6" />);
    }
  }
  return <g opacity="0.14">{els}</g>;
}

export default function CardBack({ theme = 'tecnologia' }) {
  const t = THEMES[theme] || THEMES.tecnologia;
  const { a, b, pattern } = t;
  const bgId = `cb-bg-${theme}`;
  const glowId = `cb-glow-${theme}`;
  const clipId = `cb-clip-${theme}`;

  return (
    <svg
      className={styles.cardArt}
      viewBox="0 0 900 1200"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Reverso"
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141B2E" />
          <stop offset="1" stopColor="#0A0E1A" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="55%">
          <stop offset="0" stopColor={a} stopOpacity="0.16" />
          <stop offset="1" stopColor={a} stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <rect width="900" height="1200" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <rect width="900" height="1200" fill={`url(#${bgId})`} />
        {pattern === 'circuit' && <CircuitPattern a={a} b={b} />}
        {pattern === 'topo' && <TopoPattern a={a} b={b} />}
        {pattern === 'lowpoly' && <LowPolyPattern a={a} b={b} />}
        <rect width="900" height="1200" fill={`url(#${glowId})`} />
      </g>

      {/* bordes finos */}
      <rect x="26" y="26" width="848" height="1148" rx="42" fill="none" stroke={a} strokeOpacity="0.45" strokeWidth="3" />
      <rect x="46" y="46" width="808" height="1108" rx="30" fill="none" stroke={a} strokeOpacity="0.12" strokeWidth="1.5" />

      {/* emblema / monograma */}
      <rect x="315" y="465" width="270" height="270" rx="56" fill="none" stroke={a} strokeOpacity="0.55" strokeWidth="5" />
      <text
        x="450"
        y="632"
        textAnchor="middle"
        fontFamily="var(--font-primary, 'Outfit', sans-serif)"
        fontWeight="900"
        fontSize="150"
        letterSpacing="6"
        fill={a}
      >
        CM
      </text>
    </svg>
  );
}
