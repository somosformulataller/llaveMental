'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';
import { LockStatus } from '@/types/game';
import Torch from './Torch';
import Lock3D from './Lock3D';
import Treasure from './Treasure';
import { DOOR_HINGE_X, seededRand } from './constants';

// Textura de resplandor (degradado radial cálido) generada por código:
// se usa detrás de la puerta y sobre el piso para el "glow" dorado.
function useGlowTexture(): THREE.CanvasTexture {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,196,110,0.9)');
    g.addColorStop(0.45, 'rgba(255,160,60,0.38)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
}

interface DungeonProps {
  lockStatus: LockStatus;
  treasureVariant: number;
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

// Paneles tallados en relieve de la puerta: 2 columnas × 3 filas
// (centro de cada hoja × altura), como en el diseño de referencia.
const PANEL_COLS = [0.62, 1.78];
const PANEL_ROWS = [0.66, 1.72, 2.78];

export default function Dungeon({ lockStatus, treasureVariant }: DungeonProps) {
  const bricks = useBricks();
  const glowTex = useGlowTexture();
  const doorRef = useRef<THREE.Group>(null);
  const treasureLight = useRef<THREE.PointLight>(null);
  const openTimer = useRef(0);
  const open = lockStatus === 'OPEN';

  useFrame((_, delta) => {
    // La puerta espera a que la llave termine de girar en el ojo
    // (~1 s en Key3D) y abre HACIA ADENTRO (+y), hacia la sala del
    // tesoro: así el jugador ve la cara de la cerradura al girar y
    // la hoja no invade la cámara.
    openTimer.current = open ? openTimer.current + delta : 0;
    const swing = open && openTimer.current > 1.05;
    if (doorRef.current) {
      doorRef.current.rotation.y = THREE.MathUtils.damp(
        doorRef.current.rotation.y,
        swing ? 1.45 : 0,
        swing ? 2.6 : 8,
        delta
      );
    }
    if (treasureLight.current) {
      treasureLight.current.intensity = THREE.MathUtils.damp(
        treasureLight.current.intensity,
        open ? 45 : 0,
        3.5,
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

      {/* Fondo del muro en tres franjas: el vano de la puerta queda
          ABIERTO para que al abrirse se vea la sala del tesoro */}
      <mesh position={[-6.78, 2.5, -1.45]}>
        <planeGeometry args={[10.45, 9]} />
        <meshStandardMaterial color="#171310" roughness={1} />
      </mesh>
      <mesh position={[6.78, 2.5, -1.45]}>
        <planeGeometry args={[10.45, 9]} />
        <meshStandardMaterial color="#171310" roughness={1} />
      </mesh>
      <mesh position={[0, 5.33, -1.45]}>
        <planeGeometry args={[3.1, 3.35]} />
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
        <meshStandardMaterial color="#241a10" roughness={1} />
      </mesh>
      <pointLight
        ref={treasureLight}
        position={[0, 1.6, -2.2]}
        color="#ffc25e"
        intensity={0}
        distance={10}
        decay={2}
      />
      {open && <Treasure variant={treasureVariant} />}

      {/* ── Resplandor dorado alrededor de la puerta y sobre el piso ──
          (a z=-1.13: justo delante de la cara de los ladrillos) */}
      <mesh position={[0, 2.0, -1.13]}>
        <planeGeometry args={[4.8, 5.2]} />
        <meshBasicMaterial
          map={glowTex}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          opacity={0.85}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.8]}>
        <planeGeometry args={[5.4, 3.6]} />
        <meshBasicMaterial
          map={glowTex}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          opacity={0.5}
        />
      </mesh>
      {/* Luz cálida frontal: baña la puerta y las llaves como en la referencia */}
      <pointLight position={[0.4, 1.4, 1.7]} color="#ffb45e" intensity={5} distance={7} decay={2} />

      {/* ── Puerta (bisagra en el borde izquierdo) ── */}
      <group ref={doorRef} position={[DOOR_HINGE_X, 0, -0.05]}>
        {/* Hoja de madera pulida oscura */}
        <mesh position={[1.2, 1.72, 0]}>
          <boxGeometry args={[2.36, 3.44, 0.08]} />
          <meshStandardMaterial color="#41240f" roughness={0.5} />
        </mesh>
        {/* Junta central: la puerta se lee como dos hojas */}
        <mesh position={[1.2, 1.72, 0.041]}>
          <boxGeometry args={[0.035, 3.44, 0.012]} />
          <meshStandardMaterial color="#1c0f06" roughness={0.85} />
        </mesh>
        {/* Paneles tallados en relieve (marco + centro que sobresale) */}
        {PANEL_COLS.map((x) =>
          PANEL_ROWS.map((y) => (
            <group key={`${x}-${y}`} position={[x, y, 0]}>
              <mesh position={[0, 0, 0.045]}>
                <boxGeometry args={[0.88, 0.94, 0.03]} />
                <meshStandardMaterial color="#5a3419" roughness={0.45} />
              </mesh>
              <mesh position={[0, 0, 0.058]}>
                <boxGeometry args={[0.6, 0.66, 0.035]} />
                <meshStandardMaterial color="#4a2a12" roughness={0.42} />
              </mesh>
            </group>
          ))
        )}
        {/* Bandas de hierro forjado */}
        {[0.75, 2.6].map((y) => (
          <mesh key={y} position={[1.2, y, 0.09]}>
            <boxGeometry args={[2.36, 0.2, 0.04]} />
            <meshStandardMaterial color="#26211c" metalness={0.75} roughness={0.5} />
          </mesh>
        ))}
        {/* Remaches DORADOS de las bandas (como en la referencia) */}
        {[0.75, 2.6].map((y) =>
          [0.25, 0.75, 1.25, 1.75, 2.15].map((x) => (
            <mesh key={`${y}-${x}`} position={[x, y, 0.115]}>
              <sphereGeometry args={[0.032, 10, 10]} />
              <meshStandardMaterial
                color="#d8a43c"
                metalness={0.95}
                roughness={0.3}
                emissive="#5c400c"
                emissiveIntensity={0.25}
              />
            </mesh>
          ))
        )}
        {/* Argolla colgando debajo de la cerradura */}
        <mesh position={[1.75, 1.52, 0.11]}>
          <boxGeometry args={[0.1, 0.05, 0.03]} />
          <meshStandardMaterial color="#8a6a2a" metalness={0.9} roughness={0.35} />
        </mesh>
        <mesh position={[1.75, 1.42, 0.12]} rotation={[0.35, 0, 0]}>
          <torusGeometry args={[0.1, 0.02, 10, 24]} />
          <meshStandardMaterial color="#8a6a2a" metalness={0.9} roughness={0.35} />
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
