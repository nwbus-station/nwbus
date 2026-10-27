import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { AuthProvider } from './context/AuthContext'
import { AppSettingsProvider } from './context/AppSettingsContext'
import App from './App'
import './i18n'
import './index.css'
import { initPwaUpdate } from './lib/pwaUpdate'
import { initChunkReload } from './lib/chunkReload'

// علامة منصة الأندرويد: تُفعّل تحسينات اللمس والرجوع الخاصة به فقط (الآيفون يبقى كما هو)
if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add('is-android')

initChunkReload()
initPwaUpdate()

/* مراقبة الأخطاء (Sentry) — تعمل فقط إذا ضُبط المفتاح في .env
   أي خطأ عند أي موظف يُلتقط تلقائياً بتفاصيله الكاملة */
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    sendDefaultPii: false,        // بدون بيانات شخصية
    tracesSampleRate: 0,          // أخطاء فقط (يحافظ على الحصة المجانية)
    environment: import.meta.env.MODE,
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppSettingsProvider>
          <App />
        </AppSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
