-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Players profile table
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  balance DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  total_wagered DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_won DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Game sessions table (server-authoritative)
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  target_payout DECIMAL(10,2) NOT NULL,
  required_errors INT NOT NULL,
  errors_remaining INT NOT NULL,
  current_vault DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  keys_tried INT[] NOT NULL DEFAULT '{}',
  game_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (game_status IN ('ACTIVE', 'COMPLETED', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Game history (immutable log)
CREATE TABLE IF NOT EXISTS public.game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id),
  payout DECIMAL(10,2) NOT NULL,
  keys_tried_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;

-- Players: users can only see/edit their own row
CREATE POLICY "players_own" ON public.players
  FOR ALL USING (auth.uid() = id);

-- Game sessions: users can only see their own sessions
CREATE POLICY "sessions_own" ON public.game_sessions
  FOR ALL USING (auth.uid() = player_id);

-- Game history: users can only see their own history
CREATE POLICY "history_own" ON public.game_history
  FOR ALL USING (auth.uid() = player_id);

-- Function: auto-create player profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.players (id, username)
  VALUES (NEW.id, SPLIT_PART(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
