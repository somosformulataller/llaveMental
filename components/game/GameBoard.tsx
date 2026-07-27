'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Lock from './Lock';
import KeyGrid from './KeyGrid';
import VaultCounter from './VaultCounter';
import WinModal from './WinModal';
import LoseModal from './LoseModal';
import { GameStatus, KeyStatus, LockStatus, Player } from '@/types/game';
import { TOTAL_KEYS, INITIAL_VAULT } from '@/lib/game/constants';

interface GameBoardProps {
  player: Player | null;
  onBalanceChange: (newBalance: number) => void;
}

export default function GameBoard({ player, onBalanceChange }: GameBoardProps) {
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
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
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
          setGameStatus('COMPLETED_WIN');
          setFinalPayout(data.payout);
          onBalanceChange(player!.balance + data.payout);
        }, 1200);
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
  const isGameOver = gameStatus === 'COMPLETED_WIN' || gameStatus === 'COMPLETED_LOSE';

  return (
    <div className="game-board">
      {/* Vault Counter */}
      <VaultCounter amount={vault} isDecreasing={isDecreasing} />

      {/* Lock */}
      <div className="lock-section">
        <Lock status={lockStatus} />
      </div>

      {/* Error message */}
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
          {player ? (
            <motion.button
              className="btn-buy"
              onClick={handleBuyTicket}
              disabled={isLoading || (player?.balance ?? 0) < 2}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isLoading ? (
                <span className="loading-dots">Cargando...</span>
              ) : (
                <>🎟️ Comprar Ticket — $2.00</>
              )}
            </motion.button>
          ) : (
            <a href="/auth/login" className="btn-buy">
              🔐 Iniciar sesión para jugar
            </a>
          )}
        </motion.div>
      )}

      {/* Active game: Key Grid */}
      {isGameActive && (
        <motion.div
          className="active-game-section"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="keys-instruction">
            🗝️ Elige una llave para intentar abrir la cerradura
          </p>
          <KeyGrid
            keyStatuses={keyStatuses}
            onKeyClick={handleKeyClick}
            disabled={isLoading || isGameOver}
          />
        </motion.div>
      )}

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
