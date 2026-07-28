'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

  // Cada opción del select lleva a su pantalla
  const handleSelect = (value: string) => {
    if (value === 'wallet') router.push('/billetera');
    if (value === 'ranking') router.push('/ranking');
    if (value === 'game') router.push('/game');
    if (value === 'admin') router.push('/admin');
  };

  return (
    <header className="game-header">
      {player ? (
        <>
          {/* Fila 1: select + canje automático y manual */}
          <div className="header-row">
            <select
              className="header-select"
              value=""
              onChange={(e) => handleSelect(e.target.value)}
              aria-label="Menú"
            >
              <option value="" hidden>
                Canjear o retirar
              </option>
              <option value="wallet">Canjear o retirar</option>
              <option value="ranking">Ranking</option>
              <option value="game">Jugar</option>
              {isAdmin && <option value="admin">Admin</option>}
            </select>

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
