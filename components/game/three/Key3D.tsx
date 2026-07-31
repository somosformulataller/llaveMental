'use client';

import { useRef, useState, useCallback } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { KeyStatus } from '@/types/game';
import { KEYHOLE_TARGET } from './constants';
import PrizeTag from './PrizeTag';

interface Key3DProps {
  id: number;
  status: KeyStatus;
  base: [number, number, number];
  /** Escala adaptativa según el ancho de pantalla (1 = tamaño completo) */
  size: number;
  /** true cuando la puerta está abierta: la llave se desvanece para no tapar el tesoro */
  hidden: boolean;
  /** Premio de motivación revelado al final sobre una llave no volteada */
  reveal?: number | null;
  interactive: boolean;
  onKeyClick: (id: number) => void;
}

const GOLD = new THREE.Color('#e8b23a');
const GOLD_EMISSIVE = new THREE.Color('#9a7212');
const BROKEN_COLOR = new THREE.Color('#4a423a');
const CORRECT_EMISSIVE = new THREE.Color('#ffb833');

const goldProps = {
  color: '#e8b23a',
  metalness: 0.85,
  roughness: 0.32,
  emissive: '#9a7212',
  emissiveIntensity: 0.22,
  transparent: true,
} as const;

// Llave medieval procedural: anilla (toro), tija (cilindro) y dientes
// (cajas). El estado del juego dirige la animación en useFrame:
// IDLE flota y se balancea · FLYING vuela al ojo de la cerradura ·
// CORRECT gira dentro del ojo · BROKEN cae, se oscurece y se desvanece.
export default function Key3D({ id, status, base, size, hidden, reveal, interactive, onKeyClick }: Key3DProps) {
  const outerRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const pos = useRef<THREE.Vector3 | null>(null);
  const velY = useRef(0);
  const turnTimer = useRef(0);
  // Materiales cacheados: recorrer el árbol en cada frame (x10 llaves
  // x60 fps) era el mayor costo de CPU de la escena
  const matsRef = useRef<THREE.MeshStandardMaterial[] | null>(null);
  const [hovered, setHovered] = useState(false);

  const clickable = interactive && status === 'IDLE';

  const handleOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (clickable) {
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }
    },
    [clickable]
  );
  const handleOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = 'auto';
  }, []);
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (clickable) {
        setHovered(false);
        document.body.style.cursor = 'auto';
        onKeyClick(id);
      }
    },
    [clickable, id, onKeyClick]
  );

  useFrame((state, delta) => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    if (!pos.current) pos.current = new THREE.Vector3(...base);
    const p = pos.current;
    const t = state.clock.elapsedTime;
    const phase = id * 1.7;
    const k = 1 - Math.exp(-7 * delta);

    // Materiales dorados de las piezas de la llave (la caja de colisión
    // usa meshBasicMaterial y se excluye del filtro). Se recolectan UNA
    // sola vez: la geometría de la llave nunca cambia.
    if (!matsRef.current) {
      const collected: THREE.MeshStandardMaterial[] = [];
      inner.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (m.isMeshStandardMaterial) collected.push(m);
        }
      });
      matsRef.current = collected;
    }
    const mats = matsRef.current;

    // Puerta abierta: desvanecer la llave para despejar la vista del tesoro
    if (hidden) {
      let allFaded = true;
      for (const m of mats) {
        m.opacity = THREE.MathUtils.damp(m.opacity, 0, 4, delta);
        if (m.opacity > 0.02) allFaded = false;
      }
      if (allFaded) outer.visible = false;
      outer.position.copy(p);
      return;
    }

    if (status === 'IDLE') {
      // Restaurar tras "jugar de nuevo"
      outer.visible = true;
      velY.current = 0;
      turnTimer.current = 0;
      p.x = THREE.MathUtils.damp(p.x, base[0], 7, delta);
      p.y = THREE.MathUtils.damp(p.y, base[1] + Math.sin(t * 1.6 + phase) * 0.045, 7, delta);
      p.z = THREE.MathUtils.damp(p.z, base[2], 7, delta);
      outer.rotation.x = THREE.MathUtils.damp(outer.rotation.x, 0, 7, delta);
      outer.rotation.z = Math.sin(t * 1.2 + phase) * 0.07;
      outer.rotation.y = THREE.MathUtils.damp(outer.rotation.y, hovered && clickable ? 0.5 : 0, 7, delta);
      inner.rotation.y = THREE.MathUtils.damp(inner.rotation.y, 0, 7, delta);
      outer.scale.setScalar(
        THREE.MathUtils.damp(outer.scale.x, (hovered && clickable ? 1.22 : 1) * size, 9, delta)
      );
      for (const m of mats) {
        m.color.lerp(GOLD, k);
        m.emissive.lerp(GOLD_EMISSIVE, k);
        m.emissiveIntensity = THREE.MathUtils.damp(
          m.emissiveIntensity, hovered && clickable ? 0.8 : 0.22, 8, delta
        );
        m.opacity = THREE.MathUtils.damp(m.opacity, 1, 8, delta);
      }
    } else if (status === 'FLYING') {
      p.lerp(KEYHOLE_TARGET, 1 - Math.exp(-5.5 * delta));
      // Dientes primero hacia el ojo, anilla hacia el jugador. No se usa
      // π/2 exacto: con el mango justo de canto a la cámara la llave se
      // ve como una línea y parece "al revés"; la leve inclinación deja
      // ver la anilla y se lee claramente en posición de abrir.
      outer.rotation.x = THREE.MathUtils.damp(outer.rotation.x, Math.PI / 2 - 0.35, 6, delta);
      outer.rotation.z = THREE.MathUtils.damp(outer.rotation.z, 0, 6, delta);
      outer.rotation.y = THREE.MathUtils.damp(outer.rotation.y, 0, 6, delta);
      outer.scale.setScalar(THREE.MathUtils.damp(outer.scale.x, size, 9, delta));
    } else if (status === 'CORRECT') {
      turnTimer.current += delta;
      p.x = THREE.MathUtils.damp(p.x, KEYHOLE_TARGET.x, 6, delta);
      p.y = THREE.MathUtils.damp(p.y, KEYHOLE_TARGET.y, 6, delta);
      p.z = THREE.MathUtils.damp(p.z, KEYHOLE_TARGET.z - 0.12, 6, delta);
      outer.rotation.x = THREE.MathUtils.damp(outer.rotation.x, Math.PI / 2 - 0.35, 8, delta);
      outer.rotation.z = 0;
      // Girar la llave dentro del ojo y desvanecerla ANTES de que la
      // puerta empiece a abrirse (la puerta espera ~1.05 s en Dungeon)
      inner.rotation.y = THREE.MathUtils.damp(inner.rotation.y, Math.PI / 2, 5, delta);
      for (const m of mats) {
        m.emissive.lerp(CORRECT_EMISSIVE, k);
        m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 1.4, 5, delta);
        if (turnTimer.current > 0.75) {
          m.opacity = THREE.MathUtils.damp(m.opacity, 0, 5, delta);
        }
      }
    } else if (status === 'BROKEN') {
      velY.current -= 5.5 * delta;
      p.y += velY.current * delta;
      p.z += delta * 0.4;
      outer.rotation.x += delta * 6;
      outer.rotation.z += delta * 2.5;
      let faded = false;
      for (const m of mats) {
        m.color.lerp(BROKEN_COLOR, 1 - Math.exp(-6 * delta));
        m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 0, 8, delta);
        if (p.y < 0.35) {
          m.opacity = THREE.MathUtils.damp(m.opacity, 0, 5, delta);
        }
        if (m.opacity < 0.02) faded = true;
      }
      if (faded) outer.visible = false;
    }

    outer.position.copy(p);
  });

  return (
    <group ref={outerRef} position={base}>
      {/* Revelación al terminar: qué "escondía" esta llave no volteada */}
      {reveal != null && status === 'IDLE' && !hidden && <PrizeTag value={reveal} />}
      <group ref={innerRef}>
        {/* Anilla trilobulada (estilo medieval) */}
        <mesh position={[0, 0.3, 0]}>
          <torusGeometry args={[0.13, 0.038, 10, 24]} />
          <meshStandardMaterial {...goldProps} />
        </mesh>
        <mesh position={[-0.09, 0.42, 0]}>
          <torusGeometry args={[0.05, 0.024, 8, 16]} />
          <meshStandardMaterial {...goldProps} />
        </mesh>
        <mesh position={[0.09, 0.42, 0]}>
          <torusGeometry args={[0.05, 0.024, 8, 16]} />
          <meshStandardMaterial {...goldProps} />
        </mesh>
        {/* Tija */}
        <mesh position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.035, 0.042, 0.56, 10]} />
          <meshStandardMaterial {...goldProps} />
        </mesh>
        {/* Collar decorativo */}
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.04, 10]} />
          <meshStandardMaterial {...goldProps} />
        </mesh>
        {/* Dientes (paletón) */}
        <mesh position={[0.085, -0.3, 0]}>
          <boxGeometry args={[0.13, 0.06, 0.045]} />
          <meshStandardMaterial {...goldProps} />
        </mesh>
        <mesh position={[0.07, -0.38, 0]}>
          <boxGeometry args={[0.1, 0.05, 0.045]} />
          <meshStandardMaterial {...goldProps} />
        </mesh>
        {/* Caja de colisión invisible para facilitar el clic/tap */}
        <mesh
          position={[0, 0.05, 0]}
          onPointerOver={handleOver}
          onPointerOut={handleOut}
          onClick={handleClick}
        >
          <boxGeometry args={[0.42, 0.95, 0.3]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
