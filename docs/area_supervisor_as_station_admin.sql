-- مشرف المنطقة = مشرف المحطة بالضبط على مستوى قاعدة البيانات:
-- سياسات RLS كلها تسأل current_user_role()، فنخليها ترجّع station_admin لمشرف المنطقة
-- (الدور الحقيقي في جدول users يبقى area_supervisor للعرض فقط).
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
  SELECT CASE WHEN role = 'area_supervisor' THEN 'station_admin'::user_role ELSE role END
  FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
