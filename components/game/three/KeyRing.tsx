'use client';

import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { KeyStatus } from '@/types/game';
import Key3D from './Key3D';

interface KeyRingProps {
  keyStatuses: KeyStatus[];
  interactive: boolean;
  /** true cuando la puerta está abierta: las llaves se desvanecen */
  dimmed: boolean;
  onKeyClick: (id: number) => void;
}

const CAMERA_Z = 6.2;
const FRONT_ROW_Z = 1.95;
const BACK_ROW_Z = 1.45;
// Margen horizontal: ancho de la llave + vaivén del parallax de cámara
const EDGE_MARGIN = 0.6;

// Las 10 llaves flotando en dos filas frente a la puerta. El ancho y
// el tamaño se calculan con el ancho VISIBLE a la profundidad de las
// llaves (no en el origen): así todas entran siempre en pantalla,
// incluso en móviles angostos.
export default function KeyRing({ keyStatuses, interactive, dimmed, onKeyClick }: KeyRingProps) {
  const { viewport } = useThree();

  const { bases, size } = useMemo(() => {
    // viewport.width es el ancho visible en z=0; a la profundidad de la
    // fila delantera (más cerca de la cámara) el ancho visible es menor.
    const widthAtFront = viewport.width * ((CAMERA_Z - FRONT_ROW_Z) / CAMERA_Z);
    const usable = Math.max(0.9, widthAtFront - EDGE_MARGIN);
    const spacing = THREE.MathUtils.clamp(usable / 4, 0.24, 0.68);
    const keySize = THREE.MathUtils.clamp(spacing / 0.62, 0.5, 1);

    const out: [number, number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const row = Math.floor(i / 5); // 0 = fila trasera, 1 = fila delantera
      const col = i % 5;
      out.push([
        (col - 2) * spacing + (row === 1 ? spacing * 0.12 : 0),
        row === 0 ? 1.12 : 0.52,
        row === 0 ? BACK_ROW_Z : FRONT_ROW_Z,
      ]);
    }
    return { bases: out, size: keySize };
  }, [viewport.width]);

  return (
    <group>
      {keyStatuses.map((status, i) => (
        <Key3D
          key={i}
          id={i}
          status={status}
          base={bases[i]}
          size={size}
          hidden={dimmed && status !== 'CORRECT'}
          interactive={interactive}
          onKeyClick={onKeyClick}
        />
      ))}
    </group>
  );
}
