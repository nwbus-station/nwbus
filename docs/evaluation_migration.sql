-- ══════════════════════════════════════════════
-- جداول نظام التقييم
-- ══════════════════════════════════════════════

-- تقييم الموظفين
CREATE TABLE IF NOT EXISTS employee_evaluations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_id  uuid NOT NULL REFERENCES profiles(id),
  employee_id   uuid NOT NULL REFERENCES profiles(id),
  station_id    uuid NOT NULL REFERENCES stations(id),
  eval_month    int  NOT NULL CHECK (eval_month BETWEEN 1 AND 12),
  eval_year     int  NOT NULL CHECK (eval_year >= 2024),
  scores        jsonb NOT NULL DEFAULT '{}',
  total_score   numeric(5,2),
  notes         text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (employee_id, eval_month, eval_year)
);

-- تقييم المحطات
CREATE TABLE IF NOT EXISTS station_evaluations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_id  uuid NOT NULL REFERENCES profiles(id),
  station_id    uuid NOT NULL REFERENCES stations(id),
  eval_month    int  NOT NULL CHECK (eval_month BETWEEN 1 AND 12),
  eval_year     int  NOT NULL CHECK (eval_year >= 2024),
  scores        jsonb NOT NULL DEFAULT '{}',
  total_score   numeric(5,2),
  notes         text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (station_id, eval_month, eval_year)
);

-- ── RLS ──────────────────────────────────────
ALTER TABLE employee_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_evaluations  ENABLE ROW LEVEL SECURITY;

-- الموظف يقرأ تقييمه فقط
CREATE POLICY "employee reads own eval"
  ON employee_evaluations FOR SELECT
  USING (employee_id = auth.uid());

-- المقيّم يقرأ ما أنشأه
CREATE POLICY "evaluator reads own"
  ON employee_evaluations FOR SELECT
  USING (evaluator_id = auth.uid());

-- الأدمن يقرأ الكل
CREATE POLICY "admin reads all evals"
  ON employee_evaluations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'general_admin')
  );

-- إدراج: الأدمن ومشرفو المحطة ومشرفو الوردية
CREATE POLICY "evaluators insert"
  ON employee_evaluations FOR INSERT
  WITH CHECK (
    evaluator_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('general_admin','station_admin','shift_supervisor')
    )
  );

-- تحديث: نفس الشروط
CREATE POLICY "evaluators update own"
  ON employee_evaluations FOR UPDATE
  USING (evaluator_id = auth.uid())
  WITH CHECK (evaluator_id = auth.uid());

-- تقييم المحطات: الأدمن فقط يقرأ ويكتب + station_admin يقرأ محطته
CREATE POLICY "admin reads station evals"
  ON station_evaluations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'general_admin')
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'station_admin' AND station_id = station_evaluations.station_id
    )
  );

CREATE POLICY "admin inserts station evals"
  ON station_evaluations FOR INSERT
  WITH CHECK (
    evaluator_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('general_admin','station_admin'))
  );

CREATE POLICY "admin updates station evals"
  ON station_evaluations FOR UPDATE
  USING (evaluator_id = auth.uid());
