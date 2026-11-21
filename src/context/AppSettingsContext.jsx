import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const THEMES = {
  bw:     { '--brand-900':'#0a0a0a','--brand-800':'#111111','--brand-700':'#1a1a1a','--brand-600':'#2a2a2a','--surface':'#f5f5f5','--card':'#ffffff','--border':'#e5e5e5','--text-1':'#0a0a0a','--text-2':'#444444','--text-3':'#888888', sidebar:'#0a0a0a' },
  navy:   { '--brand-900':'#0f2042','--brand-800':'#1b3a6b','--brand-700':'#1e4080','--brand-600':'#2a5298','--surface':'#f0f4ff','--card':'#ffffff','--border':'#dce6f5','--text-1':'#0f2042','--text-2':'#2a4a7a','--text-3':'#7a96c0', sidebar:'#0f2042' },
  forest: { '--brand-900':'#1a3a2a','--brand-800':'#2d6a4f','--brand-700':'#3a8a62','--brand-600':'#40916c','--surface':'#f0faf4','--card':'#ffffff','--border':'#d0eedd','--text-1':'#1a3a2a','--text-2':'#2d6a4f','--text-3':'#74b89a', sidebar:'#1a3a2a' },
  slate:  { '--brand-900':'#1e293b','--brand-800':'#334155','--brand-700':'#475569','--brand-600':'#64748b','--surface':'#f1f5f9','--card':'#ffffff','--border':'#e2e8f0','--text-1':'#0f172a','--text-2':'#334155','--text-3':'#94a3b8', sidebar:'#1e293b' },
  coffee: { '--brand-900':'#2c1a0e','--brand-800':'#5c3317','--brand-700':'#7a4422','--brand-600':'#9b6644','--surface':'#fdf6f0','--card':'#ffffff','--border':'#eeddd0','--text-1':'#2c1a0e','--text-2':'#5c3317','--text-3':'#b08060', sidebar:'#2c1a0e' },
}

export function applyTheme(id) {
  const t = THEMES[id] || THEMES.bw
  const root = document.documentElement
  Object.entries(t).forEach(([k, v]) => { if (k.startsWith('--')) root.style.setProperty(k, v) })
}

const Ctx = createContext({})
export const useAppSettings = () => useContext(Ctx)

export function AppSettingsProvider({ children }) {
  const [settings, setSettings] = useState({ theme: 'bw', idle_enabled: 'true', idle_min: '3' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let off = false, channel = null, lastLoad = 0
    // الإعدادات محمية بـ RLS ولا تُقرأ قبل تسجيل الدخول: نعيد التحميل عند الدخول وتجديد الجلسة والرجوع للتطبيق،
    // وإلا من يسجّل دخوله (خصوصاً بداية يوم جديد) يبقى بإعدادات فاضية ولا تظهر له صفحة التقييم اليومي وغيرها
    const load = async () => {
      lastLoad = Date.now()
      const { data, error } = await supabase.from('app_settings').select('key,value')
      if (off) return
      if (!error && data?.length) {
        const map = Object.fromEntries(data.map(r => [r.key, r.value]))
        setSettings(map)
        applyTheme(map.theme || 'bw')
      }
      setLoading(false)
    }
    const subscribe = () => {
      if (channel) supabase.removeChannel(channel)
      channel = supabase.channel('app_settings_changes_' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, payload => {
          if (payload.new?.key) {
            setSettings(prev => {
              const updated = { ...prev, [payload.new.key]: payload.new.value }
              if (payload.new.key === 'theme') applyTheme(payload.new.value)
              return updated
            })
          }
        })
        .subscribe()
    }
    load(); subscribe()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        // نؤجل الطلب خارج معالج الحدث (توصية supabase-js لتجنب التعليق)
        setTimeout(() => { if (!off) { load(); if (event === 'SIGNED_IN') subscribe() } }, 0)
      }
    })
    // التطبيق يبقى مفتوحاً على أجهزة المحطات أياماً: عند الرجوع له بعد غياب نحدّث الإعدادات
    const onBack = () => { if (document.visibilityState !== 'hidden' && Date.now() - lastLoad > 5 * 60 * 1000) load() }
    document.addEventListener('visibilitychange', onBack)
    window.addEventListener('focus', onBack)
    window.addEventListener('online', load)

    return () => {
      off = true
      subscription?.unsubscribe()
      if (channel) supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onBack)
      window.removeEventListener('focus', onBack)
      window.removeEventListener('online', load)
    }
  }, [])

  async function saveSetting(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }))
    if (key === 'theme') applyTheme(value)
    await supabase.from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  }

  return (
    <Ctx.Provider value={{ settings, saveSetting, loading }}>
      {children}
    </Ctx.Provider>
  )
}
