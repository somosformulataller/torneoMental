'use client';

import styles from './card.module.css';

// Reverso de carta dibujado 100% en código (SVG). Base oscura compartida +
// color de acento por temática + patrón visible (sin letras/monograma).
// Nítido a cualquier resolución y muy liviano.
const THEMES = {
  tecnologia: { a: '#A78BFA', b: '#818CF8', pattern: 'circuit' },
  naturaleza: { a: '#34D399', b: '#4ADE80', pattern: 'topo' },
  animales: { a: '#FB923C', b: '#FBBF24', pattern: 'lowpoly' },
};

function CircuitPattern({ a, b }) {
  const cols = [150, 450, 750];
  const rows = [120, 360, 600, 840, 1080];
  const len = 120;
  const traces = [];
  const nodes = [];
  cols.forEach((cx, i) => {
    rows.forEach((cy, j) => {
      const dirX = (i + j) % 2 === 0 ? 1 : -1;
      const dirY = j % 2 === 0 ? 1 : -1;
      const ex = cx + dirX * len;
      const ey = cy + dirY * len;
      traces.push(
        <path key={`t${i}-${j}`} d={`M${cx} ${cy} h${dirX * len} v${dirY * len}`} fill="none" stroke={a} strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" />
      );
      nodes.push(<circle key={`n${i}-${j}`} cx={cx} cy={cy} r="11" fill={a} />);
      nodes.push(<circle key={`e${i}-${j}`} cx={ex} cy={ey} r="7" fill={b} />);
    });
  });
  return <g>{traces}{nodes}</g>;
}

function TopoPattern({ a, b }) {
  const lines = [];
  for (let k = 0; k < 12; k++) {
    const y = 40 + k * 100;
    const up = k % 2 === 0 ? -34 : 34;
    const d = `M -40 ${y} Q 65 ${y + up}, 170 ${y} T 380 ${y} T 590 ${y} T 800 ${y} T 1010 ${y}`;
    const op = k % 2 === 0 ? 0.5 : 0.34;
    const col = k % 3 === 0 ? b : a;
    lines.push(<path key={k} d={d} fill="none" stroke={col} strokeWidth="3.5" opacity={op} strokeLinecap="round" />);
  }
  return <g>{lines}</g>;
}

function LowPolyPattern({ a, b }) {
  const s = 150;
  const edges = [];
  const dots = [];
  for (let gy = 0; gy <= 1200; gy += s) {
    for (let gx = 0; gx <= 900; gx += s) {
      edges.push(<path key={`${gx}-${gy}-1`} d={`M${gx} ${gy} L${gx + s} ${gy} L${gx} ${gy + s} Z`} fill="none" stroke={a} strokeWidth="2.2" strokeOpacity="0.34" />);
      edges.push(<path key={`${gx}-${gy}-2`} d={`M${gx + s} ${gy} L${gx + s} ${gy + s} L${gx} ${gy + s} Z`} fill="none" stroke={b} strokeWidth="2.2" strokeOpacity="0.34" />);
      dots.push(<circle key={`${gx}-${gy}-d`} cx={gx} cy={gy} r="6" fill={a} fillOpacity="0.85" />);
    }
  }
  return <g>{edges}{dots}</g>;
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
        <radialGradient id={glowId} cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor={a} stopOpacity="0.12" />
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
      <rect x="26" y="26" width="848" height="1148" rx="42" fill="none" stroke={a} strokeOpacity="0.55" strokeWidth="3" />
      <rect x="46" y="46" width="808" height="1108" rx="30" fill="none" stroke={a} strokeOpacity="0.15" strokeWidth="1.5" />
    </svg>
  );
}
