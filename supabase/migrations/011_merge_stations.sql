-- دمج المحطات المكررة:
-- عمود merged_into يشير للمحطة الأساسية التي دُمجت فيها هذه المحطة.
-- رفع Excel يستخدمه لتوجيه أي اسم قديم (مكرر) إلى المحطة الأساسية تلقائياً،
-- حتى لا تعود المحطة المكررة للظهور مع كل رفع جديد.

ALTER TABLE stations ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES stations(id);

COMMENT ON COLUMN stations.merged_into IS 'المحطة الأساسية التي دُمجت فيها هذه المحطة (NULL = محطة أساسية)';
