-- ورديات الإيرادات لكل محطة: null = الافتراضي العام من الإعدادات، وإلا مصفوفة أوقات نهاية الورديات بالدقائق (3 أو 4، آخرها 1440)
alter table stations add column if not exists shift_ends jsonb;
