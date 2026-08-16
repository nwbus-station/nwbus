-- جداول نظام الإقلاع وإدارة الأمتعة

-- جلسة الإقلاع (واحدة لكل رحلة في كل محطة لكل يوم)
CREATE TABLE IF NOT EXISTS boarding_sessions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_schedule_id UUID NOT NULL,
  station_id       UUID NOT NULL,
  record_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  bus_number       TEXT,
  status           TEXT DEFAULT 'active' CHECK (status IN ('active','closed','departed')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       UUID REFERENCES auth.users(id),
  closed_at        TIMESTAMPTZ,
  closed_by        UUID REFERENCES auth.users(id),
  notes            TEXT,
  UNIQUE (trip_schedule_id, station_id, record_date)
);

-- ركاب الرحلة المركوبون
CREATE TABLE IF NOT EXISTS boarded_passengers (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES boarding_sessions(id) ON DELETE CASCADE,
  ticket_number   TEXT NOT NULL,
  passenger_name  TEXT,
  passenger_id    TEXT,
  origin          TEXT,
  destination     TEXT,
  seat_number     TEXT,
  fare_type       TEXT,
  raw_qr          TEXT,
  scanned_at      TIMESTAMPTZ DEFAULT NOW(),
  scanned_by      UUID REFERENCES auth.users(id),
  status          TEXT DEFAULT 'valid' CHECK (status IN ('valid','duplicate','manual','invalid')),
  notes           TEXT,
  UNIQUE (session_id, ticket_number)
);

-- أمتعة الرحلة
CREATE TABLE IF NOT EXISTS luggage_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES boarding_sessions(id) ON DELETE CASCADE,
  sticker_number  TEXT NOT NULL,
  ticket_number   TEXT,
  passenger_name  TEXT,
  bag_count       INTEGER DEFAULT 1,
  destination     TEXT,
  weight_kg       NUMERIC(6,2),
  registered_at   TIMESTAMPTZ DEFAULT NOW(),
  registered_by   UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE boarding_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read boarding_sessions"  ON boarding_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write boarding_sessions" ON boarding_sessions FOR ALL    TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE boarded_passengers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read boarded_passengers"  ON boarded_passengers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write boarded_passengers" ON boarded_passengers FOR ALL    TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE luggage_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read luggage_items"  ON luggage_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write luggage_items" ON luggage_items FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE boarding_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE boarded_passengers;
ALTER PUBLICATION supabase_realtime ADD TABLE luggage_items;
