import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // جلسة دائمة: الموظف يبقى مسجلاً بعد تحديث الصفحة وإغلاق المتصفح
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    // كان بعض التعديلات ما يظهر فوراً بالصفحات (زي تعديل موظف أو إضافة رحلة) إلا
    // بعد تحديث كامل للمتصفح — متصفحات معينة تكاش طلبات GET لنفس الرابط حتى بدون
    // ترويسة Cache-Control صريحة من السيرفر. نجبر كل طلب لسوبابيس يتجاوز كاش
    // المتصفح نهائياً بدل ما نحاول نتحكم بترويسة كل استعلام لحاله
    fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
  },
})
