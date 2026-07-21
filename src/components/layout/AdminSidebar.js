'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './adminSidebar.module.css';

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/torneos', label: 'Torneos', icon: '🏆' },
    { href: '/admin/recurrencia', label: 'Recurrencia', icon: '🔁' },
    { href: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
    { href: '/admin/transacciones', label: 'Transacciones', icon: '💳' },
    { href: '/admin/interaccion', label: 'Interacción', icon: '📈' },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🧠</span>
          <span className={styles.logoText}>TORNEO MENTAL</span>
        </div>
        <span className={styles.adminBadge}>ADMIN</span>
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          <span className={styles.icon}>🚪</span>
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}
