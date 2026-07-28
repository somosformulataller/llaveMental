'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePlayer } from '@/components/providers/PlayerProvider';
import BuyTicketsModal from '@/components/payments/BuyTicketsModal';
import {
  MIN_WITHDRAWAL_USD,
  PURCHASE_STATUS_LABEL,
  TICKET_PRICE_USD,
  VE_BANKS,
  WITHDRAWAL_STATUS_LABEL,
} from '@/lib/payments/constants';
import { TicketPurchase, Withdrawal, Player } from '@/types/game';

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

// "Mi Billetera": tickets, saldo de premios (retirable), canje de
// saldo a tickets, retiro por Pago Móvil, datos de cobro e historiales.
// Se usa en la página /billetera Y dentro del modal del header.
export default function WalletPanel() {
  const { player: ctxPlayer, refresh } = usePlayer();
  const [player, setPlayer] = useState<Player | null>(null);
  const [purchases, setPurchases] = useState<TicketPurchase[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [buyOpen, setBuyOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Canje saldo → tickets
  const [redeemQty, setRedeemQty] = useState(1);
  const [redeeming, setRedeeming] = useState(false);

  // Retiro
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);

  // Datos de cobro
  const [payoutForm, setPayoutForm] = useState({ name: '', bank: '', cedula: '', phone: '' });
  const [savingPayout, setSavingPayout] = useState(false);

  const [checking, setChecking] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setPlayer(data.player);
        setPurchases(data.purchases ?? []);
        setWithdrawals(data.withdrawals ?? []);
        if (data.player) {
          setPayoutForm({
            name: data.player.payout_name ?? '',
            bank: data.player.payout_bank ?? '',
            cedula: data.player.payout_cedula ?? '',
            phone: data.player.payout_phone ?? '',
          });
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    // La carga es asíncrona: el setState ocurre tras el fetch, no en
    // el cuerpo del efecto (falso positivo del compilador).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWallet();
  }, [loadWallet]);

  const pendingPurchases = purchases.filter(
    (p) => p.status === 'pendiente' || p.status === 'validando'
  );

  // Mientras haya pagos en revisión, reintentar solo cada 60 s
  const hasPending = pendingPurchases.length > 0;
  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/purchases/recheck', { method: 'POST' });
        const data = await res.json();
        if ((data.approved ?? 0) > 0) {
          refresh();
          setNotice('✅ ¡Tu pago fue aprobado! Ya tienes tus tickets listos.');
        }
        loadWallet();
      } catch {}
    }, 60_000);
    return () => clearInterval(interval);
  }, [hasPending, loadWallet, refresh]);

  const handleRecheck = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/purchases/recheck', { method: 'POST' });
      const data = await res.json();
      if ((data.approved ?? 0) > 0) {
        refresh();
        setNotice('✅ ¡Tu pago fue aprobado! Ya tienes tus tickets listos.');
      }
      await loadWallet();
    } catch {
    } finally {
      setChecking(false);
    }
  };

  const balance = Number(player?.balance ?? ctxPlayer?.balance ?? 0);
  const tickets = Number(player?.tickets ?? ctxPlayer?.tickets ?? 0);
  const maxRedeem = Math.floor(balance / TICKET_PRICE_USD);
  const clampedQty = Math.min(Math.max(1, redeemQty), Math.max(1, maxRedeem));
  const pendingWithdrawal = withdrawals.find((w) => w.status === 'pendiente') ?? null;

  const handleRedeem = async (all: boolean) => {
    setRedeeming(true);
    setError(null);
    try {
      const res = await fetch('/api/wallet/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(all ? { all: true } : { tickets: clampedQty }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo canjear');
        return;
      }
      setNotice(`🎫 ¡Listo! Canjeaste ${data.redeemed} ticket(s).`);
      setRedeemQty(1);
      refresh();
      await loadWallet();
    } catch {
      setError('Error de conexión');
    } finally {
      setRedeeming(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    setError(null);
    if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL_USD) {
      setError(`El monto mínimo de retiro es $${MIN_WITHDRAWAL_USD.toFixed(2)}`);
      return;
    }
    if (amount > balance) {
      setError('El monto sobrepasa el saldo de tu billetera.');
      return;
    }
    setWithdrawing(true);
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo solicitar el retiro');
        return;
      }
      setWithdrawAmount('');
      setWithdrawModal(true);
      refresh();
      await loadWallet();
    } catch {
      setError('Error de conexión');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleSavePayout = async () => {
    setSavingPayout(true);
    setError(null);
    try {
      const res = await fetch('/api/wallet/payout-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payoutForm),
      });
      if (res.ok) setNotice('✅ Datos guardados correctamente.');
      else setError('No se pudieron guardar los datos');
    } catch {
      setError('Error de conexión');
    } finally {
      setSavingPayout(false);
    }
  };

  return (
    <div className="wallet-main">
      <motion.h1
        className="wallet-title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        👛 Mi Billetera
      </motion.h1>

      {notice && (
        <div className="wallet-notice" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      {error && (
        <div className="auth-error" onClick={() => setError(null)}>
          ⚠️ {error}
        </div>
      )}

      <div className="wallet-grid">
        {/* ── Tickets ── */}
        <section className="wallet-card">
          <h2 className="wallet-card-title">🎫 Tickets Disponibles</h2>
          <p className="wallet-big">{tickets}</p>
          <p className="wallet-sub">
            Valor: {fmt(tickets * TICKET_PRICE_USD)} · 1 ticket = 1 partida
          </p>
          {hasPending && (
            <div className="wallet-pending">
              ⏳ Tienes {pendingPurchases.length} pago{pendingPurchases.length > 1 ? 's' : ''} en
              revisión. Se acreditarán solos apenas el banco confirme.
              <button className="btn-mini" onClick={handleRecheck} disabled={checking}>
                {checking ? 'Verificando…' : 'Verificar ahora'}
              </button>
            </div>
          )}
          <button className="btn-primary" onClick={() => setBuyOpen(true)}>
            Comprar más tickets
          </button>
        </section>

        {/* ── Premios / Retiro ── */}
        <section className="wallet-card">
          <h2 className="wallet-card-title">🏆 Premios Ganados</h2>
          <p className="wallet-big">{fmt(balance)}</p>
          <p className="wallet-sub">
            Saldo retirable: se acumula con cada partida ganada.
          </p>

          <div className="wallet-inner">
            <p className="wallet-inner-title">💸 Retirar dinero</p>
            {pendingWithdrawal ? (
              <p className="wallet-pending">
                Retiro solicitado — {fmt(Number(pendingWithdrawal.amount_usd))} · en proceso.
                Podrás solicitar otro cuando sea pagado.
              </p>
            ) : balance < MIN_WITHDRAWAL_USD ? (
              <p className="wallet-sub">
                No tienes saldo disponible para retirar. ¡Gana partidas para acumular premios!
              </p>
            ) : (
              <div className="wallet-row">
                <input
                  className="ref-input wallet-amount-input"
                  type="number"
                  min={MIN_WITHDRAWAL_USD}
                  max={balance}
                  step="0.01"
                  placeholder={`Monto ($${MIN_WITHDRAWAL_USD.toFixed(2)} mín.)`}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                />
                <button className="btn-primary" onClick={handleWithdraw} disabled={withdrawing}>
                  {withdrawing ? 'Enviando…' : 'Retirar'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── Canjear saldo por tickets ── */}
        <section className="wallet-card">
          <h2 className="wallet-card-title">🎟️ Canjear saldo por tickets</h2>
          {maxRedeem < 1 ? (
            <p className="wallet-sub">
              Aún no tienes saldo para canjear (1 ticket = {fmt(TICKET_PRICE_USD)}). ¡Gana
              partidas para ganar premios! 🏆
            </p>
          ) : (
            <>
              <p className="wallet-sub">
                1 ticket = {fmt(TICKET_PRICE_USD)}. Tienes {fmt(balance)} (hasta {maxRedeem}{' '}
                ticket{maxRedeem > 1 ? 's' : ''}).
              </p>
              <div className="qty-row">
                <button
                  className="qty-btn"
                  onClick={() => setRedeemQty((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <div className="qty-value">
                  <span className="qty-number">{clampedQty}</span>
                  <span className="qty-label">ticket{clampedQty > 1 ? 's' : ''}</span>
                </div>
                <button
                  className="qty-btn"
                  onClick={() => setRedeemQty((q) => Math.min(maxRedeem, q + 1))}
                >
                  +
                </button>
              </div>
              {/* Vista previa en tiempo real del canje */}
              <p className="redeem-preview">
                Canjeas {fmt(clampedQty * TICKET_PRICE_USD)} → te quedarían{' '}
                <strong>{fmt(balance - clampedQty * TICKET_PRICE_USD)}</strong> de saldo y{' '}
                <strong>
                  {tickets + clampedQty} ticket{tickets + clampedQty > 1 ? 's' : ''}
                </strong>
              </p>
              <div className="wallet-row">
                <button
                  className="btn-primary"
                  onClick={() => handleRedeem(false)}
                  disabled={redeeming}
                >
                  {redeeming ? 'Canjeando…' : `Canjear ${clampedQty}`}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => handleRedeem(true)}
                  disabled={redeeming}
                >
                  Todo a tickets ({maxRedeem})
                </button>
              </div>
            </>
          )}
        </section>

        {/* ── Datos de cobro ── */}
        <section className="wallet-card">
          <h2 className="wallet-card-title">🏦 Datos para recibir tus premios</h2>
          <p className="wallet-sub">
            Si retiras, te pagamos por Pago Móvil a estos datos. Complétalos para que podamos
            pagarte sin demoras.
          </p>
          <div className="payout-form">
            <input
              className="ref-input"
              placeholder="Nombre completo"
              value={payoutForm.name}
              onChange={(e) => setPayoutForm((f) => ({ ...f, name: e.target.value }))}
            />
            <select
              className="ref-input"
              value={payoutForm.bank}
              onChange={(e) => setPayoutForm((f) => ({ ...f, bank: e.target.value }))}
            >
              <option value="">Selecciona tu banco</option>
              {VE_BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <input
              className="ref-input"
              placeholder="Cédula (Ej: V-12345678)"
              value={payoutForm.cedula}
              onChange={(e) => setPayoutForm((f) => ({ ...f, cedula: e.target.value }))}
            />
            <input
              className="ref-input"
              placeholder="Teléfono (Ej: 04121234567)"
              value={payoutForm.phone}
              onChange={(e) => setPayoutForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <button className="btn-primary" onClick={handleSavePayout} disabled={savingPayout}>
              {savingPayout ? 'Guardando…' : 'Guardar datos de pago'}
            </button>
          </div>
        </section>
      </div>

      {/* ── Historial de compras ── */}
      <section className="wallet-history">
        <h2 className="wallet-card-title">🧾 Historial de Compras</h2>
        {purchases.length === 0 ? (
          <p className="wallet-sub">No tienes compras registradas aún.</p>
        ) : (
          <ul className="history-list">
            {purchases.map((p) => (
              <li key={p.id} className="history-item">
                <div className="history-line">
                  <span className={`status-badge status-${p.status}`}>
                    {PURCHASE_STATUS_LABEL[p.status]}
                  </span>
                  <strong>+{p.quantity} Ticket{p.quantity > 1 ? 's' : ''}</strong>
                  <span>{fmt(Number(p.amount_usd))}</span>
                  <span className="history-date">{fmtDate(p.created_at)}</span>
                </div>
                <div className="history-sub">
                  Ref: {p.reference}
                  {p.status === 'rechazado' && p.status_note ? ` · Nota: ${p.status_note}` : ''}
                  {(p.status === 'pendiente' || p.status === 'validando') && (
                    <>
                      {' '}
                      · ⏳ En revisión: te sumaremos los tickets cuando el banco confirme tu pago
                      (suele tardar 1–2 minutos).
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Historial de retiros ── */}
      <section className="wallet-history">
        <h2 className="wallet-card-title">💸 Historial de Retiros</h2>
        {withdrawals.length === 0 ? (
          <p className="wallet-sub">Aún no has solicitado retiros.</p>
        ) : (
          <ul className="history-list">
            {withdrawals.map((w) => (
              <li key={w.id} className="history-item">
                <div className="history-line">
                  <span className={`status-badge status-${w.status === 'pagado' ? 'aprobado' : w.status === 'cancelado' ? 'rechazado' : 'pendiente'}`}>
                    {WITHDRAWAL_STATUS_LABEL[w.status]}
                  </span>
                  <strong>{fmt(Number(w.amount_usd))}</strong>
                  <span className="history-date">{fmtDate(w.created_at)}</span>
                </div>
                {w.reference && <div className="history-sub">Ref. del pago: {w.reference}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <BuyTicketsModal
        open={buyOpen}
        onClose={() => {
          setBuyOpen(false);
          loadWallet();
        }}
        onApproved={loadWallet}
      />

      {/* Confirmación de retiro */}
      {withdrawModal && (
        <div className="modal-overlay" onClick={() => setWithdrawModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">💸</div>
            <h2 className="modal-title">Retiro solicitado</h2>
            <p className="modal-subtitle">
              Su retiro se hará efectivo en un plazo de 15 a 30 minutos.
            </p>
            <button className="btn-primary" onClick={() => setWithdrawModal(false)}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
