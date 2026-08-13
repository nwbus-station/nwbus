-- جدول لحفظ تحديد محطات التقارير (محطات / محطات الوكلاء)
CREATE TABLE IF NOT EXISTS saved_station_groups (
  group_name  text NOT NULL,
  station_id  uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  PRIMARY KEY (group_name, station_id)
);

-- صلاحيات القراءة لكل المستخدمين المسجّلين
ALTER TABLE saved_station_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_saved_groups" ON saved_station_groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_saved_groups" ON saved_station_groups
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'general_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'general_admin')
  );
