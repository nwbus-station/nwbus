-- ============================================================
-- صلاحيات الأدوار الأساسية القابلة للتعديل (موظف، محاسب، مشرف محطة/وردية/منطقة)
-- الأدمن العام غير قابل للتعديل — والتعديل من حساب الأدمن فقط (يفرضه RLS).
-- شغّل بعد title_permissions_rls.sql
-- ============================================================

create table if not exists public.role_permissions (
  role        text primary key check (role in ('station_employee','accountant','station_admin','shift_supervisor','area_supervisor')),
  permissions jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.role_permissions enable row level security;

drop policy if exists "role_perms_select" on public.role_permissions;
create policy "role_perms_select" on public.role_permissions for select using (auth.uid() is not null);

drop policy if exists "role_perms_write" on public.role_permissions;
create policy "role_perms_write" on public.role_permissions for all
  using (is_admin() and not is_restricted())
  with check (is_admin() and not is_restricted());

grant select on public.role_permissions to authenticated;
grant insert, update, delete on public.role_permissions to authenticated;
grant all on public.role_permissions to service_role;

-- صلاحية الحساب الحالي: مسماه المخصص أولاً، ثم إعدادات دوره الأساسي، ثم القيمة الافتراضية
create or replace function title_cap(k text, dflt boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (t.permissions->>k)::boolean
       from users u join custom_titles t on t.id = u.custom_title_id
      where u.auth_id = auth.uid()),
    (select (rp.permissions->>k)::boolean
       from users u join role_permissions rp on rp.role = u.role::text
      where u.auth_id = auth.uid()),
    dflt)
$$;

-- هل الحساب الحالي من الأدوار الأساسية القابلة للتقييد؟
create or replace function is_role_limited()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.role::text in ('station_employee','accountant','station_admin','shift_supervisor','area_supervisor')
    from users u where u.auth_id = auth.uid()
  ), false)
$$;
grant execute on function is_role_limited() to authenticated;

-- بيانات التقارير الحساسة: تُمنع من القاعدة لو الدور مقفول عليه التقرير وما عنده القسم المعني
drop policy if exists "rrole_sales_all" on sales_records;
create policy "rrole_sales_all" on sales_records as restrictive for all to authenticated using (
  not is_role_limited() or title_module('sales') or title_cap('reports_sales', true)
);

drop policy if exists "rrole_lost_all" on lost_found_items;
create policy "rrole_lost_all" on lost_found_items as restrictive for all to authenticated using (
  not is_role_limited() or title_module('lost_found') or title_cap('reports_lost', true)
);

drop policy if exists "rrole_audit_select" on audit_log;
create policy "rrole_audit_select" on audit_log as restrictive for select to authenticated using (
  not is_role_limited() or title_cap('reports_activity_log', true)
);

-- ─── سقف أقسام الدور (يُفرض من القاعدة أيضاً) ─────────────────
-- القسم لازم يكون ضمن أقسام الموظف، وضمن الأقسام المسموحة لدوره (permissions.modules) لو الدور محدَّد
create or replace function title_module(k text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select ((u.allowed_modules is null) or (k = any(u.allowed_modules)))
       and (
         u.custom_title_id is not null
         or rp.permissions is null
         or jsonb_typeof(rp.permissions->'modules') is distinct from 'array'
         or jsonb_exists(rp.permissions->'modules', k)
       )
    from users u
    left join role_permissions rp on rp.role = u.role::text
    where u.auth_id = auth.uid()
  ), false)
$$;
