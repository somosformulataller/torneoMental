export const TICKET_PRICE_USD = 1.00;
export const MIN_CARDS = 14;

export const THEMES = {
  tecnologia: {
    id: 'tecnologia',
    name: 'Tecnología',
    icon: '💻',
    color: 'var(--accent-cyan)',
  },
  naturaleza: {
    id: 'naturaleza',
    name: 'Naturaleza',
    icon: '🌿',
    color: 'var(--accent-green)',
  },
  animales: {
    id: 'animales',
    name: 'Animales',
    icon: '🦁',
    color: 'var(--accent-orange)',
  },
};

// Colores en hex (no var()) porque se les concatena un sufijo de alfa,
// ej. `${color}20`, y eso solo es válido con hex, no con var(--token).
export const PAYMENT_STATUSES = {
  pendiente: { label: 'Pendiente', color: '#ffd700' },
  validando: { label: 'Validando', color: '#00f5ff' },
  aprobado: { label: 'Aprobado', color: '#39ff14' },
  rechazado: { label: 'Rechazado', color: '#ff3860' },
};

// Bancos venezolanos para el formulario de datos de Pago Móvil del jugador.
// Nombre visible; el valor guardado es el mismo nombre (legible para el admin
// que hace el pago manual).
export const VENEZUELAN_BANKS = [
  'Banco de Venezuela',
  'Banesco',
  'Mercantil',
  'Banco Provincial (BBVA)',
  'Banco Nacional de Crédito (BNC)',
  'Bancaribe',
  'Banco Occidental de Descuento (BOD)',
  'Banco del Tesoro',
  'Banco Bicentenario',
  'Banco Exterior',
  'Banco Caroní',
  'Banco Sofitasa',
  'Banco Plaza',
  'Banco Fondo Común (BFC)',
  'Banco Activo',
  '100% Banco',
  'Bancamiga',
  'Banco Venezolano de Crédito',
  'Mi Banco',
  'BanCrecer',
  'Banco Agrícola de Venezuela',
];

export const TOURNAMENT_STATUSES = {
  borrador: { label: 'Borrador', color: '#7a7a9e' },
  programado: { label: 'Programado', color: '#00f5ff' },
  activo: { label: 'Activo', color: '#39ff14' },
  finalizado: { label: 'Finalizado', color: '#ff3860' },
};
