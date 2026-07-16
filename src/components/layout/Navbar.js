'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { HomeIcon, PlayCardIcon, TrophyIcon, WalletIcon } from './NavIcons';
import styles from './navbar.module.css';

const navItems = [
  { href: '/home', label: 'Inicio', Icon: HomeIcon },
  { href: '/jugar', label: 'Competir', Icon: PlayCardIcon },
  { href: '/ranking', label: 'Ranking', Icon: TrophyIcon },
  { href: '/billetera', label: 'Billetera', Icon: WalletIcon },
];

function NavbarLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // /jugar sirve tanto el modo competitivo como el de práctica; en práctica
  // no debe verse "Competir" resaltado, engañaría al jugador haciéndole
  // pensar que está gastando tickets/compitiendo por el ranking.
  const isPractice = pathname === '/jugar' && searchParams.get('modo') === 'practica';

  return (
    <>
      {navItems.map(({ href, label, Icon }) => {
        const isActive = pathname === href && !(href === '/jugar' && isPractice);
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
    </>
  );
}

export default function Navbar() {
  return (
    <nav className={styles.navbar}>
      <div className={styles.navContainer}>
        <Suspense fallback={null}>
          <NavbarLinks />
        </Suspense>
      </div>
    </nav>
  );
}
