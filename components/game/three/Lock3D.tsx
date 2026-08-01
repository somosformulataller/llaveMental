'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LockStatus } from '@/types/game';
import { LOCK_LOCAL_POS } from './constants';

interface Lock3DProps {
  status: LockStatus;
  /** Mapa de entorno para los reflejos del oro (opcional) */
  envMap?: THREE.Texture;
}

const RED_FLASH = new THREE.Color('#ff2e3f');
const RED_DEEP = new THREE.Color('#c41220');
// Verde "monedas": la llave no abrió pero soltó premio (no es error)
const GREEN_FLASH = new THREE.Color('#00e57a');
const GREEN_DEEP = new THREE.Color('#0c8f4e');
const GLOW_GREEN = new THREE.Color('#2bff9e');
const GOLD_GLOW = new THREE.Color('#ffb84d');
// Colores base de cada material (para volver del rojo al dorado)
const GOLD_BASE = new THREE.Color('#c8942f');
const TRIM_BASE = new THREE.Color('#e6bd57');
const GLOW_GOLD = new THREE.Color('#ffcf6e');
const GLOW_RED = new THREE.Color('#ff3b4a');

// Placa con esquinas redondeadas (para extruir con bisel)
function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  s.closePath();
  return s;
}

// Cerradura DORADA ornamentada (diseño de referencia): placa
// redondeada con bisel real, molduras, filigrana y un gran ojo
// oscuro. Montada en posición local dentro del grupo de la puerta,
// para girar con ella. SHAKE → vibra y destella rojo. OPEN → brilla.
export default function Lock3D({ status, envMap }: Lock3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Placa extruida con esquinas redondeadas y bisel (atrapa la luz
  // en los bordes, como el metal batido de la imagen)
  const plateGeo = useMemo(
    () =>
      new THREE.ExtrudeGeometry(roundedRectShape(0.62, 0.84, 0.07), {
        depth: 0.028,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.012,
        bevelSegments: 2,
      }),
    []
  );

  // Un material para el cuerpo y otro para las molduras: compartidos
  // entre las piezas para que toda la cerradura destelle junta.
  // Físicos y con mapa de entorno: el oro refleja de verdad.
  const goldMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#c8942f',
        metalness: 1,
        roughness: 0.26,
        envMap: envMap ?? null,
        envMapIntensity: 1.15,
      }),
    [envMap]
  );
  const trimMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#e6bd57',
        metalness: 1,
        roughness: 0.2,
        envMap: envMap ?? null,
        envMapIntensity: 1.25,
      }),
    [envMap]
  );

  useFrame((state, delta) => {
    const g = groupRef.current;
    const glow = glowMatRef.current;
    if (!g || !glow) return;
    const t = state.clock.elapsedTime;
    const k = 1 - Math.exp(-14 * delta);
    const mats: [THREE.MeshPhysicalMaterial, THREE.Color][] = [
      [goldMat, GOLD_BASE],
      [trimMat, TRIM_BASE],
    ];

    if (status === 'SHAKE') {
      // TODA la cerradura se pone roja: color base + emisivo fuerte +
      // halo rojo, y sin reflejos dorados que laven el rojo.
      g.position.x = LOCK_LOCAL_POS[0] + Math.sin(t * 55) * 0.035;
      g.position.y = LOCK_LOCAL_POS[1] + Math.sin(t * 47) * 0.02;
      for (const [m] of mats) {
        m.color.lerp(RED_DEEP, k);
        m.emissive.copy(RED_FLASH);
        m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 1.4, 14, delta);
        m.envMapIntensity = THREE.MathUtils.damp(m.envMapIntensity, 0.1, 12, delta);
      }
      glow.color.lerp(GLOW_RED, k);
      glow.opacity = THREE.MathUtils.damp(glow.opacity, 0.6, 10, delta);
    } else if (status === 'COINS') {
      // Llave con monedas: destello VERDE alegre con un rebote suave
      // (nada de vibración agresiva — no es un error).
      g.position.x = THREE.MathUtils.damp(g.position.x, LOCK_LOCAL_POS[0], 12, delta);
      g.position.y = LOCK_LOCAL_POS[1] + Math.abs(Math.sin(t * 12)) * 0.025;
      for (const [m] of mats) {
        m.color.lerp(GREEN_DEEP, k);
        m.emissive.copy(GREEN_FLASH);
        m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 1.1, 14, delta);
        m.envMapIntensity = THREE.MathUtils.damp(m.envMapIntensity, 0.15, 12, delta);
      }
      glow.color.lerp(GLOW_GREEN, k);
      glow.opacity = THREE.MathUtils.damp(glow.opacity, 0.55, 10, delta);
    } else if (status === 'OPEN') {
      g.position.x = THREE.MathUtils.damp(g.position.x, LOCK_LOCAL_POS[0], 12, delta);
      g.position.y = THREE.MathUtils.damp(g.position.y, LOCK_LOCAL_POS[1], 12, delta);
      for (const [m, base] of mats) {
        m.color.lerp(base, k);
        m.emissive.copy(GOLD_GLOW);
        m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 0.35, 6, delta);
        m.envMapIntensity = THREE.MathUtils.damp(m.envMapIntensity, 1.2, 8, delta);
      }
      glow.color.lerp(GLOW_GOLD, k);
      glow.opacity = THREE.MathUtils.damp(glow.opacity, 0.95, 6, delta);
    } else {
      g.position.x = THREE.MathUtils.damp(g.position.x, LOCK_LOCAL_POS[0], 12, delta);
      g.position.y = THREE.MathUtils.damp(g.position.y, LOCK_LOCAL_POS[1], 12, delta);
      for (const [m, base] of mats) {
        m.color.lerp(base, k);
        m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 0, 8, delta);
        m.envMapIntensity = THREE.MathUtils.damp(m.envMapIntensity, 1.2, 8, delta);
      }
      glow.color.lerp(GLOW_GOLD, k);
      glow.opacity = THREE.MathUtils.damp(glow.opacity, 0, 8, delta);
    }
  });

  return (
    <group ref={groupRef} position={LOCK_LOCAL_POS}>
      {/* Placa principal dorada (redondeada y biselada) */}
      <mesh material={goldMat} geometry={plateGeo} position={[0, 0, -0.012]} />
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
