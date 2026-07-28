'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePlayer } from '@/components/providers/PlayerProvider';

export default function Header() {
  const { player, isLoading, isAdmin, signOut } = usePlayer();
  const pathname = usePathname();

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={`nav-link ${pathname === href ? 'nav-link-active' : ''}`}
      prefetch
    >
      {label}
    </Link>
  );

  return (
    <header className="game-header">
      <motion.div
        className="header-brand"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <Link href="/" className="brand-link" prefetch>
          <span className="brand-icon">🗝️</span>
          <span className="brand-name">La Llave Correcta</span>
        </Link>
        <nav className="header-nav">
          {navLink('/game', 'Jugar')}
          {player && navLink('/ranking', 'Ranking')}
          {player && navLink('/billetera', 'Billetera')}
          {isAdmin && navLink('/admin', 'Admin')}
        </nav>
      </motion.div>

      <motion.div
        className="header-right"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        {player ? (
          <>
            <Link href="/billetera" className="wallet-badge" prefetch>
              <span className="wallet-icon">🎟️</span>
              <span className="wallet-amount">{player.tickets ?? 0}</span>
            </Link>
            <Link href="/billetera" className="wallet-badge" prefetch>
              <span className="wallet-icon">💰</span>
              <span className="wallet-amount">${player.balance.toFixed(2)}</span>
            </Link>
            <div className="user-badge">
              <span>
                {isAdmin ? '👑 ' : ''}
                {player.username || 'Jugador'}
              </span>
              <button className="signout-btn" onClick={signOut}>
                Salir
              </button>
            </div>
          </>
        ) : (
          !isLoading && (
            <Link href="/auth/login" className="btn-login" prefetch>
              Iniciar sesión
            </Link>
          )
        )}
      </motion.div>
    </header>
  );
}
