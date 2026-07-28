'use client';

import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { KeyStatus } from '@/types/game';
import Key3D from './Key3D';

interface KeyRingProps {
  keyStatuses: KeyStatus[];
  interactive: boolean;
  onKeyClick: (id: number) => void;
}

// Las 10 llaves flotando en dos filas frente a la puerta.
// El ancho de las filas se adapta al viewport (móvil vs escritorio).
export default function KeyRing({ keyStatuses, interactive, onKeyClick }: KeyRingProps) {
  const { viewport } = useThree();

  const bases = useMemo(() => {
    const spread = Math.min(2.9, Math.max(1.9, viewport.width * 0.42));
    const spacing = spread / 4;
    const out: [number, number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const row = Math.floor(i / 5); // 0 = fila trasera, 1 = fila delantera
      const col = i % 5;
      out.push([
        (col - 2) * spacing + (row === 1 ? spacing * 0.12 : 0),
        row === 0 ? 1.12 : 0.52,
        row === 0 ? 1.45 : 1.95,
      ]);
    }
    return out;
  }, [viewport.width]);

  return (
    <group>
      {keyStatuses.map((status, i) => (
        <Key3D
          key={i}
          id={i}
          status={status}
          base={bases[i]}
          interactive={interactive}
          onKeyClick={onKeyClick}
        />
      ))}
    </group>
  );
}
