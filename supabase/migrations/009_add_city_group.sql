-- حقل تجميع المدينة — محطات نفس المدينة تحمل نفس القيمة
ALTER TABLE stations ADD COLUMN IF NOT EXISTS city_group text;
