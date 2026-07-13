-- ==========================================
-- SCRIPT DE BASE DE DATOS: TORNEO MENTAL
-- ==========================================

-- 1. TABLAS
-- ---------

-- Tabla Profiles (Extendiendo auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  cedula TEXT NOT NULL UNIQUE,
  tickets_balance INTEGER DEFAULT 0,
  role TEXT DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla Tournaments (Torneos creados por Admin)
CREATE TABLE tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  card_theme TEXT DEFAULT 'aleatorio',
  card_count INTEGER DEFAULT 14,
  status TEXT DEFAULT 'programado' CHECK (status IN ('borrador', 'programado', 'activo', 'finalizado')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla Tickets (Historial de compra/recarga de tickets)
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL, -- Puede ser null si es recarga general
  quantity INTEGER NOT NULL,
  amount_usd DECIMAL(10,2) NOT NULL,
  payment_reference TEXT NOT NULL,
  payment_status TEXT DEFAULT 'pendiente' CHECK (payment_status IN ('pendiente', 'validando', 'aprobado', 'rechazado')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla Games (Partidas jugadas por ticket)
CREATE TABLE games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  best_streak INTEGER DEFAULT 0,
  total_pairs_matched INTEGER DEFAULT 0,
  total_time_ms BIGINT DEFAULT 0,
  card_layout JSONB, -- Historial opcional de las cartas
  status TEXT DEFAULT 'en_curso' CHECK (status IN ('en_curso', 'completado', 'perdido')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- 2. VISTAS Y FUNCIONES
-- ---------------------

-- Vista para Ranking (Mejor racha por usuario y torneo)
CREATE OR REPLACE VIEW tournament_rankings AS
SELECT 
  g.tournament_id,
  g.user_id,
  p.nombre AS user_nombre,
  p.apellido AS user_apellido,
  MAX(g.best_streak) AS best_streak,
  MIN(g.total_time_ms) AS best_time_ms,
  RANK() OVER (
    PARTITION BY g.tournament_id 
    ORDER BY MAX(g.best_streak) DESC, MIN(g.total_time_ms) ASC
  ) as posicion
FROM games g
JOIN profiles p ON p.id = g.user_id
GROUP BY g.tournament_id, g.user_id, p.nombre, p.apellido;

-- Trigger para crear profile al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, apellido, email, whatsapp, cedula)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'nombre',
    new.raw_user_meta_data->>'apellido',
    new.email,
    new.raw_user_meta_data->>'whatsapp',
    new.raw_user_meta_data->>'cedula'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 3. SEGURIDAD RLS (Row Level Security)
-- -------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Políticas Profiles
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Políticas Tournaments
CREATE POLICY "Tournaments viewable by everyone" ON tournaments FOR SELECT USING (true);
CREATE POLICY "Admins can manage tournaments" ON tournaments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Políticas Tickets
CREATE POLICY "Users view own tickets" ON tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert tickets" ON tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all tickets" ON tickets FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Políticas Games
CREATE POLICY "Users view own games" ON games FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert games" ON games FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own games" ON games FOR UPDATE USING (auth.uid() = user_id);
