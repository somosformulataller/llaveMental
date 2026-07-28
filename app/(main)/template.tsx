'use client';

import { motion } from 'framer-motion';

// Se re-monta en cada navegación: da la transición animada entre
// pantallas sin pantallas de carga (el contenido ya está renderizado).
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="page-transition"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
