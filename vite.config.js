import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

function getCommitHash() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getCommitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // نسجّل الـ SW يدوياً بـ src/lib/pwaUpdate.js عشان نقدر نعرض تنبيه تحديث بدل تحديث صامت
      includeAssets: ['bus-icon.svg'],
      manifest: {
        name: 'NW Station',
        short_name: 'NW Station',
        description: 'نظام تشغيل المحطات — نورث وست باص',
        start_url: '/',
        display: 'standalone',
        background_color: '#1C2B36',
        theme_color: '#1C2B36',
        orientation: 'portrait',
        lang: 'ar',
        dir: 'rtl',
        icons: [
          {
            src: '/bus-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // بدونها، أي نسخة جديدة من الـ Service Worker تظل "بانتظار" لحد ما يقفل المستخدم
        // كل تبويباته المفتوحة (نادراً ما يصير فعلياً) قبل ما تفعّل — وهذا السبب الحقيقي
        // وراء صعوبة وصول التحديثات حتى بعد أيام، حتى بإغلاق المتصفح جزئياً أو بالجوال
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            // بدون كاش نهائياً — بيانات الحسابات والصلاحيات والعمليات يجب أن تكون فريش دايماً
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
