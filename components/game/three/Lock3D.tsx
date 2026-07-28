'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LockStatus } from '@/types/game';
import { LOCK_LOCAL_POS } from './constants';

interface Lock3DProps {
  status: LockStatus;
}

const RED_FLASH = new THREE.Color('#ff2e3f');
const GOLD_GLOW = new THREE.Color('#ffb84d');

const ironProps = {
  color: '#41434c',
  metalness: 0.85,
  roughness: 0.45,
  emissive: '#000000',
  emissiveIntensity: 0,
} as const;

// Cerradura de hierro forjado montada sobre la puerta (posición local
// dentro del grupo de la puerta, para girar con ella al abrirse).
// SHAKE → vibra y destella rojo. OPEN → el ojo brilla dorado.
export default function Lock3D({ status }: Lock3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const plateMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const crownMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state, delta) => {
    const g = groupRef.current;
    const glow = glowMatRef.current;
    if (!g || !glow) return;
    const t = state.clock.elapsedTime;
    const mats = [plateMatRef.current, crownMatRef.current].filter(
      (m): m is THREE.MeshStandardMaterial => m !== null
    );

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
      {/* Placa principal */}
      <mesh>
        <boxGeometry args={[0.52, 0.7, 0.05]} />
        <meshStandardMaterial ref={plateMatRef} {...ironProps} />
      </mesh>
      {/* Corona superior (media luna decorativa) */}
      <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.05, 20, 1, false, 0, Math.PI]} />
        <meshStandardMaterial ref={crownMatRef} {...ironProps} />
      </mesh>
      {/* Remaches en las esquinas */}
      {([[-0.19, 0.26], [0.19, 0.26], [-0.19, -0.26], [0.19, -0.26]] as const).map(
        ([x, y], i) => (
          <mesh key={i} position={[x, y, 0.03]}>
            <sphereGeometry args={[0.032, 10, 10]} />
            <meshStandardMaterial color="#23252c" metalness={0.9} roughness={0.4} />
          </mesh>
        )
      )}
      {/* Resplandor dorado detrás del ojo (visible al abrir) */}
      <mesh position={[0, 0, 0.028]}>
        <circleGeometry args={[0.17, 24]} />
        <meshBasicMaterial ref={glowMatRef} color="#ffcf6e" transparent opacity={0} />
      </mesh>
      {/* Ojo de la cerradura: círculo + ranura */}
      <mesh position={[0, 0.05, 0.032]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.03, 20]} />
        <meshStandardMaterial color="#060606" roughness={1} />
      </mesh>
      <mesh position={[0, -0.09, 0.032]}>
        <boxGeometry args={[0.075, 0.2, 0.03]} />
        <meshStandardMaterial color="#060606" roughness={1} />
      </mesh>
    </group>
  );
}
