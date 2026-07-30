import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';

interface RegisterBody {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  whatsapp: string;
  cedula: string;
  accepted: boolean;
}

// Registro SIN confirmación de email: el servidor crea la cuenta ya
// confirmada (email_confirm) y el cliente inicia sesión de inmediato.
// El trigger handle_new_user copia los datos al perfil del jugador.
export async function POST(req: NextRequest) {
  try {
    if (!isAdminClientConfigured()) {
      return NextResponse.json({ error: 'El registro no está configurado' }, { status: 503 });
    }

    const body: RegisterBody = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const firstName = String(body.first_name ?? '').trim();
    const lastName = String(body.last_name ?? '').trim();
    const whatsapp = String(body.whatsapp ?? '').trim();
    const cedula = String(body.cedula ?? '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Escribe un correo válido' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }
    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'Escribe tu nombre y apellido' }, { status: 400 });
    }
    if (!/^[\d+]{7,15}$/.test(whatsapp)) {
      return NextResponse.json({ error: 'Escribe un WhatsApp válido' }, { status: 400 });
    }
    if (cedula.length < 5 || cedula.length > 15) {
      return NextResponse.json({ error: 'Escribe una cédula válida' }, { status: 400 });
    }
    if (body.accepted !== true) {
      return NextResponse.json(
        { error: 'Debes aceptar los términos y condiciones para registrarte.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // cuenta confirmada: entra sin revisar el correo
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        whatsapp,
        cedula,
        accepted_terms: 'true',
      },
    });

    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('already') || error.code === 'email_exists') {
        return NextResponse.json({ error: 'Este email ya está registrado.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'No se pudo crear la cuenta' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
