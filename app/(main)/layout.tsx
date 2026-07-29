'use client';

import Header from '@/components/layout/Header';
import RedeemBar from '@/components/wallet/RedeemBar';
import PwaInstallBanner from '@/components/ui/PwaInstallBanner';
import ChatWidget from '@/components/chat/ChatWidget';

// Layout persistente del shell SPA: el Header, la barra de canje y el
// footer NO se re-montan al navegar — solo cambia el contenido.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Header />
      <div className="app-content">{children}</div>
      <RedeemBar />
      <footer className="game-footer">
        <p>🗝️ La Llave Correcta</p>
      </footer>
      <ChatWidget />
      <PwaInstallBanner />
    </div>
  );
}
