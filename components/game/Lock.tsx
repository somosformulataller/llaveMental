'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { LockStatus } from '@/types/game';

interface LockProps {
  status: LockStatus;
}

const shakeVariants = {
  idle: { x: 0, rotate: 0 },
  shake: {
    x: [0, -10, 10, -10, 10, -6, 6, 0],
    rotate: [0, -3, 3, -3, 3, 0],
    transition: { duration: 0.5 },
  },
  open: { rotate: 0, x: 0 },
};

export default function Lock({ status }: LockProps) {
  const isOpen = status === 'OPEN';
  const isShaking = status === 'SHAKE';

  return (
    <div className="lock-container">
      <motion.div
        className="lock-wrapper"
        variants={shakeVariants}
        animate={isShaking ? 'shake' : isOpen ? 'open' : 'idle'}
      >
        <svg
          width="180"
          height="220"
          viewBox="0 0 180 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="lock-svg"
        >
          {/* Lock Body */}
          <rect
            x="10"
            y="90"
            width="160"
            height="120"
            rx="20"
            fill={isOpen ? '#0a2a1a' : '#1a1d2e'}
            stroke={isOpen ? '#00FF87' : '#F5C518'}
            strokeWidth="3"
            className="lock-body"
          />

          {/* Lock Shackle */}
          <motion.path
            d="M 55 90 L 55 50 Q 55 15 90 15 Q 125 15 125 50 L 125 90"
            stroke={isOpen ? '#00FF87' : '#F5C518'}
            strokeWidth="14"
            strokeLinecap="round"
            fill="none"
            animate={isOpen ? { d: 'M 55 90 L 55 30 Q 55 -5 90 -5 Q 125 -5 125 30 L 125 90', opacity: 0.5 } : {}}
            transition={{ duration: 0.4 }}
          />

          {/* Keyhole background */}
          <circle cx="90" cy="148" r="24" fill={isOpen ? '#001a0d' : '#0d0f1a'} />

          {/* Keyhole */}
          <circle
            cx="90"
            cy="142"
            r="12"
            fill={isOpen ? '#00FF87' : '#F5C518'}
            opacity={isOpen ? 1 : 0.8}
          />
          <rect
            x="84"
            y="148"
            width="12"
            height="20"
            rx="3"
            fill={isOpen ? '#00FF87' : '#F5C518'}
            opacity={isOpen ? 1 : 0.8}
          />

          {/* Open glow */}
          {isOpen && (
            <>
              <circle cx="90" cy="148" r="40" fill="#00FF87" opacity="0.08" />
              <circle cx="90" cy="148" r="60" fill="#00FF87" opacity="0.04" />
            </>
          )}
        </svg>

        {/* Glow effect */}
        <motion.div
          className="lock-glow"
          animate={{
            opacity: isOpen ? 1 : isShaking ? 0.6 : 0,
            scale: isOpen ? 1 : 0.8,
          }}
          style={{
            background: isOpen
              ? 'radial-gradient(circle, rgba(0,255,135,0.3) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(255,71,87,0.3) 0%, transparent 70%)',
          }}
          transition={{ duration: 0.5 }}
        />
      </motion.div>

      {/* Status text */}
      <AnimatePresence mode="wait">
        {isOpen && (
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
        {isShaking && (
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
    </div>
  );
}
