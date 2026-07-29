'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import GameScene from './GameScene';
import VaultCounter from './VaultCounter';
import WinModal from './WinModal';
import LoseModal from './LoseModal';
import BuyTicketsModal from '@/components/payments/BuyTicketsModal';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { GameStatus, KeyStatus, LockStatus } from '@/types/game';
import { TOTAL_KEYS, INITIAL_VAULT } from '@/lib/game/constants';

export default function GameBoard() {
  const { player, isLoading: playerLoading, updateBalance, updatePlayer, refresh } = usePlayer();

  // Game state
  const [gameStatus, setGameStatus] = useState<GameStatus>('IDLE');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [vault, setVault] = useState(INITIAL_VAULT);
  const [keyStatuses, setKeyStatuses] = useState<KeyStatus[]>(
    Array(TOTAL_KEYS).fill('IDLE')
  );
  const [lockStatus, setLockStatus] = useState<LockStatus>('IDLE');
  const [finalPayout, setFinalPayout] = useState(0);
  const [isDecreasing, setIsDecreasing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  // true cuando ya se consultó si había una partida activa que reanudar
  const [sessionChecked, setSessionChecked] = useState(false);

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    return audioCtxRef.current;
  };

  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine', gain = 0.3) => {
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      gainNode.gain.setValueAtTime(gain, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch {}
  }, []);

  const playErrorSound = useCallback(() => {
    playTone(150, 0.3, 'sawtooth', 0.4);
    setTimeout(() => playTone(100, 0.4, 'sawtooth', 0.3), 150);
  }, [playTone]);

  const playWinSound = useCallback(() => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.4, 'sine', 0.4), i * 120);
    });
  }, [playTone]);

  // Restaura una partida con su estado real: pozo y llaves probadas
  const resumeSession = useCallback((id: string, vaultValue: number, keysTried: number[]) => {
    setSessionId(id);
    setVault(vaultValue);
    setGameStatus('ACTIVE');
    setLockStatus('IDLE');
    setKeyStatuses(() => {
      const next: KeyStatus[] = Array(TOTAL_KEYS).fill('IDLE');
      for (const k of keysTried) {
        if (k >= 0 && k < TOTAL_KEYS) next[k] = 'BROKEN';
      }
      return next;
    });
  }, []);

  // Al entrar al juego: si hay una partida activa, se reanuda sola.
  // El jugador puede salir de la app y volver cuando quiera.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.session) return;
        resumeSession(data.session.session_id, data.session.vault, data.session.keys_tried);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSessionChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeSession]);

  // Empezar una partida (consume 1 ticket)
  const handlePlay = useCallback(async () => {
    if (!player) {
      setError('Debes iniciar sesión para jugar');
      return;
    }
    if ((player.tickets ?? 0) < 1) {
      setBuyOpen(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/buy-ticket', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.session_id) {
          // Reanudar la partida existente con su estado completo
          resumeSession(data.session_id, data.vault ?? INITIAL_VAULT, data.keys_tried ?? []);
          return;
        }
        if (data.code === 'NO_TICKETS') {
          setBuyOpen(true);
          return;
        }
        setError(data.error || 'Error al iniciar la partida');
        return;
      }

      setSessionId(data.session_id);
      setVault(data.vault);
      setGameStatus('ACTIVE');
      setKeyStatuses(Array(TOTAL_KEYS).fill('IDLE'));
      setLockStatus('IDLE');
      if (typeof data.tickets === 'number') updatePlayer({ tickets: data.tickets });
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, [player, resumeSession, updatePlayer]);

  // Con tickets disponibles la partida arranca SOLA: el jugador entra
  // directo a la escena sin pasar por el botón "Jugar". Espera a saber
  // si había una partida que reanudar y no reintenta si hubo un error
  // (ahí sí se muestra el botón para intentarlo a mano).
  useEffect(() => {
    if (!sessionChecked || gameStatus !== 'IDLE' || isLoading || error || buyOpen) return;
    if (!player || (player.tickets ?? 0) < 1) return;
    // El arranque es asíncrono (fetch): el setState ocurre tras la
    // respuesta, no en el cuerpo del efecto (falso positivo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handlePlay();
  }, [sessionChecked, gameStatus, isLoading, error, buyOpen, player, handlePlay]);

  // Key attempt
  const handleKeyClick = async (keyId: number) => {
    if (gameStatus !== 'ACTIVE' || !sessionId || isLoading) return;
    if (keyStatuses[keyId] !== 'IDLE') return;

    setIsLoading(true);

    // Animate key as "flying"
    setKeyStatuses((prev) => {
      const next = [...prev];
      next[keyId] = 'FLYING';
      return next;
    });

    try {
      const res = await fetch('/api/try-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, key_id: keyId }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          // La sesión ya no existe (se completó en otra pestaña o
          // quedó vieja): volver al inicio en limpio, sin trabarse.
          setGameStatus('IDLE');
          setSessionId(null);
          setVault(INITIAL_VAULT);
          setKeyStatuses(Array(TOTAL_KEYS).fill('IDLE'));
          setLockStatus('IDLE');
          refresh();
          return;
        }
        setError(data.error || 'Error al intentar la llave');
        setKeyStatuses((prev) => {
          const next = [...prev];
          next[keyId] = 'IDLE';
          return next;
        });
        return;
      }

      if (data.animation === 'KEY_BROKEN') {
        // FAIL animation
        playErrorSound();
        setKeyStatuses((prev) => {
          const next = [...prev];
          next[keyId] = 'BROKEN';
          return next;
        });
        setLockStatus('SHAKE');
        setIsDecreasing(true);
        setVault(data.vault);

        setTimeout(() => {
          setLockStatus('IDLE');
          setIsDecreasing(false);
        }, 800);

        // Pozo agotado: fin de la partida
        if (data.game_over || data.vault <= 0) {
          setTimeout(() => {
            setGameStatus('COMPLETED_LOSE');
            setFinalPayout(0);
          }, 1000);
        }
      } else if (data.animation === 'LOCK_OPENED') {
        // WIN animation
        playWinSound();
        setKeyStatuses((prev) => {
          const next = [...prev];
          next[keyId] = 'CORRECT';
          return next;
        });
        setLockStatus('OPEN');
        setVault(data.payout);

        setTimeout(() => {
          if (player) updateBalance(player.balance + data.payout);
        }, 1200);

        // Secuencia cinemática: la llave gira (~1s), la puerta se abre
        // y la cámara avanza al tesoro; el modal espera a que se vea.
        setTimeout(() => {
          setGameStatus('COMPLETED_WIN');
          setFinalPayout(data.payout);
        }, 5200);
      }
    } catch {
      setError('Error de conexión');
      setKeyStatuses((prev) => {
        const next = [...prev];
        next[keyId] = 'IDLE';
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayAgain = () => {
    setGameStatus('IDLE');
    setSessionId(null);
    setVault(INITIAL_VAULT);
    setKeyStatuses(Array(TOTAL_KEYS).fill('IDLE'));
    setLockStatus('IDLE');
    setFinalPayout(0);
    setError(null);
    refresh();
  };

  const isGameActive = gameStatus === 'ACTIVE';
  const tickets = player?.tickets ?? 0;

  // Tesoro que se revela al ganar: se deriva del id de sesión, así
  // cada partida muestra una de las 5 variantes distintas.
  const treasureVariant = useMemo(() => {
    if (!sessionId) return 0;
    let h = 0;
    for (let i = 0; i < sessionId.length; i++) {
      h = (h * 31 + sessionId.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % 5;
  }, [sessionId]);

  return (
    <div className="game-board">
      {/* Escena 3D a pantalla completa: mazmorra, puerta, cerradura y llaves */}
      <GameScene
        lockStatus={lockStatus}
        keyStatuses={keyStatuses}
        interactive={isGameActive && !isLoading}
        treasureVariant={treasureVariant}
        onKeyClick={handleKeyClick}
      />

      {/* UI superpuesta — arriba: el pozo */}
      <div className="game-overlay game-overlay-top">
        <VaultCounter amount={vault} isDecreasing={isDecreasing} />
        <AnimatePresence>
          {error && (
            <motion.div
              className="error-banner"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              ⚠️ {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* UI superpuesta — abajo: estado, instrucción y compra */}
      <div className="game-overlay game-overlay-bottom">
      <AnimatePresence mode="wait">
        {lockStatus === 'OPEN' && (
          <motion.p
            key="open-text"
            className="lock-status-text lock-open"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            ✓ ¡ABIERTA!
          </motion.p>
        )}
        {lockStatus === 'SHAKE' && (
          <motion.p
            key="shake-text"
            className="lock-status-text lock-shake"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            ✗ Llave incorrecta
          </motion.p>
        )}
      </AnimatePresence>

      {/* Idle state: jugar / comprar tickets. Con tickets y sin error
          la partida arranca sola, así que no se muestra el botón. */}
      {gameStatus === 'IDLE' && player && tickets > 0 && !error && (
        <motion.div
          className="idle-section"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="idle-cost loading-dots">🔑 Preparando tu partida…</p>
        </motion.div>
      )}
      {gameStatus === 'IDLE' && !(player && tickets > 0 && !error) && (
        <motion.div
          className="idle-section"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <p className="idle-subtitle">
            Elige la llave correcta y gana hasta <strong>$10.00</strong>
          </p>
          {player && (
            <p className="idle-cost">
              🎟️ Tienes <strong>{tickets}</strong> ticket{tickets !== 1 ? 's' : ''} · 1 partida = 1 ticket
            </p>
          )}
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
                  <>🔑 Jugar — 1 ticket</>
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
        </motion.div>
      )}

      {/* Active game: instrucción */}
      {isGameActive && (
        <motion.p
          className="keys-instruction"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          🗝️ Toca una llave para intentar abrir la cerradura
        </motion.p>
      )}
      </div>

      {/* Win / Lose modals */}
      <AnimatePresence>
        {gameStatus === 'COMPLETED_WIN' && (
          <WinModal payout={finalPayout} onPlayAgain={handlePlayAgain} />
        )}
        {gameStatus === 'COMPLETED_LOSE' && (
          <LoseModal onPlayAgain={handlePlayAgain} />
        )}
      </AnimatePresence>

      <BuyTicketsModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </div>
  );
}
