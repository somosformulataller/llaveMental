'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { TICKET_PRICE_USD } from '@/lib/payments/constants';

// Header-centro de canje:
//  · Select desplegable: "Canjear o retirar" (→ pantalla Billetera) y
//    "Ranking" (→ pantalla Ranking).
//  · "Todo a tickets": canjea TODO el saldo ganado automáticamente.
//  · Stepper −/+ para canjear una cantidad manual, con la relación en
//    vivo (1 ticket = $2 y cuánto saldo quedaría).
//  · Contadores de tickets y saldo actuales.
export default function Header() {
  const { player, isLoading, isAdmin, refresh, signOut } = usePlayer();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [redeeming, setRedeeming] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const balance = Number(player?.balance ?? 0);
  const tickets = Number(player?.tickets ?? 0);
  const maxRedeem = Math.floor(balance / TICKET_PRICE_USD);
  const q = Math.min(Math.max(1, qty), Math.max(1, maxRedeem));
  const canRedeem = maxRedeem >= 1;

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 4000);
  };

  const redeem = async (all: boolean) => {
    if (redeeming || !canRedeem) return;
    setRedeeming(true);
    try {
      const res = await fetch('/api/wallet/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(all ? { all: true } : { tickets: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        showFlash(`⚠️ ${data.error || 'No se pudo canjear'}`);
        return;
      }
      showFlash(`✅ Canjeaste ${data.redeemed} ticket${data.redeemed > 1 ? 's' : ''}`);
      setQty(1);
      refresh();
    } catch {
      showFlash('⚠️ Error de conexión');
    } finally {
      setRedeeming(false);
    }
  };

  // Cada opción del desplegable lleva a su pantalla
  const go = (path: string) => {
    setMenuOpen(false);
    router.push(path);
  };

  const menuItems = [
    { label: '👛 Canjear o retirar', path: '/billetera' },
    { label: '🏆 Ranking', path: '/ranking' },
    { label: '🔑 Jugar', path: '/game' },
    ...(isAdmin ? [{ label: '👑 Admin', path: '/admin' }] : []),
  ];

  return (
    <header className="game-header">
      {player ? (
        <>
          {/* Fila 1: select + canje automático y manual */}
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="redeem-controls">
              <button
                className="btn-mini btn-gold"
                onClick={() => redeem(true)}
                disabled={!canRedeem || redeeming}
                title={
                  canRedeem
                    ? `Canjear todo el saldo (${maxRedeem} tickets)`
                    : 'Sin saldo para canjear'
                }
              >
                Todo a tickets
              </button>
              <div className="stepper">
                <button
                  className="qty-btn qty-btn-sm"
                  onClick={() => setQty(Math.max(1, q - 1))}
                  disabled={!canRedeem || redeeming}
                  aria-label="Menos tickets"
                >
                  −
                </button>
                <span className="stepper-qty">{canRedeem ? q : 0}🎟️</span>
                <button
                  className="qty-btn qty-btn-sm"
                  onClick={() => setQty(Math.min(maxRedeem, q + 1))}
                  disabled={!canRedeem || redeeming}
                  aria-label="Más tickets"
                >
                  +
                </button>
              </div>
              <button
                className="btn-mini btn-gold"
                onClick={() => redeem(false)}
                disabled={!canRedeem || redeeming}
              >
                {redeeming ? 'Canjeando…' : 'Canjear'}
              </button>
            </div>
          </div>

          {/* Fila 2: saldo/tickets actuales + relación del canje */}
          <div className="header-row header-row-nav">
            <div className="header-badges">
              <Link href="/billetera" className="wallet-badge" prefetch>
                <span className="wallet-icon">🎟️</span>
                <span className="wallet-amount">{tickets}</span>
              </Link>
              <Link href="/billetera" className="wallet-badge" prefetch>
                <span className="wallet-icon">💰</span>
                <span className="wallet-amount">${balance.toFixed(2)}</span>
              </Link>
              <span className="redeem-hint">
                {flash
                  ? flash
                  : canRedeem
                  ? `${q} 🎟️ = $${(q * TICKET_PRICE_USD).toFixed(2)} · quedaría $${(
                      balance - q * TICKET_PRICE_USD
                    ).toFixed(2)}`
                  : `1 ticket = $${TICKET_PRICE_USD.toFixed(2)}`}
              </span>
            </div>
            <button className="signout-btn" onClick={signOut}>
              Salir
            </button>
          </div>
        </>
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
