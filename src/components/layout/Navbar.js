'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, PlayCardIcon, TrophyIcon, WalletIcon } from './NavIcons';
import styles from './navbar.module.css';

const navItems = [
  { href: '/home', label: 'Inicio', Icon: HomeIcon },
  { href: '/jugar', label: 'Jugar', Icon: PlayCardIcon },
  { href: '/ranking', label: 'Ranking', Icon: TrophyIcon },
  { href: '/billetera', label: 'Billetera', Icon: WalletIcon },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className={styles.navbar}>
      <div className={styles.navContainer}>
        {navItems.map(({ href, label, Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <Icon className={styles.icon} />
              <span className={styles.label}>{label}</span>
              {isActive && <div className={styles.activeIndicator} />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
