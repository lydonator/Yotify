import { useLibrary } from '@/state/libraryStore'
import { useDownloader } from '@/state/downloaderStore'
import { Download, Check } from './icons'
import type { Track } from '@shared/types'

/** Download a track for offline play. Shows a check when saved, a pulse while
 * downloading, and a download glyph otherwise. */
export function DownloadButton({ track, size = 16 }: { track: Track; size?: number }) {
  const downloaded = useLibrary((s) => !!s.getDownload(track))
  const downloading = useDownloader((s) => s.isDownloading(track))
  const download = useDownloader((s) => s.download)

  if (downloaded)
    return (
      <span className="grid h-8 w-8 place-items-center text-emerald-400" title="Saved offline">
        <Check width={size} height={size} />
      </span>
    )

  return (
    <button
      className={`btn-ghost h-8 w-8 ${downloading ? 'animate-pulse text-accent' : ''}`}
      title={downloading ? 'Downloading…' : 'Download for offline'}
      disabled={downloading}
      onClick={() => void download(track)}
    >
      <Download width={size} height={size} />
    </button>
  )
}
