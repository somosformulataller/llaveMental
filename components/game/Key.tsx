'use client';

import { motion } from 'framer-motion';
import { KeyStatus } from '@/types/game';

interface KeyProps {
  id: number;
  status: KeyStatus;
  onClick: (id: number) => void;
  disabled: boolean;
}

const KEY_COLORS = [
  '#F5C518', '#E8A020', '#FFD700', '#C9A227', '#F0B429',
  '#DFA820', '#FFCC00', '#E5B400', '#F7C94B', '#D4A017',
];

export default function Key({ id, status, onClick, disabled }: KeyProps) {
  const color = KEY_COLORS[id % KEY_COLORS.length];
  const isIdle = status === 'IDLE';
  const isBroken = status === 'BROKEN';
  const isCorrect = status === 'CORRECT';
  const isDisabled = disabled || status !== 'IDLE';

  return (
    <motion.button
      className={`key-btn key-${status.toLowerCase()}`}
      onClick={() => !isDisabled && onClick(id)}
      disabled={isDisabled}
      whileHover={isIdle ? { scale: 1.15, y: -4 } : {}}
      whileTap={isIdle ? { scale: 0.95 } : {}}
      animate={{
        opacity: isBroken ? 0.35 : isDisabled && !isCorrect ? 0.5 : 1,
        rotate: isBroken ? [0, -15, 15, -10, 10, -5, 0] : 0,
        y: isBroken ? [0, -20, 30] : 0,
      }}
      transition={{ duration: isBroken ? 0.6 : 0.2 }}
      title={`Llave #${id + 1}`}
    >
      <svg
        width="44"
        height="80"
        viewBox="0 0 44 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Key bow (circle top) */}
        <circle
          cx="22"
          cy="18"
          r="14"
          fill={isCorrect ? '#00FF87' : isBroken ? '#555' : color}
          stroke={isCorrect ? '#00CC6A' : isBroken ? '#333' : '#a07800'}
          strokeWidth="2"
          opacity={isBroken ? 0.5 : 1}
        />
        {/* Keyhole in bow */}
        <circle cx="22" cy="18" r="5" fill={isCorrect ? '#00CC6A' : '#0d0f1a'} />

        {/* Key blade (shaft) */}
        <rect
          x="19"
          y="30"
          width="6"
          height="40"
          rx="3"
          fill={isCorrect ? '#00FF87' : isBroken ? '#444' : color}
          opacity={isBroken ? 0.5 : 1}
        />
        {/* Teeth */}
        <rect x="25" y="52" width="8" height="5" rx="1" fill={isCorrect ? '#00FF87' : isBroken ? '#444' : color} opacity={isBroken ? 0.5 : 1} />
        <rect x="25" y="62" width="6" height="4" rx="1" fill={isCorrect ? '#00FF87' : isBroken ? '#444' : color} opacity={isBroken ? 0.5 : 1} />

        {/* Broken crack */}
        {isBroken && (
          <path
            d="M 19 50 L 25 46 L 19 42"
            stroke="#FF4757"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className="key-label">#{id + 1}</span>
    </motion.button>
  );
}
