import * as THREE from 'three';

// Punto del ojo de la cerradura en coordenadas de mundo (puerta cerrada).
// Las llaves vuelan hacia aquí al ser probadas. La altura (y=2.0) queda
// por ENCIMA de la fila trasera de llaves (tope ~1.67) para que no la tapen.
export const KEYHOLE_TARGET = new THREE.Vector3(0.55, 2.0, 0.38);

// Posición local de la cerradura dentro del grupo de la puerta
// (bisagra en x = -1.2 → 0.55 + 1.2 = 1.75 desde la bisagra).
export const LOCK_LOCAL_POS: [number, number, number] = [1.75, 2.0, 0.12];

// Bisagra de la puerta (borde izquierdo del vano).
export const DOOR_HINGE_X = -1.2;

// Pseudo-aleatorio determinista (evita Math.random en render).
export function seededRand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
