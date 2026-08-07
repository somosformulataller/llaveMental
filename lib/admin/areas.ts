// Áreas del panel de administración. Un admin sin restricciones
// (panel_areas NULL) ve todo; a un usuario de atención al cliente
// (role 'support') se le asignan áreas concretas al crearlo.
// Este módulo es compartido por el servidor (guard de las APIs)
// y el cliente (menú lateral del panel).

export type PanelArea =
  | 'resumen'
  | 'usuarios'
  | 'transacciones'
  | 'interacciones'
  | 'partidas'
  | 'chat'
  | 'equipo';

export const PANEL_AREAS: { key: PanelArea; label: string }[] = [
  { key: 'resumen', label: '📊 Resumen' },
  { key: 'usuarios', label: '👥 Usuarios' },
  { key: 'transacciones', label: '💳 Transacciones' },
  { key: 'interacciones', label: '📈 Interacciones' },
  { key: 'partidas', label: '🗝️ Partidas' },
  { key: 'chat', label: '💬 Chat' },
  { key: 'equipo', label: '🛡️ Equipo' },
];

export type StaffRole = 'admin' | 'support';

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role === 'admin' || role === 'support';
}

/** Áreas visibles para un miembro del staff. Admin sin restricciones →
    todas; support → solo las asignadas (Equipo es exclusivo de admins). */
export function allowedAreas(
  role: string | null | undefined,
  panelAreas: string[] | null | undefined
): PanelArea[] {
  if (!isStaffRole(role)) return [];
  const all = PANEL_AREAS.map((a) => a.key);
  if (role === 'admin') {
    if (!panelAreas || panelAreas.length === 0) return all;
    const set = new Set(panelAreas);
    return all.filter((a) => set.has(a));
  }
  // support: nunca gestiona el equipo; sin áreas asignadas solo chat
  const assigned = panelAreas && panelAreas.length > 0 ? panelAreas : ['chat'];
  const set = new Set(assigned);
  return all.filter((a) => a !== 'equipo' && set.has(a));
}

export function hasArea(
  role: string | null | undefined,
  panelAreas: string[] | null | undefined,
  area: PanelArea | PanelArea[]
): boolean {
  const allowed = new Set(allowedAreas(role, panelAreas));
  const wanted = Array.isArray(area) ? area : [area];
  return wanted.some((a) => allowed.has(a));
}
