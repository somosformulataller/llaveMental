import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';

// Devuelve un enlace TEMPORAL firmado (1 hora) para ver un adjunto
// del chat. El bucket es privado: cada jugador solo accede a los
// archivos de su carpeta; el admin, a todos.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    if (!isAdminClientConfigured()) {
      return NextResponse.json({ error: 'El chat no está configurado' }, { status: 503 });
    }

    const path = req.nextUrl.searchParams.get('path') ?? '';
    if (!path || path.includes('..')) {
      return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 });
    }

    if (!path.startsWith(`${user.id}/`)) {
      const { data: me } = await supabase
        .from('players')
        .select('role')
        .eq('id', user.id)
        .single();
      if (me?.role !== 'admin') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      }
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from('chat-attachments')
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Adjunto no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
