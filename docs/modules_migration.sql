-- ============================================================
-- الأقسام الجديدة: الرئيسية، المحطات، الإعدادات — + منع أقسام ما يسمح فيها الدور (من القاعدة)
-- شغّل قبل رفع الكود (وإلا تختفي "الرئيسية" عن الحسابات اللي عندها قائمة أقسام محددة)
-- ============================================================

-- 1) كل حساب/مسمى عنده قائمة أقسام محددة ياخذ "الرئيسية" (كان دايماً ظاهر)
update users set allowed_modules = allowed_modules || array['home']
 where allowed_modules is not null and not ('home' = any(allowed_modules));
update custom_titles set allowed_modules = allowed_modules || array['home']
 where allowed_modules is not null and not ('home' = any(allowed_modules));

-- 2) الأدمن (بدون مسمى مخصص) اللي عنده قائمة محددة ياخذ المحطات والإعدادات (كانت دايماً ظاهرة له)
update users set allowed_modules = allowed_modules || array['stations']
 where allowed_modules is not null and custom_title_id is null
   and role::text in ('general_admin','stations_executive_director','assistant_stations_executive_director')
   and not ('stations' = any(allowed_modules));
update users set allowed_modules = allowed_modules || array['settings']
 where allowed_modules is not null and custom_title_id is null
   and role::text in ('general_admin','stations_executive_director','assistant_stations_executive_director')
   and not ('settings' = any(allowed_modules));

-- 3) القسم ما يسمح فيه الدور = ممنوع من القاعدة (يُشال تلقائياً عند أي حفظ)
create or replace function module_allowed_for(p_role text, p_mod text, p_row jsonb)
returns boolean language sql immutable as $$
  select (case
      when p_role in ('general_admin','stations_executive_director','assistant_stations_executive_director') then true
      when p_mod = 'reports'    then p_role in ('station_admin','area_supervisor','accountant')
      when p_mod = 'evaluation' then p_role in ('station_admin','area_supervisor','shift_supervisor')
      when p_mod in ('users','map') then p_role in ('station_admin','area_supervisor')
      when p_mod in ('customer_ratings','stations','settings','magazine') then false
      else true
    end)
    and (p_row is null
         or jsonb_typeof(p_row->'modules') is distinct from 'array'
         or jsonb_exists(p_row->'modules', p_mod))
$$;

create or replace function enforce_role_modules()
returns trigger language plpgsql security definer set search_path = public as $$
declare rp jsonb;
begin
  if new.allowed_modules is null then return new; end if;
  select permissions into rp from role_permissions where role = new.role::text;
  if new.custom_title_id is not null then rp := null; end if;
  new.allowed_modules := coalesce(
    (select array_agg(m) from unnest(new.allowed_modules) m where module_allowed_for(new.role::text, m, rp)),
    '{}'::text[]);
  return new;
end $$;

drop trigger if exists trg_enforce_role_modules on users;
create trigger trg_enforce_role_modules
  before insert or update of allowed_modules, role, custom_title_id on users
  for each row execute function enforce_role_modules();
