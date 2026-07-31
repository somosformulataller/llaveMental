'use client';

import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { KeyStatus } from '@/types/game';
import { TOTAL_KEYS } from '@/lib/game/constants';
import Key3D from './Key3D';

interface KeyRingProps {
  keyStatuses: KeyStatus[];
  interactive: boolean;
  /** true cuando la puerta está abierta: las llaves se desvanecen */
  dimmed: boolean;
  /** Premios de motivación por llave (null = sin revelación) */
  revealValues?: (number | null)[] | null;
  onKeyClick: (id: number) => void;
}

const CAMERA_Z = 6.2;
const COLS = 5;
const ROWS = Math.ceil(TOTAL_KEYS / COLS);
// Anfiteatro: la fila 0 (trasera) más alta y lejos; cada fila siguiente
// baja y se acerca a la cámara para que ninguna tape a la de atrás.
const ROW_TOP_Y = 1.58;
const ROW_STEP_Y = 0.36;
const ROW_BACK_Z = 1.3;
const ROW_STEP_Z = 0.24;
const FRONT_ROW_Z = ROW_BACK_Z + (ROWS - 1) * ROW_STEP_Z;
// Margen horizontal: ancho de la llave + vaivén del parallax de cámara
const EDGE_MARGIN = 0.6;

// Las llaves flotando en filas frente a la puerta. El ancho y el
// tamaño se calculan con el ancho VISIBLE a la profundidad de las
// llaves (no en el origen): así todas entran siempre en pantalla,
// incluso en móviles angostos.
export default function KeyRing({ keyStatuses, interactive, dimmed, revealValues, onKeyClick }: KeyRingProps) {
  const { viewport } = useThree();

  const { bases, size } = useMemo(() => {
    // viewport.width es el ancho visible en z=0; a la profundidad de la
    // fila delantera (más cerca de la cámara) el ancho visible es menor.
    const widthAtFront = viewport.width * ((CAMERA_Z - FRONT_ROW_Z) / CAMERA_Z);
    const usable = Math.max(0.9, widthAtFront - EDGE_MARGIN);
    const spacing = THREE.MathUtils.clamp(usable / (COLS - 1), 0.24, 0.68);
    // Con 4 filas las llaves son algo más chicas que con 2 para que la
    // pila completa quepa sin taparse.
    const keySize = THREE.MathUtils.clamp(spacing / 0.78, 0.42, 0.8);

    const out: [number, number, number][] = [];
    for (let i = 0; i < TOTAL_KEYS; i++) {
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      out.push([
        (col - (COLS - 1) / 2) * spacing + (row % 2 === 1 ? spacing * 0.12 : 0),
        ROW_TOP_Y - row * ROW_STEP_Y,
        ROW_BACK_Z + row * ROW_STEP_Z,
      ]);
    }
    return { bases: out, size: keySize };
  }, [viewport.width]);

  return (
    <group>
      {keyStatuses.map((status, i) => {
        const reveal = revealValues?.[i] ?? null;
        return (
          <Key3D
            key={i}
            id={i}
            status={status}
            base={bases[i]}
            size={size}
            // Durante la revelación, las llaves con etiqueta se quedan
            // visibles; al limpiar revealValues se desvanecen normal.
            hidden={dimmed && status !== 'CORRECT' && !(reveal != null && status === 'IDLE')}
            reveal={reveal}
            interactive={interactive}
            onKeyClick={onKeyClick}
          />
        );
      })}
    </group>
  );
}
