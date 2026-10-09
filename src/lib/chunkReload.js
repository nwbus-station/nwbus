/* بعد كل تحديث للبرنامج تتغيّر أسماء ملفات الأجزاء المحمّلة عند الطلب، فتفشل النسخة القديمة المفتوحة
   عند الموظف ("Failed to fetch dynamically imported module"). هنا نكتشف الفشل ونعيد تحميل الصفحة
   تلقائياً مرة واحدة لجلب النسخة الجديدة، بدل ما يظهر له خطأ. */
const KEY = 'nw_chunk_reload_at'

function recentlyReloaded() {
  try { return Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 15000 } catch { return false }
}

export function reloadForNewVersion() {
  if (recentlyReloaded()) return false
  try { sessionStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ }
  const done = () => window.location.reload()
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(rs => Promise.all(rs.map(r => r.update().catch(() => {}))))
      .catch(() => {}).finally(done)
  } else done()
  return true
}

export function isChunkError(e) {
  return /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(String(e?.message || e))
}

/** استبدال لـ import() الديناميكي: عند فشل الجزء القديم يعيد تحميل الصفحة مرة واحدة */
export async function safeImport(loader) {
  try { return await loader() } catch (e) {
    if (isChunkError(e) && reloadForNewVersion()) await new Promise(() => {}) // الصفحة ستُعاد
    throw e
  }
}

export function initChunkReload() {
  window.addEventListener('vite:preloadError', e => { if (reloadForNewVersion()) e.preventDefault() })
}
