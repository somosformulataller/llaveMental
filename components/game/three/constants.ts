import * as THREE from 'three';

// Punto del ojo de la cerradura en coordenadas de mundo (puerta cerrada).
// Las llaves vuelan hacia aquí al ser probadas.
export const KEYHOLE_TARGET = new THREE.Vector3(0.55, 1.45, 0.38);

// Posición local de la cerradura dentro del grupo de la puerta
// (bisagra en x = -1.2 → 0.55 + 1.2 = 1.75 desde la bisagra).
export const LOCK_LOCAL_POS: [number, number, number] = [1.75, 1.45, 0.12];

// Bisagra de la puerta (borde izquierdo del vano).
export const DOOR_HINGE_X = -1.2;

// Pseudo-aleatorio determinista (evita Math.random en render).
export function seededRand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
