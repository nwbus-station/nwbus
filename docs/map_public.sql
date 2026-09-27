-- الخريطة: قسم عام لكل الأدوار (تظهر لمن يُضاف له القسم)
create or replace function module_default(p_role text, p_mod text)
returns boolean language sql immutable as $$
  select case
    when p_mod = 'reports'    then p_role in ('station_admin','area_supervisor','accountant')
    when p_mod = 'evaluation' then p_role in ('station_admin','area_supervisor','shift_supervisor')
    when p_mod = 'users'      then p_role in ('station_admin','area_supervisor')
    when p_mod in ('customer_ratings','stations','settings','magazine') then false
    else true
  end
$$;

-- إعدادات الأدوار المحفوظة كانت تعطّل الخريطة صراحةً — نفعّلها لكل دور
update role_permissions
   set permissions = jsonb_set(permissions, '{module_access}',
         coalesce(permissions->'module_access', '{}'::jsonb) || '{"map": true}'::jsonb)
 where true;
