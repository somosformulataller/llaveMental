import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasArea, isStaffRole, PanelArea, StaffRole } from '@/lib/admin/areas';

export interface StaffContext {
  userId: string;
  role: StaffRole;
  panelAreas: string[] | null;
  /** true solo para el rol admin (support nunca) */
  isFullAdmin: boolean;
}

interface GuardResult {
  staff: StaffContext | null;
  error: NextResponse | null;
}

// Guard común de las APIs del panel: exige sesión de staff (admin o
// atención al cliente) y, si se indica, que su lista de áreas incluya
// al menos una de las pedidas. El rol y las áreas viven en players y
// solo se editan con la clave de servidor (área Equipo).
export async function requireStaff(area?: PanelArea | PanelArea[]): Promise<GuardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { staff: null, error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  const { data } = await supabase
    .from('players')
    .select('role, panel_areas')
    .eq('id', user.id)
    .maybeSingle();
  let me: { role: string | null; panel_areas: string[] | null } | null = data ?? null;

  if (!me) {
    // Base sin la migración 010 (columna panel_areas ausente): el
    // panel sigue funcionando solo con el rol.
    const { data: fallback } = await supabase
      .from('players')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (fallback) me = { role: fallback.role, panel_areas: null };
  }

  if (!isStaffRole(me?.role)) {
    return { staff: null, error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) };
  }

  const panelAreas = (me?.panel_areas as string[] | null) ?? null;
  if (area && !hasArea(me?.role, panelAreas, area)) {
    return {
      staff: null,
      error: NextResponse.json({ error: 'No tienes acceso a esta área del panel' }, { status: 403 }),
    };
  }

  return {
    staff: {
      userId: user.id,
      role: me!.role as StaffRole,
      panelAreas,
      isFullAdmin: me!.role === 'admin',
    },
    error: null,
  };
}
