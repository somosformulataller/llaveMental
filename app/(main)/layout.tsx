'use client';

import Header from '@/components/layout/Header';
import PwaInstallBanner from '@/components/ui/PwaInstallBanner';

// Layout persistente del shell SPA: el Header y el footer NO se
// re-montan al navegar entre pantallas — solo cambia el contenido.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Header />
      <div className="app-content">{children}</div>
      <footer className="game-footer">
        <p>🎰 La Llave Correcta · RTP 98% · Juego de entretenimiento · Solo créditos demo</p>
      </footer>
      <PwaInstallBanner />
    </div>
  );
}
