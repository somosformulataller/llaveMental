import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ player: null });

    const { data: player } = await supabase
      .from('players')
      .select('*')
      .eq('id', user.id)
      .single();

    return NextResponse.json({ player });
  } catch {
    return NextResponse.json({ player: null });
  }
}
