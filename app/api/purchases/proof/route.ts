import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// Comprobante de pago OPCIONAL de una compra de tickets: el jugador
// adjunta la captura del Pago Móvil y se guarda en el bucket PRIVADO
// payment-proofs, en la carpeta de la compra. El admin lo ve en el
// panel (URL firmada). No afecta la validación automática.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    if (!isAdminClientConfigured()) {
      return NextResponse.json({ error: 'No configurado' }, { status: 503 });
    }

    const form = await req.formData();
    const file = form.get('file');
    const purchaseId = String(form.get('purchase_id') ?? '');
    if (!(file instanceof File) || !purchaseId) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'La imagen supera los 5 MB.' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Solo se permiten imágenes.' }, { status: 400 });
    }

    // La compra debe existir y ser del propio jugador (lectura con RLS)
    const { data: purchase } = await supabase
      .from('ticket_purchases')
      .select('id, player_id')
      .eq('id', purchaseId)
      .eq('player_id', user.id)
      .single();
    if (!purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });
    }

    const safeName = (file.name || 'comprobante')
      .replace(/[^\w.\-]+/g, '_')
      .slice(-80);
    const path = `${purchaseId}/${crypto.randomUUID()}_${safeName}`;

    const admin = createAdminClient();
    const { error } = await admin.storage
      .from('payment-proofs')
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });
    if (error) {
      console.error('proof upload error:', error);
      return NextResponse.json({ error: 'No se pudo subir la imagen' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, path });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
