-- أضف عمود survey_city لربط كل محطة بمدينة الاستبيان
ALTER TABLE stations ADD COLUMN IF NOT EXISTS survey_city text;

-- بعد تشغيل هذا، اذهب لجدول stations في Supabase وعبّئ
-- قيمة survey_city لكل محطة من القيم التالية:
-- Jeddah | Tabuk | Makkah | T1 | Hail | Riyadh | jazan | Taif | Madinah | Yanbu
