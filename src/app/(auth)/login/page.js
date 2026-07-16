'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import ParticleBackground from '@/components/ui/ParticleBackground';
import InstallAppButton from '@/components/ui/InstallAppButton';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (data?.user) {
        // Verificar rol
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();

        router.push(profile?.role === 'admin' ? '/admin' : '/home');
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Credenciales incorrectas' : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.backgroundOverlay}></div>
      <ParticleBackground />

      <div className={styles.heroSection}>
        <h1 className={styles.mainTitle}>Copa Mental:<br/><span className={styles.subTitle}>Memoriza y gana</span></h1>
      </div>

      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoIcon}>🏆</div>
          <h2 className={styles.loginTitle}>Inicia Sesión</h2>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Correo Electrónico</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              placeholder="tu@email.com"
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Contraseña</label>
            <div className={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                placeholder="••••••••"
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '👁️' : '🙈'}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Iniciando...' : 'Entrar al Torneo'}
          </button>
        </form>

        <div className={styles.footer}>
          <Link href="/registro" className={styles.link}>
            ¿No tienes cuenta? <span className={styles.linkHighlight}>Regístrate aquí</span>
          </Link>
        </div>

        <InstallAppButton />
      </div>
    </div>
  );
}
