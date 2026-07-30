'use client';

import { motion } from 'framer-motion';

interface LoseModalProps {
  onPlayAgain: () => void;
}

export default function LoseModal({ onPlayAgain }: LoseModalProps) {
  return (
    <motion.div
      className="modal-overlay lose-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal-card lose-card"
        initial={{ scale: 0.7, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <motion.div
          className="modal-icon"
          animate={{ rotate: [0, -20, 20, -10, 0] }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          🔒
        </motion.div>

        <h2 className="modal-title lose-title">Ninguna llave funcionó</h2>
        <p className="modal-subtitle">
          El premio se agotó. ¡Suerte la próxima vez!
        </p>

        <div className="modal-payout">
          <span className="payout-label">PREMIO</span>
          <span className="payout-amount lose-amount">$0.00</span>
        </div>

        <button className="btn-primary" onClick={onPlayAgain}>
          🔄 Intentar de nuevo
        </button>
      </motion.div>
    </motion.div>
  );
}
