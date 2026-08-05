'use client';

import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

// El SALDO en grande en el centro de la escena (donde antes estaba el
// "premio actual"): un contador que va sumando centavo a centavo cada
// vez que una llave suelta monedas, con destello verde al subir.
export default function BalanceCounter({ amount }: { amount: number }) {
  const spring = useSpring(amount, { stiffness: 42, damping: 16 });
  const display = useTransform(spring, (v) => `$${Math.max(0, v).toFixed(2)}`);
  const [rising, setRising] = useState(false);
  const prev = useRef(amount);

  useEffect(() => {
    if (amount !== prev.current) {
      const up = amount > prev.current;
      prev.current = amount;
      spring.set(amount);
      if (up) {
        setRising(true);
        const t = setTimeout(() => setRising(false), 1300);
        return () => clearTimeout(t);
      }
    }
  }, [amount, spring]);

  return (
    <div className="vault-counter-container">
      <p className="vault-label">💰 TU SALDO</p>
      <motion.div
        className="vault-amount-wrapper"
        animate={rising ? { scale: 1.14 } : { scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <motion.span className={`vault-amount${rising ? ' balance-rising' : ''}`}>
          {display}
        </motion.span>
      </motion.div>
    </div>
  );
}
