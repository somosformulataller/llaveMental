'use client';

import { useState } from 'react';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { TICKET_PRICE_USD } from '@/lib/payments/constants';

// Barra inferior de canje: "Todo a tickets" (canje automático de todo
// el saldo), stepper −/+ para canje manual y la relación en vivo
// (1 ticket = $2 y cuánto saldo quedaría). Solo con sesión iniciada.
export default function RedeemBar() {
  const { player, refresh } = usePlayer();
  const [qty, setQty] = useState(1);
  const [redeeming, setRedeeming] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const balance = Number(player?.balance ?? 0);
  const maxRedeem = Math.floor(balance / TICKET_PRICE_USD);
  const q = Math.min(Math.max(1, qty), Math.max(1, maxRedeem));
  const canRedeem = maxRedeem >= 1;

  if (!player) return null;

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

  return (
    <div className="redeem-bar">
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
  );
}
