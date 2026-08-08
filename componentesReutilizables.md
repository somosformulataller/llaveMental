# Componentes reutilizables (retirados de la interfaz)

Componentes que se quitaron de la app pero cuya lógica queda documentada
aquí por si hay que recuperarlos. Retirados el 08/08/2026, cuando la barra
inferior de canje se sustituyó por el botón único de jugar (`PlayBar`).

---

## 1. RedeemBar — barra inferior de canje de saldo por tickets

**Qué hacía:** barra fija en la parte inferior de la app (en todas las
pantallas del shell principal) para canjear saldo de premios por tickets:

- Botón **"Todo a tickets"**: canjeaba TODO el saldo disponible de una vez
  (tantos tickets como cupieran, `floor(saldo / $2)`).
- **Stepper − / +**: elegía una cantidad manual de tickets a canjear
  (mínimo 1, máximo lo que alcanzara el saldo).
- Botón **"Canjear"**: ejecutaba el canje de la cantidad elegida.
- **Texto en vivo**: mostraba la relación del canje elegido
  (`N 🎟️ = $X · quedaría $Y`) o, sin saldo suficiente, `1 ticket = $2.00`.
- Mensajes de éxito/error en la propia barra durante 4 segundos.

**Reglas:**
- Solo visible con sesión iniciada; oculta para el staff (admin/atención):
  `if (!player || isAdmin) return null;` (con `isStaff` renombrado a `isAdmin`).
- `canRedeem` = el saldo alcanza para al menos 1 ticket (`maxRedeem >= 1`).
- La cantidad elegida se ata al rango válido: `q = min(max(1, qty), max(1, maxRedeem))`.
- Tras un canje exitoso: `refresh()` del PlayerProvider para actualizar saldo/tickets.

**Dónde estaba montada:** `app/(main)/layout.tsx`, entre el contenido y el
footer — al ser parte del layout persistente no se re-montaba al navegar:

```tsx
<div className="app-shell">
  <Header />
  <div className="app-content">{children}</div>
  <RedeemBar />
  <footer className="game-footer">…</footer>
  …
</div>
```

**API que usaba:** `POST /api/wallet/redeem`
- Body: `{ all: true }` (todo el saldo) o `{ tickets: N }` (cantidad manual).
- Respuesta ok: `{ redeemed: N, balance, tickets }`.
- Detrás llama al RPC atómico `redeem_tickets(p_qty)` (1 ticket = $2.00,
  descuenta saldo y suma tickets; registra el canje en `ticket_redemptions`).

**CSS (sigue en `app/globals.css`):** `.redeem-bar` (contenedor fijo con
blur y borde dorado superior), `.btn-mini.btn-gold` (botones dorados),
`.stepper`, `.qty-btn-sm`, `.stepper-qty`, `.redeem-hint`.

**Código completo (tal cual estaba en `components/wallet/RedeemBar.tsx`):**

```tsx
'use client';

import { useState } from 'react';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { TICKET_PRICE_USD } from '@/lib/payments/constants';

// Barra inferior de canje: "Todo a tickets" (canje automático de todo
// el saldo), stepper −/+ para canje manual y la relación en vivo
// (1 ticket = $2 y cuánto saldo quedaría). Solo con sesión iniciada.
export default function RedeemBar() {
  const { player, isStaff: isAdmin, refresh } = usePlayer();
  const [qty, setQty] = useState(1);
  const [redeeming, setRedeeming] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const balance = Number(player?.balance ?? 0);
  const maxRedeem = Math.floor(balance / TICKET_PRICE_USD);
  const q = Math.min(Math.max(1, qty), Math.max(1, maxRedeem));
  const canRedeem = maxRedeem >= 1;

  // El admin no juega ni canjea: la barra es solo para jugadores
  if (!player || isAdmin) return null;

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
```

**Para recuperarla:** crear de nuevo `components/wallet/RedeemBar.tsx` con
el código de arriba y montarla en `app/(main)/layout.tsx` (import +
`<RedeemBar />` donde hoy está `<PlayBar />` o junto a ella).

---

## 2. Botones centrales del tablero (sección IDLE de GameBoard)

**Qué hacían:** en la pantalla del juego (`components/game/GameBoard.tsx`),
cuando no había partida activa (`gameStatus === 'IDLE'`), debajo del centro
aparecían dos botones para el jugador con sesión:

- **"🔑 Iniciar juego — 1 ticket"** (clase `.btn-buy`, dorado grande):
  llamaba a `handlePlay()`. Si el jugador no tenía tickets, el MISMO botón
  decía **"🎟️ Comprar tickets"** y `handlePlay` abría el modal de compra
  (`setBuyOpen(true)`).
- **"Comprar más tickets"** (clase `.btn-buy-more`, borde dorado discreto):
  solo visible con tickets > 0; abría el modal de compra.

**JSX exacto que se retiró:**

```tsx
{player || playerLoading ? (
  <>
    <motion.button
      className="btn-buy"
      onClick={handlePlay}
      disabled={isLoading || playerLoading}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {isLoading || playerLoading ? (
        <span className="loading-dots">Cargando...</span>
      ) : tickets > 0 ? (
        <>🔑 Iniciar juego — 1 ticket</>
      ) : (
        <>🎟️ Comprar tickets</>
      )}
    </motion.button>
    {tickets > 0 && (
      <button className="btn-buy-more" onClick={() => setBuyOpen(true)}>
        Comprar más tickets
      </button>
    )}
  </>
) : (
  <Link href="/auth/login" className="btn-buy" prefetch>
    🔐 Iniciar sesión para jugar
  </Link>
)}
```

Notas:
- `handlePlay` (sigue existiendo en GameBoard, ahora lo dispara la barra
  inferior): hace `POST /api/buy-ticket`; con 409 reanuda la partida
  existente; con `NO_TICKETS` abre el modal de compra.
- El enlace "🔐 Iniciar sesión para jugar" para visitantes SÍ se conservó.
- Tocar una llave en IDLE también arranca la partida (o abre el modal si
  no hay tickets) — eso se conservó en `handleKeyClick`.
- CSS: `.btn-buy` y `.btn-buy-more` siguen en `app/globals.css`.

---

## Sustituto actual: PlayBar (barra inferior con botón único)

`components/game/PlayBar.tsx`, montada en `app/(main)/layout.tsx` en el
lugar de RedeemBar. Muestra UN solo botón amarillo según el estado:

1. Tickets > 0 → **"🔑 Iniciar juego"** (arranca la partida; si no estás
   en /game, navega y arranca).
2. Sin tickets y saldo ≥ $2 → **"🎟️ Cambiar $2 por 1 ticket y volver a
   jugar"** (canjea 1 ticket vía `/api/wallet/redeem` y arranca).
3. Sin tickets y sin saldo → **"🎟️ Comprar 1 ticket por $2 para jugar"**
   (abre el modal de compra por Pago Móvil).

La señal barra → tablero viaja por `lib/game/startSignal.ts`
(`requestGameStart()` / `onGameStart()`), con una señal pendiente que
caduca a los 4 s por si el tablero aún no montó.
