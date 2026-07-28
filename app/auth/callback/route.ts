import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    // Redirección según rol: admin → panel, jugador → juego
    if (data?.user) {
      const { data: profile } = await supabase
        .from('players')
        .select('role')
        .eq('id', data.user.id)
        .single();
      if (profile?.role === 'admin') {
        return NextResponse.redirect(`${origin}/admin`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/game`);
}
