'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import GameScene from '@/components/game/GameScene';
import KeyLogo from '@/components/ui/KeyLogo';
import { TOTAL_KEYS } from '@/lib/game/constants';
import { KeyStatus } from '@/types/game';

// Escena del juego de fondo (solo decorativa): crea la expectativa
// de lo que hay detrás del login. Las llaves flotan pero no se tocan.
const IDLE_KEYS: KeyStatus[] = Array(TOTAL_KEYS).fill('IDLE');

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cedula, setCedula] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (isSignUp) {
      if (password !== confirm) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      if (!acceptTerms) {
        setError('Debes aceptar los términos y condiciones para registrarte.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // El servidor crea la cuenta YA CONFIRMADA (sin verificar el
        // correo) y aquí se inicia sesión de inmediato.
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            whatsapp: whatsapp.trim(),
            cedula: cedula.trim(),
            accepted: acceptTerms,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'No se pudo crear la cuenta');
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/game');
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Redirección según el rol: admin → panel, jugador → juego
        const { data: profile } = await supabase
          .from('players')
          .select('role')
          .eq('id', data.user.id)
          .single();
        router.push(profile?.role === 'admin' ? '/admin' : '/game');
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      if (msg.includes('Invalid login')) setError('Email o contraseña incorrectos.');
      else if (msg.includes('already registered')) setError('Este email ya está registrado.');
      else if (msg.includes('Password should be')) setError('La contraseña debe tener al menos 6 caracteres.');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* La mazmorra de fondo, con velo oscuro para leer el formulario */}
      <div className="auth-bg" aria-hidden>
        <GameScene
          lockStatus="IDLE"
          keyStatuses={IDLE_KEYS}
          interactive={false}
          treasureVariant={0}
          onKeyClick={() => {}}
        />
        <div className="auth-bg-veil" />
      </div>

      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo">
            <KeyLogo />
          </div>
          <h1 className="auth-title">
            {isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
          </h1>
          <p className="auth-subtitle">
            {isSignUp
              ? 'Compra tickets por Pago Móvil y gana premios reales'
              : 'Bienvenido de vuelta, jugador'}
          </p>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">⚠️ {error}</div>}
          {success && <div className="auth-success">✓ {success}</div>}

          {isSignUp && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="firstName">Nombre</label>
                  <input
                    id="firstName"
                    type="text"
                    className="form-input"
                    placeholder="Tu nombre"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    maxLength={60}
                    autoComplete="given-name"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="lastName">Apellido</label>
                  <input
                    id="lastName"
                    type="text"
                    className="form-input"
                    placeholder="Tu apellido"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    maxLength={60}
                    autoComplete="family-name"
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {isSignUp && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="whatsapp">WhatsApp</label>
                <input
                  id="whatsapp"
                  type="tel"
                  className="form-input"
                  placeholder="04121234567"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value.replace(/[^\d+]/g, ''))}
                  required
                  minLength={7}
                  maxLength={15}
                  autoComplete="tel"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cedula">Cédula</label>
                <input
                  id="cedula"
                  type="text"
                  className="form-input"
                  placeholder="V12345678"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  required
                  minLength={5}
                  maxLength={15}
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder={isSignUp ? 'Mínimo 6 caracteres' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={6}
            />
          </div>

          {isSignUp && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="confirm">Confirmar contraseña</label>
                <input
                  id="confirm"
                  type="password"
                  className="form-input"
                  placeholder="Repite tu contraseña"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>

              <label className="form-check">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  required
                />
                <span>
                  Acepto los{' '}
                  <Link href="/terminos" target="_blank" className="admin-link">
                    términos y condiciones
                  </Link>
                </span>
              </label>
            </>
          )}

          <button
            type="submit"
            className="btn-submit"
            disabled={loading}
          >
            {loading
              ? 'Cargando...'
              : isSignUp
              ? '🗝️ Crear cuenta y jugar'
              : '🔑 Entrar a jugar'}
          </button>
        </form>

        {/* Switch mode */}
        <p className="auth-switch">
          {isSignUp ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setIsSignUp(!isSignUp); setError(null); setSuccess(null); }}
          >
            {isSignUp ? 'Inicia sesión' : 'Regístrate'}
          </a>
        </p>
      </motion.div>
    </div>
  );
}
