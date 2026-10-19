// مكتبة أصوات النداء: المحطات ومقاطعها الجاهزة وحالة العبارات الثابتة
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { hasLatin } from '../../utils/arabizeStation'
import { AUDIO_BUCKET, PHRASE_DEFS } from '../../utils/callAudio'

export default function useCallLibrary() {
  const [stations, setStations] = useState([])
  const [clipsIndex, setClipsIndex] = useState(() => new Set())
  const [phraseClips, setPhraseClips] = useState({ intro: false, via: false })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [{ data: sts }, { data: stationFiles }, { data: phraseFiles }] = await Promise.all([
      supabase.from('stations').select('id, name_ar').order('name_ar'),
      supabase.storage.from(AUDIO_BUCKET).list('stations', { limit: 1000 }),
      supabase.storage.from(AUDIO_BUCKET).list('phrases', { limit: 10 }),
    ])
    setStations(sts ?? [])
    setClipsIndex(new Set((stationFiles ?? []).map(f => f.name.replace(/\.mp3$/, ''))))
    const names = new Set((phraseFiles ?? []).map(f => f.name))
    setPhraseClips({ intro: names.has('intro.mp3'), via: names.has('via.mp3') })
    setLoading(false)
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const stats = useMemo(() => {
    const total = stations.length
    return {
      total,
      arabic: stations.filter(s => !hasLatin(s.name_ar)).length,
      phrases: PHRASE_DEFS.filter(p => phraseClips[p.key]).length,
      clips: stations.filter(s => clipsIndex.has(s.id)).length,
    }
  }, [stations, clipsIndex, phraseClips])

  const markClip = useCallback(id => setClipsIndex(prev => new Set(prev).add(id)), [])
  const markPhrase = useCallback(key => setPhraseClips(prev => ({ ...prev, [key]: true })), [])
  const renameLocal = useCallback((id, name) => setStations(prev => prev.map(s => (s.id === id ? { ...s, name_ar: name } : s))), [])

  return { stations, clipsIndex, phraseClips, loading, stats, refresh, markClip, markPhrase, renameLocal }
}
