ALTER TABLE stations ADD COLUMN IF NOT EXISTS departure_only boolean DEFAULT false;

-- صالة 1 (مغادرة فقط - لا يُسجَّل وصول)
UPDATE stations SET departure_only = true WHERE id = 'd2a8380d-74f6-4a87-8783-087e81419cbf';

-- تعطيل arr_enabled لكل رحلات صالة 1 الحالية
UPDATE station_trips SET arr_enabled = false WHERE station_id = 'd2a8380d-74f6-4a87-8783-087e81419cbf';
