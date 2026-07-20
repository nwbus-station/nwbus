-- إصلاح سياسة القراءة للإيرادات — الموظف يشوف كل ما أدخله حتى بعد تأكيد المحاسب
DROP POLICY IF EXISTS "sales_select" ON sales_records;

CREATE POLICY "sales_select" ON sales_records
  FOR SELECT USING (
    current_user_role() = 'general_admin'
    OR (current_user_role() IN ('accountant', 'station_admin') AND station_id = current_user_station_id())
    OR created_by = current_user_id()
  );
