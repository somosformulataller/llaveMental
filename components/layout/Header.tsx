'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePlayer } from '@/components/providers/PlayerProvider';

export default function Header() {
  const { player, isLoading, isAdmin, signOut } = usePlayer();
  const pathname = usePathname();

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
          <Link
            href="/game"
            className={`nav-link ${pathname === '/game' ? 'nav-link-active' : ''}`}
            prefetch
          >
            Jugar
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className={`nav-link ${pathname === '/admin' ? 'nav-link-active' : ''}`}
              prefetch
            >
              Admin
            </Link>
          )}
        </nav>
      </motion.div>

      <motion.div
        className="header-right"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        {player ? (
          <>
            <div className="wallet-badge">
              <span className="wallet-icon">💰</span>
              <span className="wallet-amount">${player.balance.toFixed(2)}</span>
            </div>
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
