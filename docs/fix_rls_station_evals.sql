-- ══════════════════════════════════════════════
-- إصلاح سياسات RLS لجداول التقييم
-- كانت تشير إلى جدول profiles بدلاً من users
-- ══════════════════════════════════════════════

-- ── إزالة السياسات القديمة ─────────────────────
DROP POLICY IF EXISTS "employee reads own eval"      ON employee_evaluations;
DROP POLICY IF EXISTS "evaluator reads own"          ON employee_evaluations;
DROP POLICY IF EXISTS "admin reads all evals"        ON employee_evaluations;
DROP POLICY IF EXISTS "evaluators insert"            ON employee_evaluations;
DROP POLICY IF EXISTS "evaluators update own"        ON employee_evaluations;

DROP POLICY IF EXISTS "admin reads station evals"    ON station_evaluations;
DROP POLICY IF EXISTS "admin inserts station evals"  ON station_evaluations;
DROP POLICY IF EXISTS "admin updates station evals"  ON station_evaluations;

-- ── سياسات تقييم الموظفين ──────────────────────

CREATE POLICY "employee reads own eval"
  ON employee_evaluations FOR SELECT
  USING (employee_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "evaluator reads own"
  ON employee_evaluations FOR SELECT
  USING (evaluator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "admin reads all evals"
  ON employee_evaluations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'general_admin')
  );

CREATE POLICY "evaluators insert"
  ON employee_evaluations FOR INSERT
  WITH CHECK (
    evaluator_id = (SELECT id FROM users WHERE auth_id = auth.uid()) AND
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid()
        AND role IN ('general_admin','station_admin','shift_supervisor','area_supervisor')
    )
  );

CREATE POLICY "evaluators update own"
  ON employee_evaluations FOR UPDATE
  USING (evaluator_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (evaluator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── سياسات تقييم المحطات ───────────────────────

CREATE POLICY "admin reads station evals"
  ON station_evaluations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'general_admin')
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid()
        AND role IN ('station_admin','area_supervisor')
        AND station_id = station_evaluations.station_id
    )
  );

CREATE POLICY "admin inserts station evals"
  ON station_evaluations FOR INSERT
  WITH CHECK (
    evaluator_id = (SELECT id FROM users WHERE auth_id = auth.uid()) AND
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid()
        AND role IN ('general_admin','station_admin','area_supervisor')
    )
  );

CREATE POLICY "admin updates station evals"
  ON station_evaluations FOR UPDATE
  USING (evaluator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
