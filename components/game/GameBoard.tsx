'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import GameScene from './GameScene';
import BalanceCounter from './BalanceCounter';
import BuyTicketsModal from '@/components/payments/BuyTicketsModal';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { setCoinKeys } from '@/lib/game/coinKeysStore';
import { GameStatus, KeyStatus, LockStatus } from '@/types/game';
import { TOTAL_KEYS } from '@/lib/game/constants';

// Premios de motivación tras las llaves NO volteadas, revelados al
// terminar. Solo visuales y siempre POR DEBAJO del premio real de la
// partida (creíbles: el jugador "eligió la mejor llave"). Deterministas
// por sesión para que un re-render no cambie los montos.
function computeReveals(
  statuses: KeyStatus[],
  winningKey: number,
  payout: number,
  seed: string
): (number | null)[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const rand = () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return h / 0x7fffffff;
  };
  const max = payout - 0.05;
  return statuses.map((s, i) => {
    if (s !== 'IDLE' || i === winningKey || max < 0.05) return null;
    const frac = Math.pow(rand(), 1.35); // sesgo hacia montos bajos
    const raw = 0.05 + frac * (max - 0.05);
    // Pasos de $0.05, nunca por debajo de $0.05 ni alcanzando el premio
    return Math.min(max, Math.max(0.05, Math.round(raw * 20) / 20));
  });
}

export default function GameBoard() {
  const { player, isLoading: playerLoading, updateBalance, updatePlayer, refresh } = usePlayer();

  // Game state
  const [gameStatus, setGameStatus] = useState<GameStatus>('IDLE');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [keyStatuses, setKeyStatuses] = useState<KeyStatus[]>(
    Array(TOTAL_KEYS).fill('IDLE')
  );
  const [lockStatus, setLockStatus] = useState<LockStatus>('IDLE');
  // Aviso flotante (no bloqueante) con el premio ganado
  const [winBanner, setWinBanner] = useState<number | null>(null);
  // Mensaje "¡Fantástico!" sobre el tesoro mientras se ve la sala
  const [treasurePrize, setTreasurePrize] = useState<number | null>(null);
  // Monedas ocultas: adelanto del premio soltado por un fallo
  const [bonusFlash, setBonusFlash] = useState<number | null>(null);
  // Salto de monedas doradas (se re-monta por id en cada estallido)
  const [coinBurst, setCoinBurst] = useState<number | null>(null);
  const burstSeq = useRef(0);
  // Total de monedas ocultas cobradas en la partida en curso
  const bonusPaidRef = useRef(0);
  // true si el premio del tesoro se reunió con monedas ocultas
  const [treasureCoins, setTreasureCoins] = useState(false);
  // Revelación final: qué "escondían" las llaves no volteadas
  const [revealMap, setRevealMap] = useState<(number | null)[] | null>(null);
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

  // Restaura una partida con su estado real: llaves probadas y cuántas
  // llaves con monedas ocultas le quedan (contador del header)
  const resumeSession = useCallback((id: string, keysTried: number[], coinKeys?: number) => {
    bonusPaidRef.current = 0;
    setSessionId(id);
    setGameStatus('ACTIVE');
    setLockStatus('IDLE');
    setCoinKeys(typeof coinKeys === 'number' ? coinKeys : null);
    setKeyStatuses(() => {
      const next: KeyStatus[] = Array(TOTAL_KEYS).fill('IDLE');
      for (const k of keysTried) {
        if (k >= 0 && k < TOTAL_KEYS) next[k] = 'BROKEN';
      }
      return next;
    });
  }, []);

  // Al salir de la pantalla de juego el contador del header vuelve a
  // mostrar el saldo (la partida sigue guardada en el servidor).
  useEffect(() => () => setCoinKeys(null), []);

  // Al entrar al juego: si hay una partida activa, se reanuda sola.
  // El jugador puede salir de la app y volver cuando quiera.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.session) return;
        resumeSession(data.session.session_id, data.session.keys_tried, data.session.coin_keys);
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
          resumeSession(data.session_id, data.keys_tried ?? [], data.coin_keys);
          return;
        }
        if (data.code === 'NO_TICKETS') {
          setBuyOpen(true);
          return;
        }
        setError(data.error || 'Error al iniciar la partida');
        return;
      }

      bonusPaidRef.current = 0;
      setSessionId(data.session_id);
      setGameStatus('ACTIVE');
      setKeyStatuses(Array(TOTAL_KEYS).fill('IDLE'));
      setLockStatus('IDLE');
      setCoinKeys(typeof data.coin_keys === 'number' ? data.coin_keys : null);
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
          setKeyStatuses(Array(TOTAL_KEYS).fill('IDLE'));
          setLockStatus('IDLE');
          setCoinKeys(null);
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
        // Con monedas la cerradura destella VERDE (no fue un error);
        // sin monedas, el rojo clásico de llave incorrecta.
        setLockStatus(data.bonus ? 'COINS' : 'SHAKE');
        // La llave con monedas encontrada se descuenta del contador
        if (typeof data.coin_keys === 'number') setCoinKeys(data.coin_keys);

        setTimeout(() => {
          setLockStatus('IDLE');
        }, 800);

        // Monedas ocultas: este fallo soltó un adelanto del premio.
        // Se suma al saldo YA (el servidor ya lo acreditó) con un
        // tintineo, un aviso dorado y monedas saltando hacia el saldo.
        if (data.bonus) {
          playTone(1046, 0.12, 'sine', 0.35);
          setTimeout(() => playTone(1568, 0.18, 'sine', 0.3), 110);
          bonusPaidRef.current += data.bonus;
          setBonusFlash(data.bonus);
          burstSeq.current += 1;
          setCoinBurst(burstSeq.current);
          if (player) updateBalance(player.balance + data.bonus);
          setTimeout(() => setBonusFlash(null), 2600);
          setTimeout(() => setCoinBurst(null), 1700);
        }

        // Con la tabla de consolación la puerta siempre abre, así que
        // esto solo puede llegar de una sesión vieja: reiniciar solo,
        // sin modal de derrota.
        if (data.game_over || data.vault <= 0) {
          setTimeout(() => handlePlayAgain(), 1200);
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
        // La llave que abre era la última con monedas: contador a 0
        setCoinKeys(0);

        // Revelar qué "escondían" las llaves no volteadas (montos
        // siempre menores al premio real). La cámara espera mientras
        // se leen y luego avanza al tesoro. En partidas que usaron
        // todas las llaves no hay nada que revelar y el ritmo es el
        // de siempre.
        const reveals = computeReveals(keyStatuses, keyId, data.payout, sessionId ?? '');
        const hasReveal = reveals.some((v) => v !== null);
        const shift = hasReveal ? 2600 : 0;
        if (hasReveal) {
          setRevealMap(reveals);
          setTimeout(() => setRevealMap(null), 3400);
        }

        // Secuencia cinemática: la llave gira (~1s), la puerta se abre
        // y la cámara avanza al tesoro. Sobre el tesoro aparece el
        // "¡Fantástico!" con el premio; luego el aviso de que ya está
        // en el saldo (y el contador del header suma en ese momento).
        // La escena se reinicia sola para seguir jugando.
        setTreasureCoins(bonusPaidRef.current > 0);
        setTimeout(() => setTreasurePrize(data.payout), 1800 + shift);
        setTimeout(() => {
          setTreasurePrize(null);
          setWinBanner(data.payout);
          // Sumar solo lo acreditado al abrir: los adelantos ya se
          // sumaron al saldo cuando salieron las monedas.
          if (player) updateBalance(player.balance + (data.credited ?? data.payout));
          burstSeq.current += 1;
          setCoinBurst(burstSeq.current);
          setTimeout(() => setCoinBurst(null), 1700);
        }, 5200 + shift);
        setTimeout(() => handlePlayAgain(), 7000 + shift);
        setTimeout(() => setWinBanner(null), 11_000 + shift);
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
    bonusPaidRef.current = 0;
    setGameStatus('IDLE');
    setSessionId(null);
    setCoinKeys(null);
    setKeyStatuses(Array(TOTAL_KEYS).fill('IDLE'));
    setLockStatus('IDLE');
    setTreasurePrize(null);
    setTreasureCoins(false);
    setRevealMap(null);
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
        // Con la puerta abierta no se puede seguir tocando llaves
        // (durante la revelación siguen visibles unos segundos)
        interactive={isGameActive && !isLoading && lockStatus !== 'OPEN'}
        treasureVariant={treasureVariant}
        revealValues={revealMap}
        onKeyClick={handleKeyClick}
      />

      {/* Monedas doradas saltando hacia el saldo (bonus o premio) */}
      <AnimatePresence>
        {coinBurst !== null && (
          <div className="coin-burst" key={coinBurst} aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => (
              <motion.span
                key={i}
                className="coin-burst-coin"
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.5, rotate: 0 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  x: (i - 4) * 34 + ((i * 37) % 13) - 6,
                  y: [0, -150 - ((i * 53) % 70), -80 - ((i * 29) % 50)],
                  scale: [0.5, 1.2, 1, 0.6],
                  rotate: (i % 2 === 0 ? 1 : -1) * (140 + i * 25),
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.25, delay: i * 0.055, ease: 'easeOut' }}
              >
                🪙
              </motion.span>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Mensaje sobre el tesoro al abrirse la puerta */}
      <AnimatePresence>
        {treasurePrize !== null && (
          <motion.div
            className="treasure-msg"
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <p className="treasure-msg-title">✨ ¡Fantástico! ✨</p>
            <p className="treasure-msg-sub">
              {treasureCoins ? (
                <>
                  🪙 Con todas tus monedas ocultas has reunido{' '}
                  <strong>${treasurePrize.toFixed(2)}</strong> en total
                </>
              ) : (
                <>
                  Has ganado un premio de <strong>${treasurePrize.toFixed(2)}</strong>
                </>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* UI superpuesta — arriba: el SALDO en grande, sumando en vivo */}
      <div className="game-overlay game-overlay-top">
        {player && <BalanceCounter amount={player.balance} />}
        <AnimatePresence>
          {winBanner !== null && (
            <motion.div
              className="win-banner"
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              🏆 ¡Ganaste <strong>${winBanner.toFixed(2)}</strong>! Ya está en tu saldo
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {bonusFlash !== null && (
            <motion.div
              className="win-banner bonus-banner"
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              🪙 ¡Monedas ocultas! <strong>+${bonusFlash.toFixed(2)}</strong> a tu saldo
            </motion.div>
          )}
        </AnimatePresence>
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
        {lockStatus === 'COINS' && (
          <motion.p
            key="coins-text"
            className="lock-status-text lock-coins"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            🪙 ¡Esta llave escondía monedas!
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

      {/* Sin modales de resultado: la puerta siempre abre con algo
          (mínimo $0.50) y la escena se reinicia sola para seguir. */}
      <BuyTicketsModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </div>
  );
}
