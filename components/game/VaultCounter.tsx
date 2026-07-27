'use client';

import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface VaultCounterProps {
  amount: number;
  isDecreasing?: boolean;
}

export default function VaultCounter({ amount, isDecreasing = false }: VaultCounterProps) {
  const springVal = useSpring(amount, { stiffness: 100, damping: 30 });
  const displayed = useTransform(springVal, (v) => `$${v.toFixed(2)}`);

  useEffect(() => {
    springVal.set(amount);
  }, [amount, springVal]);

  return (
    <div className="vault-counter-container">
      <p className="vault-label">💰 POZO ACTUAL</p>
      <motion.div
        className="vault-amount-wrapper"
        animate={
          isDecreasing
            ? {
                color: ['#F5C518', '#FF4757', '#F5C518'],
                scale: [1, 1.1, 1],
              }
            : {}
        }
        transition={{ duration: 0.6 }}
      >
        <motion.span className="vault-amount">{displayed}</motion.span>
      </motion.div>
      {isDecreasing && (
        <motion.div
          className="vault-delta"
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 1, 1, 0], y: [0, -10, -20, -30] }}
          transition={{ duration: 1 }}
        >
          -$2.00
        </motion.div>
      )}
    </div>
  );
}
