'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePlayer } from '@/components/providers/PlayerProvider';
import BuyTicketsModal from '@/components/payments/BuyTicketsModal';
import { TICKET_PRICE_USD } from '@/lib/payments/constants';
import { requestGameStart } from '@/lib/game/startSignal';

// Barra inferior con UN solo botón amarillo, según el estado del
// jugador (sustituye a la barra de canje — ver componentesReutilizables.md):
//   1. Con tickets            → "Iniciar juego"
//   2. Sin tickets, saldo ≥$2 → "Cambiar $2 por 1 ticket y volver a jugar"
//   3. Sin tickets ni saldo   → "Comprar 1 ticket por $2 para jugar"
export default function PlayBar() {
  const { player, isStaff, updatePlayer, refresh } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // El staff no juega: la barra es solo para jugadores con sesión
  if (!player || isStaff) return null;

  const tickets = player.tickets ?? 0;
  const balance = Number(player.balance ?? 0);
  const price = TICKET_PRICE_USD;

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 4000);
  };

  // Arranca la partida: el tablero escucha la señal; si no estamos en
  // /game, primero se navega y la señal se consume al montar.
  const startGame = () => {
    requestGameStart();
    if (pathname !== '/game') router.push('/game');
  };

  // Canjea $2 de saldo por 1 ticket y arranca la partida de una vez
  const exchangeAndPlay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/wallet/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickets: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        showFlash(`⚠️ ${data.error || 'No se pudo hacer el cambio'}`);
        return;
      }
      // Actualización optimista con la respuesta real del canje
      updatePlayer({
        ...(typeof data.balance === 'number' ? { balance: data.balance } : {}),
        ...(typeof data.tickets === 'number' ? { tickets: data.tickets } : {}),
      });
      refresh();
      startGame();
    } catch {
      showFlash('⚠️ Error de conexión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="play-bar">
      {tickets > 0 ? (
        <button className="play-bar-btn" onClick={startGame} disabled={busy}>
          🔑 Iniciar juego
        </button>
      ) : balance >= price ? (
        <button className="play-bar-btn" onClick={exchangeAndPlay} disabled={busy}>
          {busy
            ? 'Cambiando…'
            : `🎟️ Cambiar $${price.toFixed(0)} por 1 ticket y volver a jugar`}
        </button>
      ) : (
        <button className="play-bar-btn" onClick={() => setBuyOpen(true)} disabled={busy}>
          🎟️ Comprar 1 ticket por ${price.toFixed(0)} para jugar
        </button>
      )}
      {flash && <span className="redeem-hint">{flash}</span>}

      <BuyTicketsModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </div>
  );
}
