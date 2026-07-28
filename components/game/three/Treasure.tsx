'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';

interface TreasureProps {
  /** 0-4: qué tesoro se revela detrás de la puerta */
  variant: number;
}

const goldMat = {
  color: '#e8b23a',
  metalness: 0.85,
  roughness: 0.25,
  emissive: '#c98f1e',
  emissiveIntensity: 0.55,
} as const;

const woodMat = { color: '#6b4a26', roughness: 0.8 } as const;
const ironMat = { color: '#3a3d45', metalness: 0.85, roughness: 0.45 } as const;

function Coins({ seedOffset = 0 }: { seedOffset?: number }) {
  // Monedas sueltas alrededor de la base (posiciones deterministas)
  const coins: [number, number, number][] = [
    [-0.55, 0.03, 0.25], [0.5, 0.03, 0.3], [-0.3, 0.03, 0.5],
    [0.35, 0.03, -0.2], [0.65, 0.03, 0.05], [-0.6, 0.03, -0.15],
  ];
  return (
    <group>
      {coins.map(([x, y, z], i) => (
        <mesh
          key={i}
          position={[x, y, z]}
          rotation={[Math.PI / 2, 0, (i + seedOffset) * 1.3]}
        >
          <cylinderGeometry args={[0.06, 0.06, 0.02, 12]} />
          <meshStandardMaterial {...goldMat} />
        </mesh>
      ))}
    </group>
  );
}

// Variante 0: cofre de madera abierto rebosante de oro
function Chest() {
  return (
    <group>
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.85, 0.45, 0.55]} />
        <meshStandardMaterial {...woodMat} />
      </mesh>
      {/* Bandas de hierro */}
      {[-0.25, 0.25].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]}>
          <boxGeometry args={[0.08, 0.47, 0.57]} />
          <meshStandardMaterial {...ironMat} />
        </mesh>
      ))}
      {/* Tapa abierta hacia atrás */}
      <group position={[0, 0.45, -0.27]} rotation={[-2.1, 0, 0]}>
        <mesh position={[0, 0.03, 0.27]}>
          <boxGeometry args={[0.85, 0.1, 0.55]} />
          <meshStandardMaterial {...woodMat} />
        </mesh>
      </group>
      {/* Oro desbordando */}
      <mesh position={[0, 0.45, 0]}>
        <sphereGeometry args={[0.33, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial {...goldMat} />
      </mesh>
      <Coins />
    </group>
  );
}

// Variante 1: montañas de monedas de oro
function GoldPile() {
  return (
    <group>
      <mesh position={[0, 0.15, 0]}>
        <sphereGeometry args={[0.6, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial {...goldMat} />
      </mesh>
      <mesh position={[-0.55, 0.1, 0.25]}>
        <sphereGeometry args={[0.32, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial {...goldMat} />
      </mesh>
      <mesh position={[0.6, 0.1, -0.1]}>
        <sphereGeometry args={[0.28, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial {...goldMat} />
      </mesh>
      <Coins seedOffset={3} />
    </group>
  );
}

// Variante 2: corona real sobre un cojín
function Crown() {
  return (
    <group>
      {/* Cojín */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.75, 0.18, 0.75]} />
        <meshStandardMaterial color="#7a1f2e" roughness={0.85} />
      </mesh>
      {/* Aro */}
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.26, 0.28, 0.16, 16]} />
        <meshStandardMaterial {...goldMat} />
      </mesh>
      {/* Puntas */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.24, 0.48, Math.sin(a) * 0.24]}>
            <coneGeometry args={[0.055, 0.18, 6]} />
            <meshStandardMaterial {...goldMat} />
          </mesh>
        );
      })}
      {/* Gemas */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.27, 0.32, Math.sin(a) * 0.27]}>
            <icosahedronGeometry args={[0.05, 0]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? '#d42a4b' : '#2a6bd4'}
              emissive={i % 2 === 0 ? '#a01230' : '#1244a0'}
              emissiveIntensity={0.9}
              roughness={0.15}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Variante 3: cáliz dorado rodeado de gemas
function Chalice() {
  return (
    <group>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.24, 0.3, 0.1, 14]} />
        <meshStandardMaterial {...goldMat} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 0.36, 10]} />
        <meshStandardMaterial {...goldMat} />
      </mesh>
      <mesh position={[0, 0.56, 0]}>
        <cylinderGeometry args={[0.3, 0.1, 0.32, 14]} />
        <meshStandardMaterial {...goldMat} />
      </mesh>
      {/* Brillo interior */}
      <mesh position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.22, 12, 8]} />
        <meshStandardMaterial
          color="#ffe8a0"
          emissive="#ffd873"
          emissiveIntensity={1.6}
        />
      </mesh>
      {/* Gemas alrededor */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        const colors = ['#d42a4b', '#2a6bd4', '#2ad46b', '#b32ad4', '#d4a72a'];
        return (
          <mesh key={i} position={[Math.cos(a) * 0.55, 0.07, Math.sin(a) * 0.55]}>
            <icosahedronGeometry args={[0.08, 0]} />
            <meshStandardMaterial
              color={colors[i]}
              emissive={colors[i]}
              emissiveIntensity={0.7}
              roughness={0.15}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Variante 4: espada legendaria clavada en la piedra
function Sword() {
  return (
    <group>
      {/* Piedra */}
      <mesh position={[0, 0.16, 0]}>
        <dodecahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial color="#57504a" roughness={0.95} />
      </mesh>
      <group position={[0, 0.35, 0]} rotation={[0, 0, 0.12]}>
        {/* Hoja */}
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[0.09, 0.9, 0.03]} />
          <meshStandardMaterial
            color="#cdd4e0"
            metalness={0.95}
            roughness={0.2}
            emissive="#8899bb"
            emissiveIntensity={0.35}
          />
        </mesh>
        {/* Guarda */}
        <mesh position={[0, 1.02, 0]}>
          <boxGeometry args={[0.36, 0.06, 0.06]} />
          <meshStandardMaterial {...goldMat} />
        </mesh>
        {/* Empuñadura y pomo */}
        <mesh position={[0, 1.16, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.22, 8]} />
          <meshStandardMaterial color="#5a2c1a" roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.3, 0]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial {...goldMat} />
        </mesh>
      </group>
      <Coins seedOffset={7} />
    </group>
  );
}

const VARIANTS = [Chest, GoldPile, Crown, Chalice, Sword];

// El tesoro revelado al abrirse la puerta: 5 variantes que rotan por
// partida ganada. Gira lentamente sobre sí mismo para lucirse.
export default function Treasure({ variant }: TreasureProps) {
  const groupRef = useRef<THREE.Group>(null);
  const Variant = VARIANTS[((variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.35;
      groupRef.current.position.y =
        Math.sin(state.clock.elapsedTime * 1.2) * 0.03;
    }
  });

  return (
    <group position={[0, 0, -2.4]}>
      <group ref={groupRef}>
        <Variant />
      </group>
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
  );
}
