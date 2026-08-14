-- جدول تقييمات المشرفين
CREATE TABLE IF NOT EXISTS supervisor_evaluations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  supervisor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_role text NOT NULL,
  station_id    uuid REFERENCES stations(id) ON DELETE SET NULL,
  eval_month    int NOT NULL CHECK (eval_month BETWEEN 1 AND 12),
  eval_year     int NOT NULL,
  scores        jsonb NOT NULL DEFAULT '{}',
  notes         text,
  total_score   numeric(5,1) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supervisor_id, eval_month, eval_year)
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_supeval_supervisor ON supervisor_evaluations(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supeval_month_year ON supervisor_evaluations(eval_month, eval_year);

-- RLS
ALTER TABLE supervisor_evaluations ENABLE ROW LEVEL SECURITY;

-- القراءة: المدير العام فقط
CREATE POLICY "supeval_select" ON supervisor_evaluations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid() AND role = 'general_admin'
    )
    OR supervisor_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- الكتابة: المدير العام فقط
CREATE POLICY "supeval_insert" ON supervisor_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid() AND role = 'general_admin'
    )
  );

CREATE POLICY "supeval_update" ON supervisor_evaluations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid() AND role = 'general_admin'
    )
  );
