'use client';

import Link from 'next/link';
import { usePlayer } from '@/components/providers/PlayerProvider';

export default function HomePage() {
  const { player, isLoading } = usePlayer();

  return (
    <div className="landing-page">
      <section className="landing-hero">
        {/* Badge */}
        <div className="hero-badge">🏰 Demo Gratuito · $100 en créditos al registrarte</div>

        {/* Title */}
        <div>
          <h1 className="hero-title">
            La Llave
            <br />
            Correcta
          </h1>
          <p className="hero-subtitle">
            10 llaves. 1 cerradura. Un pozo de <strong>$10</strong> esperándote.
            ¿Puedes encontrar la llave correcta antes de que el pozo llegue a cero?
          </p>
        </div>

        {/* CTA — /game está protegido por el proxy: si no hay sesión redirige a login */}
        <div className="hero-cta-group">
          <Link href={player || isLoading ? '/game' : '/auth/login'} className="cta-btn" prefetch>
            {player || isLoading ? '🔑 Jugar Ahora' : '🔐 Empezar a Jugar'}
          </Link>
          <p className="cta-note">
            {player
              ? `Saldo disponible: $${player.balance.toFixed(2)}`
              : 'Gratis · $100 en créditos demo al registrarse'}
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
              Por $2 obtienes un intento para abrir la puerta del tesoro.
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
              Cuando encuentres la llave correcta, el pozo restante es tuyo.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
