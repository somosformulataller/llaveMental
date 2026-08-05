'use client';

import { useSyncExternalStore } from 'react';

// Estado compartido GameBoard → Header: cuántas llaves con monedas
// ocultas le quedan a la partida en curso. `null` = sin partida activa
// (el header vuelve a mostrar el saldo normal). Es un mini-store a
// nivel de módulo porque el Header vive en el layout, fuera del árbol
// del juego.
let coinKeys: number | null = null;
const listeners = new Set<() => void>();

export function setCoinKeys(value: number | null) {
  if (coinKeys === value) return;
  coinKeys = value;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useCoinKeys(): number | null {
  return useSyncExternalStore(subscribe, () => coinKeys, () => null);
}
