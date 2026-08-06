'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/components/providers/PlayerProvider';
import {
  MAX_TICKETS_PER_PURCHASE,
  PAYMENT_DESTINATION,
  TICKET_PRICE_USD,
} from '@/lib/payments/constants';

interface BuyTicketsModalProps {
  open: boolean;
  onClose: () => void;
  /** Se llama cuando una compra queda aprobada (tickets acreditados) */
  onApproved?: () => void;
}

type Phase = 'form' | 'sending' | 'aprobado' | 'pendiente' | 'error';

const fmtBs = (n: number) =>
  `Bs. ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Modal "Comprar Tickets": cantidad, total en USD y Bs (tasa BCV en
// vivo), datos del Pago Móvil y referencia. Al enviar, el servidor
// valida el pago contra el banco: si coincide se aprueba al instante;
// si no, queda en revisión y se reintenta solo.
export default function BuyTicketsModal({ open, onClose, onApproved }: BuyTicketsModalProps) {
  const { refresh } = usePlayer();
  const [qty, setQty] = useState(1);
  const [reference, setReference] = useState('');
  const [rate, setRate] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // Captura del pago (opcional): se sube tras registrar la compra
  const [proofFile, setProofFile] = useState<File | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const totalUsd = qty * TICKET_PRICE_USD;
  const totalVes = rate ? totalUsd * rate : null;

  useEffect(() => {
    if (!open) return;
    fetch('/api/exchange-rate', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setRate(d.rate ?? null))
      .catch(() => setRate(null));
  }, [open]);

  const reset = useCallback(() => {
    setPhase('form');
    setMessage(null);
    setReference('');
    setQty(1);
    setProofFile(null);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    // Al reabrir siempre empieza limpio
    setTimeout(reset, 300);
  }, [onClose, reset]);

  const handleSubmit = async () => {
    if (reference.trim().length < 4) {
      setMessage('Escribe el número de referencia del pago');
      return;
    }
    setPhase('sending');
    setMessage(null);
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty, reference: reference.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase('error');
        setMessage(data.error || 'No se pudo enviar la solicitud. Intenta de nuevo.');
        return;
      }
      // Comprobante opcional: se sube aparte y su fallo no afecta la
      // compra (el pago se valida contra el banco, no con la imagen)
      if (proofFile && data.purchase_id) {
        try {
          const fd = new FormData();
          fd.append('purchase_id', data.purchase_id);
          fd.append('file', proofFile);
          await fetch('/api/purchases/proof', { method: 'POST', body: fd });
        } catch {}
      }
      if (data.status === 'aprobado') {
        setPhase('aprobado');
        refresh();
        onApproved?.();
      } else {
        setPhase('pendiente');
        setMessage(data.reason ?? null);
      }
    } catch {
      setPhase('error');
      setMessage('No se pudo enviar la solicitud. Intenta de nuevo.');
    }
  };

  const handleRecheck = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/purchases/recheck', { method: 'POST' });
      const data = await res.json();
      if ((data.approved ?? 0) > 0) {
        setPhase('aprobado');
        refresh();
        onApproved?.();
      }
    } catch {
    } finally {
      setChecking(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="modal-card buy-modal"
            initial={{ scale: 0.85, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {phase === 'form' && (
              <>
                <h2 className="modal-title buy-title">🎟️ Comprar Tickets</h2>

                {/* Cantidad */}
                <div className="qty-row">
                  <button
                    className="qty-btn"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    aria-label="Menos tickets"
                  >
                    −
                  </button>
                  <div className="qty-value">
                    <span className="qty-number">{qty}</span>
                    <span className="qty-label">ticket{qty > 1 ? 's' : ''}</span>
                  </div>
                  <button
                    className="qty-btn"
                    onClick={() => setQty((q) => Math.min(MAX_TICKETS_PER_PURCHASE, q + 1))}
                    aria-label="Más tickets"
                  >
                    +
                  </button>
                </div>

                {/* Desglose */}
                <div className="price-box">
                  <div className="price-line">
                    <span>Precio unitario</span>
                    <span>
                      ${TICKET_PRICE_USD.toFixed(2)}
                      {rate ? ` (${fmtBs(TICKET_PRICE_USD * rate)})` : ''}
                    </span>
                  </div>
                  <div className="price-line price-total">
                    <span>Total</span>
                    <span>
                      ${totalUsd.toFixed(2)}
                      {totalVes !== null ? ` (${fmtBs(totalVes)})` : ''}
                    </span>
                  </div>
                  {rate ? (
                    <p className="rate-note">Tasa BCV: Bs. {rate.toFixed(2)} / USD</p>
                  ) : (
                    <p className="rate-note">Sin tasa BCV disponible ahora mismo</p>
                  )}
                </div>

                {/* Datos del pago */}
                <div className="pay-data">
                  <p className="pay-data-title">Datos para el Pago Móvil</p>
                  <div className="pay-data-grid">
                    <span>Banco</span>
                    <strong>{PAYMENT_DESTINATION.banco}</strong>
                    <span>Teléfono</span>
                    <strong>{PAYMENT_DESTINATION.telefono}</strong>
                    <span>C.I.</span>
                    <strong>{PAYMENT_DESTINATION.cedula}</strong>
                    <span>Concepto</span>
                    <strong>{PAYMENT_DESTINATION.concepto}</strong>
                  </div>
                  <p className="pay-instruction">
                    Transfiere <strong>${totalUsd.toFixed(2)}</strong>
                    {totalVes !== null ? (
                      <>
                        {' '}
                        (<strong>{fmtBs(totalVes)}</strong>)
                      </>
                    ) : null}{' '}
                    y coloca la referencia del pago:
                  </p>
                </div>

                <input
                  className="ref-input"
                  placeholder="Número de referencia del pago"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={40}
                  inputMode="numeric"
                />
                <p className="ref-hint">
                  💡 Puedes escribir la referencia completa o solo sus{' '}
                  <strong>últimos 6 dígitos</strong>.
                </p>

                {/* Captura del pago (opcional) */}
                <input
                  ref={proofInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                />
                {proofFile ? (
                  <div className="proof-row">
                    <span className="proof-name">📎 {proofFile.name}</span>
                    <button
                      className="proof-remove"
                      onClick={() => {
                        setProofFile(null);
                        if (proofInputRef.current) proofInputRef.current.value = '';
                      }}
                      aria-label="Quitar imagen"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    className="proof-attach"
                    type="button"
                    onClick={() => proofInputRef.current?.click()}
                  >
                    📎 Adjuntar captura del pago (opcional)
                  </button>
                )}

                {message && <p className="buy-error">⚠️ {message}</p>}

                <button
                  className="btn-primary buy-submit"
                  onClick={handleSubmit}
                  disabled={reference.trim().length < 4}
                >
                  Enviar solicitud de pago
                </button>
                <button className="btn-ghost" onClick={handleClose}>
                  Cancelar
                </button>
              </>
            )}

            {phase === 'sending' && (
              <div className="buy-status">
                <div className="modal-icon">⏳</div>
                <h2 className="modal-title">Validando pago</h2>
                <p className="modal-subtitle">
                  Validando tu pago… Esto puede tardar unos segundos. No cierres esta ventana.
                </p>
              </div>
            )}

            {phase === 'aprobado' && (
              <div className="buy-status">
                <div className="modal-icon">🎉</div>
                <h2 className="modal-title win-title">¡Pago aprobado!</h2>
                <p className="modal-subtitle">
                  Se sumaron {qty} ticket{qty > 1 ? 's' : ''} a tu cuenta. ¡Mucha suerte!
                </p>
                <button className="btn-primary" onClick={handleClose}>
                  ▶ Jugar ahora
                </button>
              </div>
            )}

            {phase === 'pendiente' && (
              <div className="buy-status">
                <div className="modal-icon">🕒</div>
                <h2 className="modal-title">Verificando tu pago</h2>
                <p className="modal-subtitle">
                  {message ?? 'Tu pago se está verificando.'} Apenas se confirme te llegará una
                  notificación 🔔 y tus tickets se sumarán automáticamente. Puedes cerrar esta
                  ventana con tranquilidad, o tocar «Verificar de nuevo» si quieres.
                </p>
                <button className="btn-primary" onClick={handleRecheck} disabled={checking}>
                  {checking ? 'Verificando…' : 'Verificar de nuevo'}
                </button>
                <button className="btn-ghost" onClick={handleClose}>
                  Listo
                </button>
              </div>
            )}

            {phase === 'error' && (
              <div className="buy-status">
                <div className="modal-icon">⚠️</div>
                <h2 className="modal-title">No se pudo procesar</h2>
                <p className="modal-subtitle">{message}</p>
                <button className="btn-primary" onClick={() => setPhase('form')}>
                  Volver
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
