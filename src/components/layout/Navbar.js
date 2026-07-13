'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './navbar.module.css';

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/home', label: 'Inicio', icon: '🏠' },
    { href: '/jugar', label: 'Jugar', icon: '🎮' },
    { href: '/ranking', label: 'Ranking', icon: '🏆' },
    { href: '/billetera', label: 'Billetera', icon: '💰' },
  ];

  return (
    <nav className={styles.navbar}>
      <div className={styles.navContainer}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
              {isActive && <div className={styles.activeIndicator} />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
