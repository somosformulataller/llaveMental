'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';

interface TorchProps {
  position: [number, number, number];
  phase?: number;
}

// Antorcha de pared: soporte de madera, llama emisiva con parpadeo
// y luz puntual cálida que ilumina la mazmorra.
export default function Torch({ position, phase = 0 }: TorchProps) {
  const flameRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime + phase;
    const flicker =
      1 + Math.sin(t * 13.7) * 0.12 + Math.sin(t * 7.3 + 1.4) * 0.09;
    if (flameRef.current) {
      flameRef.current.scale.set(flicker, flicker * 1.1, flicker);
      flameRef.current.rotation.z = Math.sin(t * 5.1) * 0.08;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 9 + Math.sin(t * 11.3) * 2 + Math.sin(t * 5.7) * 1.2;
    }
  });

  return (
    <group position={position}>
      {/* Soporte de hierro anclado a la pared */}
      <mesh position={[0, -0.32, -0.08]} rotation={[0.5, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.035, 0.5, 8]} />
        <meshStandardMaterial color="#2e2a26" metalness={0.7} roughness={0.6} />
      </mesh>
      {/* Mango de madera */}
      <mesh position={[0, -0.12, 0.02]} rotation={[0.18, 0, 0]}>
        <cylinderGeometry args={[0.032, 0.045, 0.34, 8]} />
        <meshStandardMaterial color="#4a3320" roughness={0.9} />
      </mesh>
      {/* Llama */}
      <group ref={flameRef} position={[0, 0.14, 0.05]}>
        <mesh position={[0, 0.05, 0]}>
          <coneGeometry args={[0.09, 0.3, 8]} />
          <meshStandardMaterial
            color="#ff7b1c"
            emissive="#ff6a00"
            emissiveIntensity={2.4}
            transparent
            opacity={0.85}
          />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial
            color="#ffe8b0"
            emissive="#ffcf6e"
            emissiveIntensity={3.2}
          />
        </mesh>
      </group>
      {/* Chispas subiendo */}
      <Sparkles
        count={7}
        position={[0, 0.45, 0.05]}
        scale={[0.3, 0.55, 0.3]}
        size={2.2}
        speed={0.6}
        color="#ffb347"
        opacity={0.7}
      />
      <pointLight
        ref={lightRef}
        position={[0, 0.2, 0.35]}
        color="#ff9b3d"
        intensity={9}
        distance={9}
        decay={2}
      />
    </group>
  );
}
