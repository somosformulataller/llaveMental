'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instances, Instance, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { LockStatus } from '@/types/game';
import Torch from './Torch';
import Lock3D from './Lock3D';
import { DOOR_HINGE_X, seededRand } from './constants';

interface DungeonProps {
  lockStatus: LockStatus;
}

interface Brick {
  position: [number, number, number];
  color: string;
}

// Muro de piedra: ladrillos instanciados alrededor del vano de la puerta.
function useBricks(): Brick[] {
  return useMemo(() => {
    const bricks: Brick[] = [];
    let i = 0;
    for (let row = 0; row < 15; row++) {
      const y = 0.16 + row * 0.3;
      const offset = row % 2 === 0 ? 0 : 0.31;
      for (let col = -8; col <= 8; col++) {
        const x = col * 0.62 + offset;
        // Hueco del vano de la puerta
        if (Math.abs(x) < 1.55 && y < 3.65) continue;
        if (Math.abs(x) > 5.2) continue;
        i++;
        const shade = 0.72 + seededRand(i) * 0.35;
        const r = Math.round(58 * shade);
        const g = Math.round(50 * shade);
        const b = Math.round(42 * shade);
        bricks.push({
          position: [
            x + (seededRand(i + 1000) - 0.5) * 0.02,
            y,
            -1.25 + (seededRand(i + 2000) - 0.5) * 0.05,
          ],
          color: `rgb(${r},${g},${b})`,
        });
      }
    }
    return bricks;
  }, []);
}

const PLANK_COLORS = ['#57381f', '#4e3018', '#5c3c22', '#503319', '#553a20'];

export default function Dungeon({ lockStatus }: DungeonProps) {
  const bricks = useBricks();
  const doorRef = useRef<THREE.Group>(null);
  const treasureLight = useRef<THREE.PointLight>(null);
  const open = lockStatus === 'OPEN';

  useFrame((_, delta) => {
    if (doorRef.current) {
      doorRef.current.rotation.y = THREE.MathUtils.damp(
        doorRef.current.rotation.y,
        open ? -1.25 : 0,
        open ? 1.6 : 8,
        delta
      );
    }
    if (treasureLight.current) {
      treasureLight.current.intensity = THREE.MathUtils.damp(
        treasureLight.current.intensity,
        open ? 30 : 0,
        2.5,
        delta
      );
    }
  });

  return (
    <group>
      {/* Suelo de piedra */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2]}>
        <planeGeometry args={[24, 16]} />
        <meshStandardMaterial color="#221b13" roughness={1} />
      </mesh>

      {/* Fondo del muro */}
      <mesh position={[0, 2.5, -1.45]}>
        <planeGeometry args={[24, 9]} />
        <meshStandardMaterial color="#171310" roughness={1} />
      </mesh>

      {/* Ladrillos */}
      <Instances limit={bricks.length} range={bricks.length}>
        <boxGeometry args={[0.58, 0.27, 0.14]} />
        <meshStandardMaterial roughness={0.95} />
        {bricks.map((b, i) => (
          <Instance key={i} position={b.position} color={b.color} />
        ))}
      </Instances>

      {/* Marco de piedra de la puerta */}
      {([-1.45, 1.45] as const).map((x) => (
        <group key={x}>
          {[0.55, 1.65, 2.75].map((y) => (
            <mesh key={y} position={[x, y, -1.05]}>
              <boxGeometry args={[0.55, 1.06, 0.5]} />
              <meshStandardMaterial color={y === 1.65 ? '#4d4238' : '#453b31'} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Dintel */}
      <mesh position={[0, 3.62, -1.05]}>
        <boxGeometry args={[3.7, 0.55, 0.55]} />
        <meshStandardMaterial color="#524639" roughness={0.9} />
      </mesh>

      {/* ── Sala del tesoro (visible al abrir) ── */}
      <mesh position={[0, 2, -3.4]}>
        <planeGeometry args={[6, 8]} />
        <meshStandardMaterial color="#0a0703" roughness={1} />
      </mesh>
      <pointLight
        ref={treasureLight}
        position={[0, 1.6, -2.2]}
        color="#ffc25e"
        intensity={0}
        distance={10}
        decay={2}
      />
      {open && (
        <group position={[0, 0, -2.4]}>
          {/* Montículo de oro */}
          <mesh position={[0, 0.18, 0]}>
            <sphereGeometry args={[0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              color="#e8b23a"
              metalness={0.8}
              roughness={0.3}
              emissive="#c98f1e"
              emissiveIntensity={0.6}
            />
          </mesh>
          <mesh position={[-0.5, 0.3, 0.2]} rotation={[0, 0.4, 0.2]}>
            <boxGeometry args={[0.35, 0.4, 0.3]} />
            <meshStandardMaterial
              color="#7a5427"
              metalness={0.3}
              roughness={0.7}
              emissive="#5e3d15"
              emissiveIntensity={0.3}
            />
          </mesh>
          <Sparkles
            count={45}
            position={[0, 1.1, 0.2]}
            scale={[2.2, 2.2, 1.2]}
            size={3.5}
            speed={0.45}
            color="#ffd873"
            opacity={0.9}
          />
        </group>
      )}

      {/* ── Puerta (bisagra en el borde izquierdo) ── */}
      <group ref={doorRef} position={[DOOR_HINGE_X, 0, -0.05]}>
        {/* Tablones verticales */}
        {PLANK_COLORS.map((color, i) => (
          <mesh key={i} position={[0.26 + i * 0.475, 1.72, 0]}>
            <boxGeometry args={[0.465, 3.44, 0.1]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        ))}
        {/* Bandas de hierro */}
        {[0.75, 2.6].map((y) => (
          <mesh key={y} position={[1.2, y, 0.062]}>
            <boxGeometry args={[2.36, 0.17, 0.035]} />
            <meshStandardMaterial color="#2b2d34" metalness={0.85} roughness={0.5} />
          </mesh>
        ))}
        {/* Clavos de las bandas */}
        {[0.75, 2.6].map((y) =>
          [0.25, 0.75, 1.25, 1.75, 2.2].map((x) => (
            <mesh key={`${y}-${x}`} position={[x, y, 0.085]}>
              <sphereGeometry args={[0.028, 8, 8]} />
              <meshStandardMaterial color="#1c1e24" metalness={0.9} roughness={0.4} />
            </mesh>
          ))
        )}
        {/* Argolla */}
        <mesh position={[1.75, 1.95, 0.1]} rotation={[0.35, 0, 0]}>
          <torusGeometry args={[0.11, 0.022, 10, 24]} />
          <meshStandardMaterial color="#33353d" metalness={0.9} roughness={0.4} />
        </mesh>
        {/* Cerradura (gira con la puerta) */}
        <Lock3D status={lockStatus} />
      </group>

      {/* Antorchas */}
      <Torch position={[-2.7, 2.15, -1.0]} phase={0} />
      <Torch position={[2.7, 2.15, -1.0]} phase={2.4} />
    </group>
  );
}
