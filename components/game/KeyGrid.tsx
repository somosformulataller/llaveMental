'use client';

import { motion } from 'framer-motion';
import Key from './Key';
import { KeyStatus } from '@/types/game';

interface KeyGridProps {
  keyStatuses: KeyStatus[];
  onKeyClick: (id: number) => void;
  disabled: boolean;
}

export default function KeyGrid({ keyStatuses, onKeyClick, disabled }: KeyGridProps) {
  return (
    <motion.div
      className="key-grid"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, staggerChildren: 0.05 }}
    >
      {keyStatuses.map((status, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.05, duration: 0.3 }}
        >
          <Key
            id={idx}
            status={status}
            onClick={onKeyClick}
            disabled={disabled}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
