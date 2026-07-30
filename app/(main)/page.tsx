'use client';

import Link from 'next/link';
import { usePlayer } from '@/components/providers/PlayerProvider';

export default function HomePage() {
  const { player, isLoading } = usePlayer();

  return (
    <div className="landing-page">
      <section className="landing-hero">
        {/* Badge */}
        <div className="hero-badge">🏰 Premios reales · Paga con Pago Móvil</div>

        {/* Title */}
        <div>
          <h1 className="hero-title">
            La Llave
            <br />
            Correcta
          </h1>
          <p className="hero-subtitle">
            10 llaves. 1 cerradura. Un premio de <strong>$10</strong> esperándote.
            ¿Puedes encontrar la llave correcta antes de que el premio llegue a cero?
          </p>
        </div>

        {/* CTA — /game está protegido por el proxy: si no hay sesión redirige a login */}
        <div className="hero-cta-group">
          <Link href={player || isLoading ? '/game' : '/auth/login'} className="cta-btn" prefetch>
            {player || isLoading ? '🔑 Jugar Ahora' : '🔐 Empezar a Jugar'}
          </Link>
          <p className="cta-note">
            {player
              ? `🎟️ ${player.tickets ?? 0} tickets · 💰 $${player.balance.toFixed(2)} en premios`
              : 'Regístrate gratis · 1 ticket = $2.00 por Pago Móvil'}
          </p>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">10</div>
            <div className="stat-label">Llaves</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">$10</div>
            <div className="stat-label">Premio Máx.</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">$2</div>
            <div className="stat-label">Por Ticket</div>
          </div>
        </div>
      </section>

      {/* How to play */}
      <section className="how-section">
        <h2 className="how-title">¿Cómo se juega?</h2>
        <div className="steps-grid">
          <div className="step-card">
            <span className="step-icon">🎟️</span>
            <span className="step-number">Paso 1</span>
            <p className="step-title">Compra un Ticket</p>
            <p className="step-desc">
              Paga por Pago Móvil ($2 por ticket): tu pago se valida al
              instante y recibes tus tickets.
            </p>
          </div>
          <div className="step-card">
            <span className="step-icon">🗝️</span>
            <span className="step-number">Paso 2</span>
            <p className="step-title">Elige una Llave</p>
            <p className="step-desc">
              Selecciona entre 10 llaves para intentar abrir la cerradura.
            </p>
          </div>
          <div className="step-card">
            <span className="step-icon">💰</span>
            <span className="step-number">Paso 3</span>
            <p className="step-title">¡Cobra tu Premio!</p>
            <p className="step-desc">
              Cuando encuentres la llave correcta, el premio restante es tuyo:
              retíralo por Pago Móvil o cámbialo por más tickets.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
