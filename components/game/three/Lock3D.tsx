'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LockStatus } from '@/types/game';
import { LOCK_LOCAL_POS } from './constants';

interface Lock3DProps {
  status: LockStatus;
}

const RED_FLASH = new THREE.Color('#ff2e3f');
const GOLD_GLOW = new THREE.Color('#ffb84d');

// Cerradura DORADA ornamentada (diseño de referencia): placa con
// moldura, ornamentos en las esquinas y un gran ojo oscuro. Montada
// en posición local dentro del grupo de la puerta, para girar con
// ella al abrirse. SHAKE → vibra y destella rojo. OPEN → brilla.
export default function Lock3D({ status }: Lock3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Un material para el cuerpo y otro para las molduras: compartidos
  // entre las piezas para que toda la cerradura destelle junta.
  const goldMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#c8942f',
        metalness: 0.92,
        roughness: 0.3,
      }),
    []
  );
  const trimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#e6bd57',
        metalness: 0.95,
        roughness: 0.25,
      }),
    []
  );

  useFrame((state, delta) => {
    const g = groupRef.current;
    const glow = glowMatRef.current;
    if (!g || !glow) return;
    const t = state.clock.elapsedTime;
    const mats = [goldMat, trimMat];

    if (status === 'SHAKE') {
      g.position.x = LOCK_LOCAL_POS[0] + Math.sin(t * 55) * 0.035;
      g.position.y = LOCK_LOCAL_POS[1] + Math.sin(t * 47) * 0.02;
      for (const m of mats) {
        m.emissive.copy(RED_FLASH);
        m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 0.55, 10, delta);
      }
      glow.opacity = THREE.MathUtils.damp(glow.opacity, 0, 8, delta);
    } else if (status === 'OPEN') {
      g.position.x = THREE.MathUtils.damp(g.position.x, LOCK_LOCAL_POS[0], 12, delta);
      g.position.y = THREE.MathUtils.damp(g.position.y, LOCK_LOCAL_POS[1], 12, delta);
      for (const m of mats) {
        m.emissive.copy(GOLD_GLOW);
        m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 0.35, 6, delta);
      }
      glow.opacity = THREE.MathUtils.damp(glow.opacity, 0.95, 6, delta);
    } else {
      g.position.x = THREE.MathUtils.damp(g.position.x, LOCK_LOCAL_POS[0], 12, delta);
      g.position.y = THREE.MathUtils.damp(g.position.y, LOCK_LOCAL_POS[1], 12, delta);
      for (const m of mats) {
        m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 0, 8, delta);
      }
      glow.opacity = THREE.MathUtils.damp(glow.opacity, 0, 8, delta);
    }
  });

  return (
    <group ref={groupRef} position={LOCK_LOCAL_POS}>
      {/* Placa principal dorada */}
      <mesh material={goldMat}>
        <boxGeometry args={[0.62, 0.84, 0.05]} />
      </mesh>
      {/* Moldura del borde (marco claro que atrapa la luz) */}
      <mesh material={trimMat} position={[0, 0.395, 0.03]}>
        <boxGeometry args={[0.62, 0.05, 0.03]} />
      </mesh>
      <mesh material={trimMat} position={[0, -0.395, 0.03]}>
        <boxGeometry args={[0.62, 0.05, 0.03]} />
      </mesh>
      <mesh material={trimMat} position={[-0.285, 0, 0.03]}>
        <boxGeometry args={[0.05, 0.84, 0.03]} />
      </mesh>
      <mesh material={trimMat} position={[0.285, 0, 0.03]}>
        <boxGeometry args={[0.05, 0.84, 0.03]} />
      </mesh>
      {/* Ornamentos de filigrana (esquinas y costados) */}
      {(
        [
          [-0.19, 0.3],
          [0.19, 0.3],
          [-0.19, -0.3],
          [0.19, -0.3],
        ] as const
      ).map(([x, y], i) => (
        <mesh key={i} material={trimMat} position={[x, y, 0.035]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.05, 0.016, 8, 18]} />
        </mesh>
      ))}
      <mesh material={trimMat} position={[-0.21, 0, 0.035]}>
        <torusGeometry args={[0.035, 0.014, 8, 16]} />
      </mesh>
      <mesh material={trimMat} position={[0.21, 0, 0.035]}>
        <torusGeometry args={[0.035, 0.014, 8, 16]} />
      </mesh>
      {/* Resplandor dorado detrás del ojo (visible al abrir) */}
      <mesh position={[0, 0, 0.028]}>
        <circleGeometry args={[0.2, 24]} />
        <meshBasicMaterial ref={glowMatRef} color="#ffcf6e" transparent opacity={0} />
      </mesh>
      {/* Gran ojo de la cerradura: círculo + ranura */}
      <mesh position={[0, 0.05, 0.034]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.03, 20]} />
        <meshStandardMaterial color="#060606" roughness={1} />
      </mesh>
      <mesh position={[0, -0.11, 0.034]}>
        <boxGeometry args={[0.09, 0.26, 0.03]} />
        <meshStandardMaterial color="#060606" roughness={1} />
      </mesh>
    </group>
  );
}
