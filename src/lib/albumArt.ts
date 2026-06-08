// Album-art enrichment + dominant-color extraction.
//
// YouTube thumbnails work for display but are often letterboxed and not
// CORS-enabled (so we can't sample pixels). The free iTunes Search API gives
// clean square artwork from a CORS-friendly host (mzstatic), which we use both
// for nicer art and to extract a dominant color that themes the UI/visualizer.

export interface Artwork {
  url: string
  hiResUrl: string
  artist?: string
  album?: string
  collectionId?: number
}

export interface AlbumTrack {
  trackNumber: number
  title: string
  artist: string
  duration?: number
  thumbnail?: string
}

const artCache = new Map<string, Artwork | null>()
const colorCache = new Map<string, [number, number, number] | null>()
const albumCache = new Map<number, AlbumTrack[]>()

/** Look up square album art for a track via the iTunes Search API (no key).
 * When the playing track's duration is known we weight matches toward the
 * recording of the same length, so a 15-minute cue isn't matched to a 3-minute
 * abridged/harp version that happens to share the title. */
export async function fetchArtwork(
  title: string,
  artist?: string,
  duration?: number
): Promise<Artwork | null> {
  const key = `${artist ?? ''}|${title}|${duration ? Math.round(duration) : ''}`.toLowerCase()
  if (artCache.has(key)) return artCache.get(key)!

  interface SongHit {
    trackName?: string
    artworkUrl100?: string
    artistName?: string
    collectionName?: string
    collectionId?: number
    trackTimeMillis?: number
  }

  // Candidate titles, cleanest first: quoted text, text before " - ", full clean.
  const candidates = [extractQuoted(title), beforeDash(title), title]
    .map(cleanForSearch)
    .filter((t, i, a) => t && a.indexOf(t) === i)
  const cleanArtist = cleanForSearch(artist ?? '')

  // A few search terms; cap the number of network calls.
  const terms = [
    `${cleanArtist} ${candidates[0] ?? ''}`.trim(),
    candidates[0] ?? '',
    candidates[1] ?? '',
    `${cleanArtist} ${candidates[1] ?? ''}`.trim()
  ].filter((t, i, a) => t && a.indexOf(t) === i)

  let best: SongHit | null = null
  let bestScore = 0
  try {
    for (const term of terms) {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10`
      )
      if (!res.ok) continue
      const data = (await res.json()) as { results: SongHit[] }
      for (const r of data.results ?? []) {
        if (!r.artworkUrl100 || !r.collectionId) continue
        // Require the result's track title to actually match the playing track.
        let ts = 0
        for (const c of candidates) ts = Math.max(ts, titleScore(c, r.trackName ?? ''))
        if (ts === 0) continue
        const artistBonus = artistOverlap(artist, r.artistName) ? 1 : 0
        const itunesSec = r.trackTimeMillis ? r.trackTimeMillis / 1000 : undefined
        const score = ts * 2 + artistBonus + durationScore(duration, itunesSec)
        if (score > bestScore) {
          bestScore = score
          best = r
        }
      }
      // Strong title + artist + matching length — no need to keep searching.
      if (bestScore >= (duration ? 9 : 6)) break
    }
    // Accept only a strong title match (>=2) so we never show an unrelated album.
    if (best && bestScore >= 4 && best.artworkUrl100) {
      const art: Artwork = {
        url: best.artworkUrl100.replace('100x100bb', '300x300bb'),
        hiResUrl: best.artworkUrl100.replace('100x100bb', '600x600bb'),
        artist: best.artistName,
        album: best.collectionName,
        collectionId: best.collectionId
      }
      artCache.set(key, art)
      return art
    }
    artCache.set(key, null)
    return null
  } catch {
    artCache.set(key, null)
    return null
  }
}

const NOISE = new Set([
  'the', 'a', 'an', 'of', 'on', 'in', 'to', 'and', 'for', 'with', 'feat', 'ft', 'by',
  'official', 'video', 'audio', 'lyrics', 'lyric', 'visualizer', 'hd', 'hq', '4k', '8k',
  'remaster', 'remastered', 'explicit', 'mv', 'from', 'theme', 'soundtrack', 'ost',
  'original', 'motion', 'picture', 'duet', 'version', 'edit', 'radio'
])

function normLite(s?: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
function sigTok(s?: string): string[] {
  return normLite(s).split(' ').filter((w) => w.length > 1 && !NOISE.has(w))
}

/** How well a candidate title matches a result's track title (0 / 2 / 3). */
function titleScore(candidate: string, trackName: string): number {
  const c = normLite(candidate)
  const r = normLite(trackName)
  if (!c || !r) return 0
  if (c === r) return 3
  const ct = sigTok(candidate)
  const rt = sigTok(trackName)
  if (!ct.length || !rt.length) return 0
  const [shorter, longerArr] = ct.length <= rt.length ? [ct, rt] : [rt, ct]
  const longer = new Set(longerArr)
  // Need at least two shared significant words so short titles don't false-match.
  if (shorter.length >= 2 && shorter.every((t) => longer.has(t))) return 2
  return 0
}

/**
 * Compare the playing track's length to a candidate's. Close lengths boost the
 * score; very different lengths (a different arrangement/edit of the same piece)
 * push it below the acceptance threshold. Neutral (0) when either is unknown.
 */
function durationScore(playSec?: number, itunesSec?: number): number {
  if (!playSec || !itunesSec) return 0
  const diff = Math.abs(playSec - itunesSec)
  if (diff <= 8) return 3 // essentially the same recording
  if (diff <= 20) return 1
  if (diff <= 45) return 0
  if (diff <= 90) return -2
  return -4 // clearly a different-length version — likely the wrong album
}

function artistOverlap(a: string | undefined, b: string | undefined): boolean {
  const at = sigTok(a)
  const bt = new Set(sigTok(b))
  return at.some((t) => bt.has(t))
}

function extractQuoted(title: string): string {
  const m = title.match(/['"“”‘’]([^'"“”‘’]{2,}?)['"“”‘’]/)
  return m ? m[1] : ''
}
function beforeDash(title: string): string {
  return title.split(/\s[-–—]\s/)[0]
}

/** Strip common YouTube-title noise so iTunes can match the track. */
function cleanForSearch(s: string): string {
  return s
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // (Official Video), [HD], etc.
    .replace(/\b(official|music)?\s*(video|audio|visualizer|lyric video|lyrics?)\b/gi, ' ')
    .replace(/\b(hd|hq|4k|8k|remaster(ed)?|explicit|mv|m\/v)\b/gi, ' ')
    .replace(/\b(ft|feat|featuring)\.?\b.*$/i, ' ') // drop "feat ..." tail
    .replace(/[-–—|•·:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fetch the full tracklist for an album (iTunes collection lookup, no key). */
export async function fetchAlbumTracks(collectionId: number): Promise<AlbumTrack[]> {
  if (albumCache.has(collectionId)) return albumCache.get(collectionId)!
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200`)
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as {
      results: {
        wrapperType?: string
        kind?: string
        trackNumber?: number
        trackName?: string
        artistName?: string
        trackTimeMillis?: number
        artworkUrl100?: string
      }[]
    }
    const tracks: AlbumTrack[] = data.results
      .filter((r) => r.wrapperType === 'track' && r.kind === 'song' && r.trackName)
      .map((r) => ({
        trackNumber: r.trackNumber ?? 0,
        title: r.trackName!,
        artist: r.artistName ?? '',
        duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : undefined,
        thumbnail: r.artworkUrl100?.replace('100x100bb', '200x200bb')
      }))
      .sort((a, b) => a.trackNumber - b.trackNumber)
    albumCache.set(collectionId, tracks)
    return tracks
  } catch {
    return []
  }
}

/**
 * Extract a vivid dominant color from an image URL. Samples a downscaled copy
 * and picks the average of the most saturated/bright pixels. Returns null if
 * the image can't be sampled (e.g. CORS-tainted) — callers should fall back.
 */
export function extractColor(url: string): Promise<[number, number, number] | null> {
  if (colorCache.has(url)) return Promise.resolve(colorCache.get(url)!)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 48
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        let r = 0
        let g = 0
        let b = 0
        let weight = 0
        for (let i = 0; i < data.length; i += 4) {
          const cr = data[i]
          const cg = data[i + 1]
          const cb = data[i + 2]
          const max = Math.max(cr, cg, cb)
          const min = Math.min(cr, cg, cb)
          const sat = max === 0 ? 0 : (max - min) / max
          // Weight toward saturated, mid/bright pixels; ignore near-black/white.
          const lum = max / 255
          if (lum < 0.12 || lum > 0.97) continue
          const w = sat * sat * (0.3 + lum) + 0.02
          r += cr * w
          g += cg * w
          b += cb * w
          weight += w
        }
        if (weight === 0) return resolve(null)
        const color: [number, number, number] = [
          Math.round(r / weight),
          Math.round(g / weight),
          Math.round(b / weight)
        ]
        colorCache.set(url, color)
        resolve(color)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
