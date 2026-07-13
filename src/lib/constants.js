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

export const PAYMENT_STATUSES = {
  pendiente: { label: 'Pendiente', color: 'var(--accent-gold)' },
  validando: { label: 'Validando', color: 'var(--accent-cyan)' },
  aprobado: { label: 'Aprobado', color: 'var(--accent-green)' },
  rechazado: { label: 'Rechazado', color: 'var(--accent-red)' },
};

export const TOURNAMENT_STATUSES = {
  borrador: { label: 'Borrador', color: 'var(--text-secondary)' },
  programado: { label: 'Programado', color: 'var(--accent-cyan)' },
  activo: { label: 'Activo', color: 'var(--accent-green)' },
  finalizado: { label: 'Finalizado', color: 'var(--accent-red)' },
};
