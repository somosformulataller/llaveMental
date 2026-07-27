'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface WinModalProps {
  payout: number;
  onPlayAgain: () => void;
}

export default function WinModal({ payout, onPlayAgain }: WinModalProps) {
  const isJackpot = payout >= 10;
  const isBreakEven = payout === 2;

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Confetti particles */}
      {[...Array(30)].map((_, i) => (
        <motion.div
          key={i}
          className="confetti-particle"
          style={{
            left: `${Math.random() * 100}%`,
            background: `hsl(${Math.random() * 60 + 30}, 100%, 60%)`,
            width: `${Math.random() * 8 + 4}px`,
            height: `${Math.random() * 8 + 4}px`,
          }}
          initial={{ top: '-10px', opacity: 1, rotate: 0 }}
          animate={{
            top: '110%',
            opacity: [1, 1, 0],
            rotate: Math.random() * 720 - 360,
          }}
          transition={{
            duration: Math.random() * 2 + 1.5,
            delay: Math.random() * 0.5,
            ease: 'easeIn',
          }}
        />
      ))}

      <motion.div
        className="modal-card win-card"
        initial={{ scale: 0.7, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <motion.div
          className="modal-icon"
          animate={{ rotate: [0, -10, 10, -5, 5, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          {isJackpot ? '🏆' : isBreakEven ? '🔄' : '🔓'}
        </motion.div>

        <h2 className="modal-title win-title">
          {isJackpot ? '¡JACKPOT!' : isBreakEven ? '¡Empate!' : '¡Ganaste!'}
        </h2>

        <p className="modal-subtitle">
          {isJackpot
            ? '¡Encontraste la llave perfecta desde el primer intento!'
            : isBreakEven
            ? 'Recuperaste tu inversión'
            : '¡La llave correcta estaba ahí!'}
        </p>

        <motion.div
          className="modal-payout"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 400 }}
        >
          <span className="payout-label">PREMIO</span>
          <span className="payout-amount">${payout.toFixed(2)}</span>
        </motion.div>

        <button className="btn-primary" onClick={onPlayAgain}>
          🗝️ Jugar de nuevo
        </button>
      </motion.div>
    </motion.div>
  );
}
