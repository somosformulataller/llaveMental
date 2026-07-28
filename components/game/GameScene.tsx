'use client';

import dynamic from 'next/dynamic';
import type { MedievalSceneProps } from './three/MedievalScene';

// three.js pesa ~600 KB: se carga en un chunk aparte solo en el cliente
// (ssr: false es válido aquí porque este archivo es Client Component).
const MedievalScene = dynamic(() => import('./three/MedievalScene'), {
  ssr: false,
  loading: () => (
    <div className="scene3d-loading">
      <span className="scene3d-loading-icon">🕯️</span>
      Encendiendo las antorchas…
    </div>
  ),
});

export default function GameScene(props: MedievalSceneProps) {
  return (
    <div className="scene3d-wrap">
      <MedievalScene {...props} />
    </div>
  );
}
