'use client';

import { useSyncExternalStore } from 'react';

// Estado compartido GameBoard → Header: cuántas llaves con monedas
// ocultas le quedan a la partida en curso. `null` = sin partida activa
// (el header vuelve a mostrar el saldo normal). Es un mini-store a
// nivel de módulo porque el Header vive en el layout, fuera del árbol
// del juego.
//
// Se respalda en sessionStorage: al RECARGAR la página con partida en
// curso el header muestra la llave desde el primer render, sin el
// flash del icono de saldo mientras /api/session responde (el valor
// real del servidor lo corrige enseguida si cambió).
const STORAGE_KEY = 'llave.coinKeys';

let coinKeys: number | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw !== null && !Number.isNaN(Number(raw))) coinKeys = Number(raw);
  } catch {}
}

export function setCoinKeys(value: number | null) {
  ensureHydrated();
  try {
    if (value === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, String(value));
  } catch {}
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

function getSnapshot() {
  ensureHydrated();
  return coinKeys;
}

export function useCoinKeys(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
