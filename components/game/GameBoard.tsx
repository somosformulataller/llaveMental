'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import GameScene from './GameScene';
import VaultCounter from './VaultCounter';
import WinModal from './WinModal';
import LoseModal from './LoseModal';
import { GameStatus, KeyStatus, LockStatus, Player } from '@/types/game';
import { TOTAL_KEYS, INITIAL_VAULT } from '@/lib/game/constants';

interface GameBoardProps {
  player: Player | null;
  playerLoading?: boolean;
  onBalanceChange: (newBalance: number) => void;
}

export default function GameBoard({ player, playerLoading = false, onBalanceChange }: GameBoardProps) {
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

  // Start a new game
  const handleBuyTicket = async () => {
    if (!player) {
      setError('Debes iniciar sesión para jugar');
      return;
    }
    if (player.balance < 2) {
      setError('Saldo insuficiente. Necesitas al menos $2.00');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/buy-ticket', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.session_id) {
          // Resume existing session
          setSessionId(data.session_id);
          setVault(data.vault ?? INITIAL_VAULT);
          setGameStatus('ACTIVE');
          setKeyStatuses(Array(TOTAL_KEYS).fill('IDLE'));
          setLockStatus('IDLE');
          return;
        }
        setError(data.error || 'Error al comprar ticket');
        return;
      }

      setSessionId(data.session_id);
      setVault(data.vault);
      setGameStatus('ACTIVE');
      setKeyStatuses(Array(TOTAL_KEYS).fill('IDLE'));
      setLockStatus('IDLE');
      onBalanceChange(player.balance - 2);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

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

        // Check if vault is empty (game over)
        if (data.vault <= 0) {
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
          onBalanceChange(player!.balance + data.payout);
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
  };

  const isGameActive = gameStatus === 'ACTIVE';

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

      {/* Idle state: Buy ticket button */}
      {gameStatus === 'IDLE' && (
        <motion.div
          className="idle-section"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <p className="idle-subtitle">
            Elige la llave correcta y gana hasta <strong>$10.00</strong>
          </p>
          <p className="idle-cost">Costo del ticket: <strong>$2.00</strong></p>
          {player || playerLoading ? (
            <motion.button
              className="btn-buy"
              onClick={handleBuyTicket}
              disabled={isLoading || playerLoading || (player?.balance ?? 0) < 2}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isLoading || playerLoading ? (
                <span className="loading-dots">Cargando...</span>
              ) : (
                <>🎟️ Comprar Ticket — $2.00</>
              )}
            </motion.button>
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
    </div>
  );
}
