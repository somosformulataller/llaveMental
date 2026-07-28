# 🗝️ La Llave Correcta

Juego web PWA tipo scratch-card con mecánica pre-determinada (server-authoritative). El jugador paga $2 por ticket para intentar abrir una cerradura con 10 llaves. El resultado está fijado por el servidor al momento de comprar el ticket — las elecciones del usuario solo desencadenan la narrativa.

**Stack:** Next.js 16 · Supabase · React Three Fiber (three.js) · Framer Motion · next-pwa · TypeScript

**Experiencia 3D medieval:** la pantalla de juego es una escena 3D (React Three Fiber) — mazmorra de piedra con antorchas, puerta de madera con cerradura de hierro forjado y 10 llaves doradas flotantes. Las llaves vuelan al ojo de la cerradura al elegirlas: si fallan se rompen y caen; si aciertan giran, la puerta se abre y revela la sala del tesoro. Los componentes viven en `components/game/three/` y three.js se carga en un chunk aparte solo en el cliente (`next/dynamic`, `ssr: false`).

**Arquitectura SPA:** las pantallas (`/`, `/game`, `/admin`) son páginas estáticas pre-renderizadas con navegación cliente instantánea — el Header y el shell persisten entre pantallas (route group `(main)`), las transiciones las hace Framer Motion (`template.tsx`) y el perfil del jugador vive en un contexto global (`PlayerProvider`) que se carga una sola vez.

**Perfiles:** hay dos roles — `player` (registro normal desde la app) y `admin` (se promueve por base de datos, ver abajo). El admin tiene un panel en `/admin` con métricas en vivo, lista de jugadores y últimas partidas.

---

## Inicio rápido

### 1. Variables de entorno

Copia el archivo de ejemplo y rellena tus credenciales de Supabase:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### 2. Inicializar base de datos

En el **SQL Editor** de tu dashboard de Supabase, ejecuta **en orden**:

```
supabase/migrations/001_game_tables.sql   -- tablas, RLS, trigger de registro
supabase/migrations/002_admin_role.sql    -- rol admin + políticas de lectura
```

### 2.1 Crear el administrador

El admin no se registra como admin desde la app: primero crea su cuenta normalmente (email/password en `/auth/login`) y luego promuévelo en el SQL Editor:

```sql
UPDATE public.players
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@tudominio.com');
```

Al iniciar sesión, el admin es redirigido automáticamente a `/admin`.

### 3. Correr en desarrollo

```bash
npm install
npm run dev -- --webpack
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

### 4. Build de producción

```bash
npm run build
npm start
```

### 5. Deploy en Vercel

```bash
npx vercel --prod
```

Recuerda agregar las variables de entorno en el dashboard de Vercel
(**Project → Settings → Environment Variables**):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Y en Supabase (**Auth → URL Configuration**) agrega la URL de producción:

- Site URL: `https://tu-app.vercel.app`
- Redirect URL: `https://tu-app.vercel.app/auth/callback`

---

## Estado del proyecto (28 jul 2026)

**Hecho:** juego completo (RNG server-authoritative, sonido), **experiencia 3D medieval** (mazmorra, puerta, cerradura y llaves en React Three Fiber, tipografía Cinzel), login/registro de jugador (email/contraseña), rol admin con panel `/admin` (métricas en vivo, RTP real, jugadores, partidas), redirección por rol, arquitectura SPA (pantallas estáticas instantáneas, shell persistente, transiciones animadas), PWA (manifest + service worker + banner de instalación). `lint`, `tsc` y `build` pasan sin errores.

**Configurado:** proyecto Supabase con migraciones `001` + `002` ejecutadas y "Confirm email" desactivado · credenciales en `.env.local` (conexión verificada) · **usuario de prueba jugador**: `jugador.prueba.llave@gmail.com` / `Prueba123!` (login verificado, $100 demo) · repo en GitHub `somosformulataller/llaveMental` (rama `master`) conectado a Vercel con auto-deploy en cada push · **producción ● Ready: `https://llave-mental.vercel.app`** · servidor local en `http://localhost:3001`.

**Falta:** crear el usuario admin (registrarse y promover por SQL) y configurar las URLs de producción en Supabase Auth. El detalle completo está en "Estado de la configuración" del [plan](./IMPLEMENTATION_PLAN.md).

---

## Documentación

- 📋 [Plan de Implementación](./IMPLEMENTATION_PLAN.md) — Arquitectura SPA, base de datos y roles, RNG, endpoints (incl. panel admin), seguridad, plan de verificación y checklist de pendientes.

---

## Modelo matemático (RTP 98%)

| Premio | Fallos | Probabilidad |
|--------|--------|-------------|
| $0     | 5      | 34%         |
| $2     | 4      | 46%         |
| $4     | 3      | 12%         |
| $6     | 2      | 5%          |
| $8     | 1      | 2%          |
| $10    | 0      | 1%          |

**EV = $1.96 por ticket de $2.00 → RTP 98%**
