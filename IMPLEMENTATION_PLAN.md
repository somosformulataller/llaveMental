# 🗝️ La Llave Correcta — Plan de Implementación

## Descripción General

Juego web tipo scratch-card pre-determinado (server-authoritative). El jugador paga $2 por ticket, elige llaves para abrir una cerradura, pero **el resultado ya está fijado por el servidor** al momento de comprar. Las elecciones solo desencadenan la narrativa. RTP del 98%, baja volatilidad.

**Stack:** Next.js 16 (App Router) + Supabase (Auth + PostgreSQL) + Framer Motion + next-pwa

**Arquitectura SPA:** `/`, `/game` y `/admin` son páginas **estáticas pre-renderizadas** con navegación cliente instantánea. El shell (Header + footer) persiste entre pantallas gracias al route group `(main)`; las transiciones entre pantallas las hace Framer Motion en `template.tsx`; el perfil del jugador vive en un contexto global (`PlayerProvider`) que se carga una sola vez vía `/api/player` y se sincroniza con los eventos de auth de Supabase. No hay pantallas de loading entre rutas.

**Perfiles:** dos roles — `player` (registro normal desde la app, $100 demo) y `admin` (se promueve por SQL en la base de datos). El admin tiene un panel en `/admin` con métricas en vivo y es redirigido allí automáticamente al iniciar sesión.

---

## Stack y Herramientas

| Herramienta | Versión | Rol |
|---|---|---|
| **Next.js** | 16 | Framework principal, SSR, App Router |
| **Supabase Auth** | — | Autenticación de jugadores (email + Google OAuth) |
| **Supabase PostgreSQL** | — | Sesiones de juego, historial, saldos |
| **Supabase RLS** | — | Seguridad row-level por usuario |
| **Framer Motion** | — | Animaciones de llaves, cerradura, modales, confetti |
| **next-pwa** | — | Service Worker, instalación PWA, cache offline |
| **Web Audio API** | nativa | Efectos de sonido sin dependencias externas |
| **TypeScript** | — | Tipado estático en todo el proyecto |
| **Vanilla CSS** | — | Design system propio, glassmorphism, dark theme |

---

## Arquitectura de Carpetas

```
llave-mental/
├── app/
│   ├── layout.tsx                 # Root layout: fuentes, meta PWA, <PlayerProvider>
│   ├── globals.css                # Design system completo (+ estilos SPA shell y admin)
│   ├── (main)/                    # Route group SPA — shell persistente entre pantallas
│   │   ├── layout.tsx             # Header + footer persistentes (no se re-montan)
│   │   ├── template.tsx           # Transición Framer Motion en cada navegación
│   │   ├── page.tsx               # Landing (client, estática, render instantáneo)
│   │   ├── game/page.tsx          # Juego (client, estática; protegida por proxy.ts)
│   │   └── admin/page.tsx         # Panel admin (client; solo role='admin')
│   ├── auth/
│   │   ├── login/page.tsx         # Login / Signup + Google OAuth + redirect por rol
│   │   └── callback/route.ts      # OAuth redirect (admin → /admin, jugador → /game)
│   └── api/
│       ├── buy-ticket/route.ts    # POST: RNG + crear sesión + debitar saldo
│       ├── try-key/route.ts       # POST: resolver intento de llave (server-auth)
│       ├── player/route.ts        # GET: perfil, saldo y rol del jugador
│       └── admin/stats/route.ts   # GET: métricas del panel (verifica role='admin')
├── components/
│   ├── providers/
│   │   └── PlayerProvider.tsx     # Contexto global: perfil compartido entre pantallas
│   ├── game/
│   │   ├── GameBoard.tsx          # Orquestador principal + Web Audio API
│   │   ├── Lock.tsx               # SVG cerradura animada (IDLE / SHAKE / OPEN)
│   │   ├── Key.tsx                # SVG llave (IDLE / FLYING / BROKEN / CORRECT)
│   │   ├── KeyGrid.tsx            # Grid 5×2 con stagger animation
│   │   ├── VaultCounter.tsx       # Contador spring animado con flash -$2
│   │   ├── WinModal.tsx           # Modal victoria + 30 partículas confetti
│   │   └── LoseModal.tsx          # Modal derrota con $0.00
│   ├── layout/
│   │   └── Header.tsx             # Header sticky: nav SPA, wallet, enlace Admin (👑)
│   └── ui/
│       ├── Button.tsx             # Botón reutilizable con Framer Motion
│       └── PwaInstallBanner.tsx   # Banner nativo de instalación PWA
├── lib/
│   ├── game/
│   │   ├── rng.ts                 # Motor RNG ponderado (RTP 98%)
│   │   └── constants.ts           # PAYOUT_TABLE, TICKET_COST, INITIAL_VAULT
│   └── supabase/
│       ├── server.ts              # createServerClient (SSR, cookies)
│       └── client.ts              # createBrowserClient
├── types/
│   └── game.ts                    # Tipos del dominio + rol + tipos del panel admin
├── proxy.ts                       # Session refresh + protección de /game y /admin
├── supabase/
│   └── migrations/
│       ├── 001_game_tables.sql    # Schema completo + RLS + trigger auto-player
│       └── 002_admin_role.sql     # Rol admin + is_admin() + RLS admin de lectura
├── public/
│   ├── manifest.json              # PWA manifest (standalone, dark theme)
│   └── icons/                     # Íconos en 8 tamaños: 72 → 512px
└── next.config.js                 # Configuración PWA + webpack mode
```

> Nota: `app/page.tsx`, `app/game/page.tsx` y `GameClientWrapper.tsx` fueron
> reemplazados por el route group `(main)` + `PlayerProvider` (arquitectura SPA).

---

## Esquema de Base de Datos (Supabase)

### `players` — Perfil, saldo y rol del jugador

```sql
CREATE TABLE players (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT,
  balance      DECIMAL(10,2) NOT NULL DEFAULT 100.00,  -- Saldo demo inicial
  total_wagered DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_won    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  role         TEXT NOT NULL DEFAULT 'player'          -- 'player' | 'admin' (migración 002)
               CHECK (role IN ('player', 'admin')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Rol admin (migración `002_admin_role.sql`):**
- El admin **no se registra como admin desde la app**: crea su cuenta normal y se promueve por SQL:
  ```sql
  UPDATE public.players SET role = 'admin'
  WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@tudominio.com');
  ```
- Función `is_admin()` (`SECURITY DEFINER`, evita recursión en RLS).
- Políticas `*_admin_read`: el admin puede **leer** todos los `players`, `game_sessions` y `game_history`.
- Se revoca el `UPDATE` de la columna `role` para `authenticated`/`anon`: nadie puede auto-promoverse desde el cliente (solo el SQL Editor / service role).

### `game_sessions` — Sesión de cada partida (server-authoritative)

```sql
CREATE TABLE game_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_payout    DECIMAL(10,2) NOT NULL,   -- Determinado por RNG al inicio
  required_errors  INT NOT NULL,              -- = (10 - target_payout) / 2
  errors_remaining INT NOT NULL,              -- Countdown hasta el éxito
  current_vault    DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  keys_tried       INT[] NOT NULL DEFAULT '{}',
  game_status      TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | COMPLETED | EXPIRED
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);
```

### `game_history` — Log inmutable de todas las partidas

```sql
CREATE TABLE game_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_id       UUID NOT NULL REFERENCES game_sessions(id),
  payout           DECIMAL(10,2) NOT NULL,
  keys_tried_count INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### RLS (Row Level Security)

Cada tabla tiene políticas RLS que garantizan que un usuario **solo puede leer y escribir sus propios datos**:

```sql
-- Ejemplo: game_sessions
CREATE POLICY "sessions_own" ON public.game_sessions
  FOR ALL USING (auth.uid() = player_id);
```

### Trigger: auto-crear perfil en registro

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.players (id, username)
  VALUES (NEW.id, SPLIT_PART(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## Motor RNG — `lib/game/rng.ts`

Sorteo ponderado determinista que garantiza un RTP del 98%:

### Tabla de Probabilidades

| Premio ($) | Fallos requeridos | Peso | Acumulado | Contribución EV |
|:-----------:|:-----------------:|:----:|:---------:|:---------------:|
| $0          | 5                 | 34   | 34        | $0.000          |
| $2          | 4                 | 46   | 80        | $0.920          |
| $4          | 3                 | 12   | 92        | $0.480          |
| $6          | 2                 | 5    | 97        | $0.300          |
| $8          | 1                 | 2    | 99        | $0.160          |
| $10         | 0                 | 1    | 100       | $0.100          |
| **Total**   |                   | 100  |           | **$1.960**      |

**EV / Ticket = $1.96 → RTP = 1.96 / 2.00 = 98%**

### Algoritmo

```typescript
export function drawPayoutTier(): PayoutTier {
  const roll = Math.random() * TOTAL_WEIGHT; // 0 - 100
  let cumulative = 0;
  for (const tier of PAYOUT_TABLE) {
    cumulative += tier.weight;
    if (roll < cumulative) return tier;
  }
  return PAYOUT_TABLE[0]; // fallback
}
```

---

## Endpoints de API

### `POST /api/buy-ticket`

```
Auth requerida: ✅
```

**Flujo:**
1. Verifica autenticación con `supabase.auth.getUser()`
2. Obtiene saldo del jugador → verifica `balance >= $2`
3. Verifica que no exista sesión ACTIVA previa
4. **Ejecuta RNG ponderado** → selecciona `target_payout`
5. Calcula `required_errors = (10 - target_payout) / 2`
6. Inserta registro en `game_sessions`
7. Descuenta $2 del saldo + incrementa `total_wagered`
8. En caso de error al debitar → rollback (elimina sesión creada)

**Respuesta exitosa:**
```json
{ "session_id": "uuid", "vault": 10 }
```

---

### `POST /api/try-key`

```
Auth requerida: ✅
Body: { "session_id": "uuid", "key_id": 0-9 }
```

**Flujo:**
1. Verifica autenticación
2. Obtiene sesión verificando `player_id = user.id` y `game_status = ACTIVE`
3. Verifica que `key_id` no esté en `keys_tried`
4. **Lógica pre-determinada:**
   - Si `errors_remaining > 0` → **FALLO**: decrementa, resta $2 al vault
   - Si `errors_remaining == 0` → **ÉXITO**: marca COMPLETED, acredita payout

**Respuesta de fallo:**
```json
{ "success": false, "vault": 8, "animation": "KEY_BROKEN" }
```

**Respuesta de éxito:**
```json
{ "success": true, "vault": 4, "payout": 4, "animation": "LOCK_OPENED" }
```

---

### `GET /api/player`

```
Auth requerida: no (devuelve player: null sin sesión)
```

Devuelve el perfil completo del jugador autenticado (incluido `role`). Es la fuente de datos del `PlayerProvider` — se llama una vez al montar la app y en cada cambio de estado de auth.

---

### `GET /api/admin/stats`

```
Auth requerida: ✅ · Rol requerido: admin
```

**Flujo:**
1. Verifica autenticación → `401` si no hay sesión
2. Verifica `players.role = 'admin'` → `403` si no es admin
3. Consulta en paralelo: lista de jugadores, conteo de tickets (`game_history`), sesiones `ACTIVE` y últimas 20 partidas (con username)
4. Las políticas RLS `*_admin_read` son la segunda capa: sin rol admin la BD no devuelve filas ajenas

**Respuesta:**
```json
{
  "stats": {
    "total_players": 12,
    "total_tickets": 340,
    "total_wagered": 680.00,
    "total_paid": 663.50,
    "rtp_real": 0.9757,
    "active_sessions": 2
  },
  "players": [ ... ],
  "recent_games": [ ... ]
}
```

---

## Navegación SPA — Pantallas dinámicas instantáneas

| Pieza | Rol |
|-------|-----|
| `app/(main)/layout.tsx` | Shell persistente: Header + footer NO se re-montan al navegar |
| `app/(main)/template.tsx` | Se re-monta en cada navegación → transición animada de entrada (fade + slide) |
| `PlayerProvider` | Contexto global del perfil; carga única vía `/api/player`, sincronizado con `onAuthStateChange` |
| Páginas client estáticas | `/`, `/game` y `/admin` se pre-renderizan en build (`○ Static`) y se hidratan al instante |
| `Link prefetch` | Todos los enlaces de navegación pre-cargan la ruta destino |
| `proxy.ts` | Protege `/game` y `/admin` con redirect server-side (sin pantallas de loading) |

**Flujo de login por rol:** `signInWithPassword` → consulta `players.role` → `router.push('/admin')` si admin, `/game` si jugador. El callback de Google OAuth hace lo mismo server-side.

---

## Panel de Administración — `/admin`

- **Métricas en vivo** (refresco cada 30s): jugadores totales, tickets jugados, total apostado, total pagado, **RTP real** y sesiones activas.
- **Tabla de jugadores**: usuario, rol, saldo, apostado, ganado, fecha de registro.
- **Últimas 20 partidas**: fecha, jugador, llaves usadas, premio (verde/rojo).
- **Protección en 3 capas**: proxy (sesión) → endpoint (verifica rol) → RLS (la BD no entrega filas ajenas sin rol admin).
- El enlace "Admin" del Header solo aparece para admins (badge 👑); un jugador que entre a `/admin` es redirigido a `/game`.

---

## Componentes de UI

### GameBoard — Orquestador principal

- Mantiene todo el estado del juego: `vault`, `keyStatuses`, `lockStatus`, `gameStatus`
- Gestiona llamadas a `/api/buy-ticket` y `/api/try-key`
- Genera efectos de sonido con **Web Audio API** (sin dependencias externas):
  - **Error:** onda sawtooth descendente (~150Hz → 100Hz)
  - **Victoria:** escala ascendente Do-Mi-Sol-Do (523-659-784-1047 Hz)

### Lock — Cerradura SVG animada

| Estado | Descripción |
|--------|-------------|
| `IDLE` | Cerradura dorada estática |
| `SHAKE` | Vibración horizontal + rotación (Framer Motion keyframes) |
| `OPEN` | Brillo verde, glow radial, cadencia de éxito |

### Key — Llave SVG individual

| Estado | Descripción |
|--------|-------------|
| `IDLE` | Llave dorada, hover con elevación |
| `FLYING` | En tránsito (animación de vuelo) |
| `BROKEN` | Opacidad reducida, crack rojo, caída |
| `CORRECT` | Verde brillante, glow, borde verde |

### VaultCounter

- Spring animation con `framer-motion` (`stiffness: 100, damping: 30`)
- Flash rojo en `-$2.00` al decrementar (3 frames de color)
- Texto dorado con `drop-shadow` filtro para brillo dinámico

### WinModal

- Overlay con `backdrop-filter: blur(8px)`
- 30 partículas de confetti con posición/color/rotación aleatorios
- Variantes: Jackpot 🏆 · Ganancia 🔓 · Empate 🔄

---

## Diseño Visual

### Paleta de Colores

| Rol | Color | Hex |
|-----|-------|-----|
| Fondo principal | Negro profundo | `#0D0F14` |
| Superficie | Gris carbón | `#1A1D26` |
| Acento primario | Dorado | `#F5C518` |
| Acento dorado claro | Amarillo | `#FFE55C` |
| Victoria | Verde neón | `#00FF87` |
| Error | Rojo | `#FF4757` |
| Texto | Blanco suave | `#E8E8E8` |
| Texto secundario | Gris azulado | `#9ca3b8` |

### Tipografía

- **Rajdhani** (Google Fonts) — Números, scores, títulos
- **Inter** (Google Fonts) — UI, textos, etiquetas

### Efectos

- Glassmorphism: `backdrop-filter: blur(20px)` en todos los paneles
- Gradientes dorados en CTAs y marca
- `drop-shadow` + `radial-gradient` en cerradura y llaves
- Micro-animaciones en hover de cada llave (scale + translate)

---

## PWA — Progressive Web App

| Feature | Implementación |
|---------|---------------|
| Manifest | `public/manifest.json` (standalone, dark theme, shortcuts) |
| Service Worker | `next-pwa` (desactivado en dev, activo en producción) |
| Íconos | 8 tamaños: 72×72 → 512×512 px |
| Caching | Fonts: CacheFirst · Static: CacheFirst · **API: NetworkOnly** |
| Banner instalación | `PwaInstallBanner.tsx` con evento `beforeinstallprompt` |
| Shortcut | Directo a `/game` desde el launcher |

> **Importante:** Las rutas `/api/*` están excluidas del cache (siempre network-first) para garantizar que el RNG y la lógica de sesiones siempre corran en el servidor.

---

## Seguridad

| Amenaza | Mitigación |
|---------|-----------|
| Manipular resultado desde el cliente | RNG corre 100% en el servidor, nunca expuesto al cliente |
| Robar sesión de otro jugador | RLS en Supabase + verificación de `player_id == user.id` en cada request |
| Reutilizar una llave ya intentada | Array `keys_tried` verificado antes de procesar cada intento |
| Doble compra de ticket | Verifica sesión ACTIVA existente antes de crear una nueva |
| Sesión ya completada | `game_status = COMPLETED` bloquea nuevos intentos |
| Balance negativo | Verificación de `balance >= $2` antes de debitar |
| Auto-promoverse a admin | `REVOKE UPDATE(role)`: la columna `role` solo se cambia desde el SQL Editor / service role |
| Acceso al panel admin sin rol | 3 capas: proxy (sesión) → `/api/admin/stats` (verifica rol, 403) → RLS (`is_admin()`) |
| Ver datos de otros jugadores | Las políticas `*_admin_read` solo aplican a `role='admin'`; el resto sigue limitado a sus propias filas |

---

## Plan de Verificación

### Pruebas automáticas

```bash
# Verificación de tipos TypeScript
npx tsc --noEmit

# Linting
npm run lint

# Build de producción
npm run build
```

### Verificación manual

1. **Registro** → confirmar que se crea perfil con $100 de saldo demo y `role='player'`
2. **Login jugador** → verificar redirect a `/game`
3. **Login admin** → verificar redirect a `/admin` y badge 👑 + enlace "Admin" en el Header
4. **Comprar ticket** → confirmar deducción de $2 en header
5. **5 fallos** → verificar modal de derrota y `game_status: COMPLETED` en Supabase
6. **Jackpot (raro)** → verificar $10 acreditados en saldo
7. **Session hijacking** → intentar usar `session_id` de otro usuario → esperar 404
8. **Reutilizar llave** → intentar el mismo `key_id` dos veces → esperar error
9. **Jugador entra a `/admin`** → esperar redirect a `/game`; `/api/admin/stats` responde 403
10. **Navegación SPA** → moverse entre `/`, `/game` y `/admin`: el Header no parpadea, no hay pantallas de loading y hay transición animada
11. **PWA install** → verificar banner en Chrome mobile y proceso de instalación

---

## Supuestos del Plan

1. **Créditos de demostración:** El saldo es simulado (no dinero real). Los jugadores empiezan con $100 de crédito demo. Sin integración de pagos reales.
2. **Auth con Supabase:** Email/Password como método principal + Google OAuth opcional.
3. **Audio nativo:** Se usa Web Audio API en lugar de Howler.js para no agregar dependencias externas.
4. **Next.js 16 + webpack:** Se usa `--webpack` flag porque `next-pwa` no es compatible aún con Turbopack.

---

## ✅ Hecho — Actualizaciones recientes (27 jul 2026)

| Área | Qué se implementó |
|------|-------------------|
| ✅ Rol de administrador | Migración `002_admin_role.sql`: columna `role`, función `is_admin()`, políticas RLS de lectura para admin, `REVOKE UPDATE(role)` anti auto-promoción |
| ✅ Panel `/admin` | Métricas en vivo (30s), RTP real, tabla de jugadores, últimas 20 partidas; protección en 3 capas |
| ✅ Endpoint `/api/admin/stats` | Verifica sesión (401) y rol admin (403); consultas en paralelo |
| ✅ Redirección por rol | Login email/password y callback de Google OAuth: admin → `/admin`, jugador → `/game` |
| ✅ Arquitectura SPA | Route group `(main)` con Header/footer persistentes; `/`, `/game` y `/admin` pre-renderizadas estáticas; sin loading entre pantallas |
| ✅ `PlayerProvider` | Contexto global del perfil: carga única, sincronizado con `onAuthStateChange`; reemplaza a `GameClientWrapper` |
| ✅ Transiciones animadas | `template.tsx` con Framer Motion (fade + slide) en cada navegación; prefetch en todos los enlaces |
| ✅ Proxy actualizado | Protege `/game` **y** `/admin` con redirect server-side a `/auth/login` |
| ✅ Header con navegación | Enlaces Jugar/Admin (este último solo para admins, badge 👑), marca clickeable, sign-out del contexto |
| ✅ Calidad de código | `npm run lint` sin errores; `npx tsc` limpio; `npm run build -- --webpack` pasando (tipado de `BeforeInstallPromptEvent`, `HTMLMotionProps`, confetti fuera del render, etc.) |

---

## 📌 Estado de la configuración (27 jul 2026, tarde)

### Supabase — proyecto `vsqizqujohptohrjjtqy`

| Tarea | Estado | Detalle |
|-------|:------:|---------|
| Crear proyecto en Supabase | ✅ | `https://vsqizqujohptohrjjtqy.supabase.co` |
| Credenciales en `.env.local` | ✅ | URL + anon key (publishable) configuradas y conexión verificada |
| **Ejecutar migraciones SQL** | 🔴 **BLOQUEANTE** | Las tablas NO existen aún (verificado por API: `PGRST205`). En el **SQL Editor** del dashboard correr **en orden**: 1) `supabase/migrations/001_game_tables.sql` y 2) `supabase/migrations/002_admin_role.sql` (copiar y pegar el contenido de cada archivo → Run) |
| Desactivar "Confirm email" | 🔴 Requerido para el usuario de prueba | Está ACTIVADA (verificado). Dashboard → **Auth → Sign In / Providers → Email → desactivar "Confirm email"**. Sin esto, cada registro exige confirmar un correo real |
| Crear usuario de prueba (jugador) | ⬜ Bloqueado por los 2 puntos anteriores | En cuanto estén las migraciones + confirm email off, se crea vía API y se verifica el login (queda con $100 demo) |
| Crear el usuario admin | ⬜ Bloqueado por migraciones | Registrar la cuenta y promover con `UPDATE ... SET role='admin'` (SQL en la migración 002 y el README) |
| Google OAuth (opcional) | ⬜ | Está desactivado (verificado). Auth → Providers → Google + credenciales de Google Cloud Console |
| URLs de producción en Auth | ⬜ | Auth → URL Configuration: Site URL + Redirect `https://<dominio-producción>/auth/callback` (poner la URL final de Vercel) |

### Vercel — proyecto `formula-taller/llave-mental`

| Tarea | Estado | Detalle |
|-------|:------:|---------|
| Proyecto creado y vinculado | ✅ | Creado vía CLI (`vercel link`). Nota: se llamó `llave-mental`; no hace falta crear otro proyecto "llaveMental" a mano — sería un duplicado |
| Variables de entorno | ✅ | `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Production y Preview |
| Deploy a producción | ✅ | ● Ready: `https://llave-mental-eupdgd35o-formula-taller.vercel.app` (se corrigieron `outputFileTracingRoot` y el flag `--webpack` del build) |
| Repo en GitHub | ⬜ | El código ya está commiteado en git local (rama `main`). Falta: crear el repo en github.com (ej. `llaveMental`), hacer `git remote add origin <url>` + `git push -u origin main`, y conectarlo al proyecto Vercel (`npx vercel git connect` o dashboard → Settings → Git) para auto-deploys en cada push |

### Local

| Tarea | Estado | Detalle |
|-------|:------:|---------|
| Servidor de desarrollo | ✅ | Corriendo en `http://localhost:3001` (el puerto 3000 está ocupado por otro proceso) |
| Build + lint + tsc | ✅ | Sin errores |

---

## 🔴 Pendiente — Lo que falta por hacer

> Lo bloqueante está arriba en "Estado de la configuración". Lo de abajo son features y mejoras.

---

### 3. Historial de partidas

| Tarea | Detalle |
|-------|---------|
| ⬜ Página `/history` | Tabla con las últimas N partidas del jugador: fecha, llaves usadas, premio |
| ⬜ Endpoint `GET /api/history` | Query a `game_history` ordenado por `created_at DESC` con paginación |
| ⬜ Enlace en el Header | Botón "Mis partidas" junto al wallet badge |

---

### 4. Recarga de créditos

| Tarea | Detalle |
|-------|---------|
| ⬜ Botón "Recargar saldo" | Cuando el saldo llega a $0, mostrar opción de recargar $100 de demo |
| ⬜ Endpoint `POST /api/reload-balance` | Acredita créditos demo, con rate-limit por usuario (ej. 1 recarga cada 24h) |
| ⬜ Integración de pagos real (opcional) | Si se monetiza: integrar Stripe Checkout para comprar créditos reales |

---

### 5. Deuda técnica

| Tarea | Detalle |
|-------|---------|
| ⬜ Actualizar Node.js a v22+ | El motor actual (v20.13) genera warnings de versión en Supabase JS y ESLint. Node 22 LTS resuelve todo sin cambiar código |
| ⬜ Migrar `next-pwa` → `@ducanh2912/next-pwa` | El paquete `next-pwa` original está abandonado. La fork mantenida es `@ducanh2912/next-pwa` y tiene soporte para Next.js 15/16 |
| ⬜ Reemplazar `next.config.js` → `next.config.ts` | Cuando se migre a una versión de `next-pwa` compatible con ESM/TypeScript |
| ⬜ Atomicidad en `buy-ticket` | Reemplazar las dos escrituras secuenciales (session + balance) por una función `SECURITY DEFINER` en Supabase para hacerlo atómico |
| ⬜ Expirar sesiones `ACTIVE` antiguas | Un cron job (ej. Supabase Edge Function) que marque como `EXPIRED` sesiones con más de 24h sin completarse |
| ⬜ Escribir tests unitarios del RNG | Validar que `simulateRTP(1_000_000)` da resultado entre 0.975 y 0.985 |

---

### 6. UX / Diseño (mejoras opcionales)

| Tarea | Detalle |
|-------|---------|
| ⬜ Animación de "llave volando" hacia la cerradura | Actualmente la llave cambia de estado in-place. Mejorar con una trayectoria animada real hacia el SVG de la cerradura |
| ⬜ Sonidos de mayor calidad | Reemplazar los tonos de Web Audio API con archivos `.mp3` reales (lock click, metal scrape, coins) |
| ⬜ Partículas de polvo dorado en victoria | Agregar efecto de partículas doradas emanando de la cerradura al abrirse |
| ⬜ Animación de la llave correcta girando en la cerradura | Tween del SVG de la llave rotando dentro del keyhole antes de que se abra |
| ⬜ Responsive mobile mejorado | Revisar layout en pantallas < 360px (gama baja) |
| ⬜ Modo oscuro / claro | Actualmente solo dark mode; agregar soporte para `prefers-color-scheme: light` |

---

### 7. Producción (post-deploy, opcionales)

> El deploy en sí y sus env vars están en la sección **"Deploy en Vercel"** de arriba.

| Tarea | Detalle |
|-------|---------|
| ⬜ Agregar dominio personalizado | Vercel → Project → Domains |
| ⬜ Configurar `outputFileTracingRoot` correctamente | Ajustar la ruta en `next.config.js` según la estructura final del servidor de producción |
| ⬜ Variables de entorno en CI/CD | Si se usa GitHub Actions u otro pipeline, agregar las env vars como secrets |
| ⬜ Monitoreo de errores | Integrar Sentry o similar para capturar errores del servidor en producción |
| ⬜ Analíticas | Integrar Vercel Analytics o Plausible para métricas de uso y RTP real |
