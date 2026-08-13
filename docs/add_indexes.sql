-- ══════════════════════════════════════════════
-- Indexes لتسريع استعلامات التقييم
-- شغّله مرة واحدة في Supabase SQL Editor
-- ══════════════════════════════════════════════

-- تقييم الموظفين
CREATE INDEX IF NOT EXISTS idx_emp_eval_month_year
  ON employee_evaluations(eval_month, eval_year);

CREATE INDEX IF NOT EXISTS idx_emp_eval_employee_id
  ON employee_evaluations(employee_id);

CREATE INDEX IF NOT EXISTS idx_emp_eval_station_id
  ON employee_evaluations(station_id);

CREATE INDEX IF NOT EXISTS idx_emp_eval_evaluator_id
  ON employee_evaluations(evaluator_id);

-- تقييم المحطات
CREATE INDEX IF NOT EXISTS idx_stn_eval_month_year
  ON station_evaluations(eval_month, eval_year);

CREATE INDEX IF NOT EXISTS idx_stn_eval_station_id
  ON station_evaluations(station_id);

CREATE INDEX IF NOT EXISTS idx_stn_eval_evaluator_id
  ON station_evaluations(evaluator_id);
