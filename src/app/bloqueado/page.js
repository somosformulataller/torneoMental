'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function BloqueadoPage() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 16,
        padding: 24,
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ fontSize: '3.5rem' }}>🚫</div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Cuenta bloqueada</h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 340, lineHeight: 1.5 }}>
        Tu cuenta fue bloqueada por el administrador y no puede usar la app en
        este momento. Si crees que es un error, escríbenos por WhatsApp.
      </p>
      <button
        onClick={handleLogout}
        style={{
          marginTop: 8,
          padding: '12px 28px',
          background: 'var(--bg-card)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          color: 'var(--text-primary)',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}
