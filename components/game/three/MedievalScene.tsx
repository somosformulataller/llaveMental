'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { KeyStatus, LockStatus } from '@/types/game';
import Dungeon from './Dungeon';
import KeyRing from './KeyRing';

export interface MedievalSceneProps {
  lockStatus: LockStatus;
  keyStatuses: KeyStatus[];
  interactive: boolean;
  onKeyClick: (id: number) => void;
}

// Parallax sutil de cámara siguiendo el puntero (amplitud pequeña
// para que las llaves de los bordes nunca salgan del encuadre).
function CameraRig() {
  useFrame((state, delta) => {
    const k = 1 - Math.exp(-3 * delta);
    const { camera, pointer } = state;
    camera.position.x += (pointer.x * 0.12 - camera.position.x) * k;
    camera.position.y += (1.6 + pointer.y * 0.1 - camera.position.y) * k;
    camera.lookAt(0, 1.35, 0);
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
  onKeyClick,
}: MedievalSceneProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 1.6, 6.2], fov: 42 }}
    >
      <color attach="background" args={['#0e0a07']} />
      <fog attach="fog" args={['#0e0a07', 7.5, 15]} />

      <ambientLight intensity={0.35} color="#ffe0b3" />
      <directionalLight position={[3, 5, 6]} intensity={0.5} color="#b9c4e8" />
      {/* Foco cálido sobre la puerta y la cerradura */}
      <spotLight
        position={[0, 4.5, 4.5]}
        angle={0.6}
        penumbra={0.75}
        intensity={45}
        color="#ffd08a"
        distance={14}
        decay={2}
      />

      <CameraRig />
      <Dungeon lockStatus={lockStatus} />
      <KeyRing
        keyStatuses={keyStatuses}
        interactive={interactive}
        onKeyClick={onKeyClick}
      />
    </Canvas>
  );
}
