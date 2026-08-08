'use client';

import Header from '@/components/layout/Header';
import PlayBar from '@/components/game/PlayBar';
import PwaInstallBanner from '@/components/ui/PwaInstallBanner';
import ChatWidget from '@/components/chat/ChatWidget';

// Layout persistente del shell SPA: el Header, la barra de jugar y el
// footer NO se re-montan al navegar — solo cambia el contenido.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Header />
      <div className="app-content">{children}</div>
      <PlayBar />
      <footer className="game-footer">
        <p>🗝️ La Llave Correcta</p>
      </footer>
      <ChatWidget />
      <PwaInstallBanner />
    </div>
  );
}
