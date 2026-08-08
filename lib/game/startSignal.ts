// Señal "iniciar juego" entre la barra inferior (PlayBar, vive en el
// layout) y el tablero (GameBoard, vive en /game). Si el tablero aún
// no montó (se está navegando hacia /game), la señal queda pendiente
// y se consume al montar — pero caduca rápido: una señal vieja no
// debe arrancar una partida cuando el jugador vuelva más tarde.

type Listener = () => void;

let listener: Listener | null = null;
let pendingAt = 0;

const PENDING_TTL_MS = 4000;

/** GameBoard se suscribe al montar; devuelve la función para desuscribirse */
export function onGameStart(fn: Listener): () => void {
  listener = fn;
  if (pendingAt && Date.now() - pendingAt < PENDING_TTL_MS) fn();
  pendingAt = 0;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** PlayBar pide arrancar: directo si el tablero está montado, pendiente si no */
export function requestGameStart() {
  if (listener) listener();
  else pendingAt = Date.now();
}
