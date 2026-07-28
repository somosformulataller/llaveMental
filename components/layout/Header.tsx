'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePlayer } from '@/components/providers/PlayerProvider';

// Header en DOS filas, solo botones (sin marca/ícono) para que nada
// se oculte ni se superponga:
//  · Fila 1: navegación + Salir (o Iniciar sesión)
//  · Fila 2: contadores de tickets y saldo + usuario
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
        className="header-row"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <nav className="header-nav">
          {navLink('/', 'Inicio')}
          {navLink('/game', 'Jugar')}
          {player && navLink('/ranking', 'Ranking')}
          {player && navLink('/billetera', 'Billetera')}
          {isAdmin && navLink('/admin', 'Admin')}
        </nav>
        {player ? (
          <button className="signout-btn" onClick={signOut}>
            Salir
          </button>
        ) : (
          !isLoading && (
            <Link href="/auth/login" className="btn-login" prefetch>
              Iniciar sesión
            </Link>
          )
        )}
      </motion.div>

      {player && (
        <motion.div
          className="header-row header-row-nav"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="header-badges">
            <Link href="/billetera" className="wallet-badge" prefetch>
              <span className="wallet-icon">🎟️</span>
              <span className="wallet-amount">{player.tickets ?? 0}</span>
            </Link>
            <Link href="/billetera" className="wallet-badge" prefetch>
              <span className="wallet-icon">💰</span>
              <span className="wallet-amount">${player.balance.toFixed(2)}</span>
            </Link>
          </div>
          <div className="user-badge">
            <span>
              {isAdmin ? '👑 ' : ''}
              {player.username || 'Jugador'}
            </span>
          </div>
        </motion.div>
      )}
    </header>
  );
}
