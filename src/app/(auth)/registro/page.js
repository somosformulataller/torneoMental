'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import AuthCard from '@/components/ui/AuthCard';
import FormInput from '@/components/ui/FormInput';
import Button from '@/components/ui/Button';
import styles from '@/components/ui/authCard.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    whatsapp: '',
    cedula: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  async function handleRegister(e) {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            nombre: formData.nombre,
            apellido: formData.apellido,
            whatsapp: formData.whatsapp,
            cedula: formData.cedula,
          },
        },
      });

      if (authError) throw authError;

      // Registration successful, redirect to login with message
      router.push('/login?registered=true');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard icon="🧠" title="CREAR CUENTA" subtitle="Únete al Torneo Mental" maxWidth={500}>
      <form onSubmit={handleRegister} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.row}>
          <FormInput id="nombre" label="Nombre" value={formData.nombre} onChange={handleChange} required />
          <FormInput id="apellido" label="Apellido" value={formData.apellido} onChange={handleChange} required />
        </div>

        <FormInput
          id="email"
          label="Correo Electrónico"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
        />

        <div className={styles.row}>
          <FormInput
            id="whatsapp"
            label="WhatsApp"
            type="tel"
            value={formData.whatsapp}
            onChange={handleChange}
            placeholder="+58"
            required
          />
          <FormInput
            id="cedula"
            label="Cédula"
            value={formData.cedula}
            onChange={handleChange}
            placeholder="V-12345678"
            required
          />
        </div>

        <FormInput
          id="password"
          label="Contraseña"
          type="password"
          value={formData.password}
          onChange={handleChange}
        <form onSubmit={handleRegister} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Nombre</label>
            <input
              type="text"
              required
              value={formData.nombre}
              onChange={(e) => setFormData({...formData, nombre: e.target.value})}
              className={styles.input}
              placeholder="Juan"
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Apellido</label>
            <input
              type="text"
              required
              value={formData.apellido}
              onChange={(e) => setFormData({...formData, apellido: e.target.value})}
              className={styles.input}
              placeholder="Pérez"
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Correo Electrónico</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className={styles.input}
              placeholder="tu@email.com"
            />
          </div>

          <div className={styles.inputGroup}>
            <label>WhatsApp</label>
            <input
              type="tel"
              required
              value={formData.whatsapp}
              onChange={(e) => setFormData({...formData, whatsapp: e.target.value})}
              className={styles.input}
              placeholder="+584141234567"
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Cédula</label>
            <input
              type="text"
              required
              value={formData.cedula}
              onChange={(e) => setFormData({...formData, cedula: e.target.value})}
              className={styles.input}
              placeholder="V-12345678"
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Contraseña</label>
            <div className={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
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

          <div className={styles.inputGroup}>
            <label>Confirmar Contraseña</label>
            <div className={styles.passwordWrapper}>
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                className={styles.input}
                placeholder="••••••••"
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? '👁️' : '🙈'}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Registrando...' : 'Unirse al Torneo'}
          </button>
        </form>

        <div className={styles.footer}>
          <Link href="/login" className={styles.link}>
            ¿Ya tienes cuenta? <span className={styles.linkHighlight}>Inicia sesión</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
