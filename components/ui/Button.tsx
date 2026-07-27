'use client';

import { motion } from 'framer-motion';
import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

export default function Button({
  children,
  variant = 'primary',
  isLoading = false,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <motion.button
      className={`btn btn-${variant} ${className}`}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      {...(props as any)}
    >
      {isLoading ? (
        <span className="btn-spinner" />
      ) : children}
    </motion.button>
  );
}
