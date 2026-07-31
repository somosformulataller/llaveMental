'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Etiqueta dorada flotante con un monto, para revelar al final de la
// partida "qué había" tras las llaves que no se voltearon. Es un
// sprite (siempre mira a la cámara) con textura de canvas.
export default function PrizeTag({ value }: { value: number }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (ctx) {
      // Píldora oscura con borde dorado
      const r = 40;
      ctx.beginPath();
      ctx.moveTo(24 + r, 20);
      ctx.arcTo(232, 20, 232, 108, r);
      ctx.arcTo(232, 108, 24, 108, r);
      ctx.arcTo(24, 108, 24, 20, r);
      ctx.arcTo(24, 20, 232, 20, r);
      ctx.closePath();
      ctx.fillStyle = 'rgba(14, 10, 7, 0.88)';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#c8942f';
      ctx.stroke();
      ctx.fillStyle = '#f5c518';
      ctx.font = 'bold 56px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`$${value.toFixed(2)}`, 128, 66);
    }
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }, [value]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={[0, 0.72, 0]} scale={[0.62, 0.31, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}
