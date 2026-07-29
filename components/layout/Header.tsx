'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayer } from '@/components/providers/PlayerProvider';
import NotificationsBell from './NotificationsBell';

// Header en una sola fila: desplegable de navegación (UI propia),
// contadores de tickets y saldo actuales, y la campanita de
// notificaciones. El canje de tickets vive en la barra inferior
// (RedeemBar) y Salir es la última opción del desplegable.
export default function Header() {
  const { player, isLoading, isAdmin, signOut } = usePlayer();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSignOut = () => {
    setMenuOpen(false);
    signOut();
  };

  // Cerrar el desplegable al tocar fuera o con Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const go = (path: string) => {
    setMenuOpen(false);
    router.push(path);
  };

  // El admin no juega: su menú no ofrece la pantalla de juego
  const menuItems = isAdmin
    ? [
        { label: '👑 Admin', path: '/admin' },
        { label: '💬 Chat de atención', path: '/admin/chat' },
        { label: '🏆 Ranking', path: '/ranking' },
      ]
    : [
        { label: '👛 Canjear o retirar', path: '/billetera' },
        { label: '🎟️ Comprar más tickets', path: '/comprar' },
        { label: '🏆 Ranking', path: '/ranking' },
        { label: '🔑 Jugar', path: '/game' },
      ];

  return (
    <header className="game-header">
      {player ? (
        <div className="header-row">
          {/* Desplegable con la UI de la app (no el select nativo) */}
          <div className="menu-wrap" ref={menuRef}>
            <button
              className="header-select"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <span className="header-select-label">Canjear o retirar</span>
              <span className={`menu-caret ${menuOpen ? 'menu-caret-open' : ''}`}>▾</span>
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  className="menu-list"
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                  {menuItems.map((item) => (
                    <button
                      key={item.path}
                      className="menu-item"
                      role="menuitem"
                      onClick={() => go(item.path)}
                    >
                      {item.label}
                    </button>
                  ))}
                  {/* Salir: SIEMPRE la última opción del menú */}
                  <div className="menu-divider" />
                  <button
                    className="menu-item menu-item-danger"
                    role="menuitem"
                    onClick={handleSignOut}
                  >
                    🚪 Salir
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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

          <NotificationsBell />
        </div>
      ) : (
        <div className="header-row">
          <Link href="/game" className="nav-link" prefetch>
            Jugar
          </Link>
          {!isLoading && (
            <Link href="/auth/login" className="btn-login" prefetch>
              Iniciar sesión
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
