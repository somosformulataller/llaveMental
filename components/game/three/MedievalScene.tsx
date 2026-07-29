'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { KeyStatus, LockStatus } from '@/types/game';
import Dungeon from './Dungeon';
import KeyRing from './KeyRing';

export interface MedievalSceneProps {
  lockStatus: LockStatus;
  keyStatuses: KeyStatus[];
  interactive: boolean;
  /** 0-4: tesoro que se revela al ganar (varía por partida) */
  treasureVariant: number;
  onKeyClick: (id: number) => void;
}

// Parallax sutil de cámara siguiendo el puntero (amplitud pequeña
// para que las llaves de los bordes nunca salgan del encuadre).
// Al abrirse la puerta, la cámara avanza hacia la sala del tesoro
// para que el premio se vea de cerca.
function CameraRig({ open }: { open: boolean }) {
  const lookTarget = useRef(new THREE.Vector3(0, 1.35, 0));
  useFrame((state, delta) => {
    const { camera, pointer } = state;
    const k = 1 - Math.exp(-3 * delta);
    const kDolly = 1 - Math.exp(-(open ? 1.4 : 3) * delta);

    const baseY = open ? 1.4 : 1.6;
    const baseZ = open ? 3.1 : 6.2;
    camera.position.x += (pointer.x * 0.12 - camera.position.x) * k;
    camera.position.y += (baseY + pointer.y * 0.1 - camera.position.y) * kDolly;
    camera.position.z += (baseZ - camera.position.z) * kDolly;

    const t = lookTarget.current;
    t.x += (0 - t.x) * kDolly;
    t.y += ((open ? 0.9 : 1.35) - t.y) * kDolly;
    t.z += ((open ? -2.4 : 0) - t.z) * kDolly;
    camera.lookAt(t);
  });
  return null;
}

// Escena 3D completa de la mazmorra medieval. Solo presentación:
// el resultado del juego lo decide el servidor; aquí únicamente se
// renderizan los estados que ya calculó GameBoard.
export default function MedievalScene({
  lockStatus,
  keyStatuses,
  interactive,
  treasureVariant,
  onKeyClick,
}: MedievalSceneProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 1.6, 6.2], fov: 42 }}
    >
      <color attach="background" args={['#0e0a07']} />
      <fog attach="fog" args={['#0e0a07', 8.5, 17]} />

      <ambientLight intensity={0.45} color="#ffe0b3" />
      <hemisphereLight intensity={0.35} color="#ffe8c4" groundColor="#3a2c1a" />
      {/* Luz de relleno cálida (la referencia no tiene luz fría) */}
      <directionalLight position={[3, 5, 6]} intensity={0.5} color="#e8dcc2" />
      {/* Foco cálido sobre la puerta y la cerradura */}
      <spotLight
        position={[0, 4.5, 4.5]}
        angle={0.65}
        penumbra={0.75}
        intensity={70}
        color="#ffd08a"
        distance={16}
        decay={2}
      />

      <CameraRig open={lockStatus === 'OPEN'} />
      <Dungeon lockStatus={lockStatus} treasureVariant={treasureVariant} />
      <KeyRing
        keyStatuses={keyStatuses}
        interactive={interactive}
        dimmed={lockStatus === 'OPEN'}
        onKeyClick={onKeyClick}
      />
    </Canvas>
  );
}
