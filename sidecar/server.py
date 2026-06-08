"""
Yotify sidecar — a small local FastAPI server that the Electron app talks to.

Responsibilities:
  * YouTube search (via yt-dlp, no API key)
  * Audio delivery: yt-dlp + ffmpeg fetch/remux a track's audio into a cache file,
    which we serve to the renderer's <audio> element with HTTP range support.
    (YouTube now hands these clients HLS-only audio, which Chromium can't play
    directly and can't fetch cross-origin — so we proxy through here.)
  * Optional local downloads (same path, user-chosen folder + format)
  * Speech-to-text (faster-whisper, loaded lazily)

Binds to 127.0.0.1 on $YOTIFY_PORT, supervised by Electron (electron/sidecar.ts).
"""
import asyncio
import glob
import os
import tempfile
import threading
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from yt_dlp import YoutubeDL

from wake import WakeListener
from whisper_worker import WhisperPool

# Local Whisper runs in a child process (see whisper_worker) so we can fully
# release the GPU — CUDA context included — by terminating it when a cloud STT
# provider is selected. The server process itself never touches CUDA.
_pool = WhisperPool()

app = FastAPI(title="Yotify Sidecar")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PORT = int(os.environ.get("YOTIFY_PORT", "8731"))
USERDATA = os.environ.get("YOTIFY_USERDATA", tempfile.gettempdir())
CACHE_DIR = os.path.join(USERDATA, "audio-cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# ---- runtime config (set by the app via POST /config) -----------------------

# cookies_file: path to a Netscape cookies.txt for authenticated YouTube access.
# Authentication is what unlocks reliable, fast progressive audio (itag 140);
# without it YouTube only offers gated HLS that often won't download.
CONFIG = {
    "cookies_file": None,
    "stt_provider": "local-whisper",  # or "groq"
    "stt_api_key": "",
    "whisper_model": "small",
}

MODELS_DIR = os.path.join(USERDATA, "models")

# ---- wake word ("Hey DJ") ---------------------------------------------------

_wake_count = 0
_wake_lock = threading.Lock()


def _on_wake() -> None:
    global _wake_count
    with _wake_lock:
        _wake_count += 1


_wake = WakeListener(MODELS_DIR, _on_wake)


# ---- yt-dlp options ---------------------------------------------------------

_AUDIO_FORMAT = "bestaudio/best"


def base_opts() -> dict:
    """yt-dlp options. The one hard requirement for reliable YouTube audio in
    2026 is a JS runtime (Deno, auto-detected on PATH) so yt-dlp's EJS solver can
    crack YouTube's n-signature challenge — without it, no formats are available.

    With that in place, yt-dlp's *default* client exposes audio-only progressive
    formats (opus itag 251, ~4 MB) even without cookies. Cookies are optional:
    they unlock age-restricted / region-locked videos. We deliberately do NOT
    pin player_client to android/web/mweb — those only expose a large combined
    format here; the default client set is what surfaces audio-only."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "default_search": "ytsearch",
    }
    cookies = CONFIG.get("cookies_file")
    if cookies and os.path.exists(cookies):
        opts["cookiefile"] = cookies
    return opts


def _thumbnail(entry: dict) -> Optional[str]:
    vid = entry.get("id")
    thumbs = entry.get("thumbnails") or []
    if thumbs:
        return thumbs[max(0, len(thumbs) - 2)].get("url")
    return entry.get("thumbnail") or (
        f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else None
    )


def _track(e: dict, source: str = "youtube") -> dict:
    vid = e.get("id")
    return {
        "id": vid,
        "title": e.get("title") or "Unknown",
        "artist": e.get("uploader") or e.get("channel"),
        "duration": int(e["duration"]) if e.get("duration") else None,
        "thumbnail": _thumbnail(e),
        "url": e.get("webpage_url") or (f"https://www.youtube.com/watch?v={vid}" if vid else None),
        "source": source,
    }


def _proxy_url(video_id: str) -> str:
    return f"http://127.0.0.1:{PORT}/audio/{video_id}"


def search_youtube(query: str, limit: int) -> list[dict]:
    opts = {**base_opts(), "skip_download": True, "extract_flat": True}
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
    entries = (info or {}).get("entries") or []
    return [_track(e) for e in entries if e]


def metadata(video_id: str) -> dict:
    """Lightweight metadata fetch (no format processing)."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    opts = {**base_opts(), "skip_download": True}
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False, process=False)
    if not info:
        raise HTTPException(status_code=404, detail="Video not found")
    return _track(info)


def download_audio(video_id: str, dest_dir: str, transcode_fmt: Optional[str] = None) -> str:
    """Fetch a track's audio into dest_dir and return the file path. ffmpeg
    handles HLS/DASH remuxing. When transcode_fmt is given, re-encode to it."""
    os.makedirs(dest_dir, exist_ok=True)
    url = f"https://www.youtube.com/watch?v={video_id}"
    opts = {
        **base_opts(),
        "format": _AUDIO_FORMAT,
        "outtmpl": os.path.join(dest_dir, f"{video_id}.%(ext)s"),
    }
    if transcode_fmt:
        opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": transcode_fmt}
        ]
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        path = ydl.prepare_filename(info)
    if transcode_fmt:
        base, _ = os.path.splitext(path)
        cand = f"{base}.{transcode_fmt}"
        if os.path.exists(cand):
            return cand
    if os.path.exists(path):
        return path
    # ext may differ from prediction (e.g. .m4a vs .mp4); glob for it.
    matches = glob.glob(os.path.join(dest_dir, f"{video_id}.*"))
    matches = [m for m in matches if not m.endswith((".part", ".ytdl"))]
    if not matches:
        raise HTTPException(status_code=502, detail="Audio download produced no file")
    return matches[0]


def cached_path(video_id: str) -> Optional[str]:
    matches = glob.glob(os.path.join(CACHE_DIR, f"{video_id}.*"))
    matches = [m for m in matches if not m.endswith((".part", ".ytdl"))]
    return matches[0] if matches else None


# ---- routes -----------------------------------------------------------------

@app.get("/health")
def health():
    return {
        "ok": True,
        "authenticated": bool(CONFIG.get("cookies_file")),
        "wakeRunning": _wake.running,
        "wakeError": _wake.error,
        "sttProvider": CONFIG.get("stt_provider"),
        "whisperLoaded": _pool.loaded,
        "sttDevice": _pool.device,
    }


class ConfigBody(BaseModel):
    cookiesFile: Optional[str] = None
    wakeWord: Optional[bool] = None
    sttProvider: Optional[str] = None
    sttApiKey: Optional[str] = None
    whisperModel: Optional[str] = None


@app.post("/config")
def set_config(body: ConfigBody):
    if body.cookiesFile is not None:
        path = body.cookiesFile.strip()
        CONFIG["cookies_file"] = path if path and os.path.exists(path) else None
    if body.sttProvider is not None:
        CONFIG["stt_provider"] = body.sttProvider
    if body.sttApiKey is not None:
        CONFIG["stt_api_key"] = body.sttApiKey
    if body.whisperModel is not None:
        CONFIG["whisper_model"] = body.whisperModel
    # Local provider: keep the selected model warm (resident) in the worker so
    # the first command is fast. Cloud provider: terminate the worker to fully
    # release the GPU (CUDA context included).
    if CONFIG["stt_provider"] == "local-whisper":
        _pool.warm(CONFIG["whisper_model"])
    elif _pool.unload():
        print("[stt] cloud provider selected — freed GPU (worker terminated)", flush=True)
    if body.wakeWord is not None:
        if body.wakeWord:
            _wake.start()
        else:
            _wake.stop()
    return {
        "ok": True,
        "authenticated": bool(CONFIG["cookies_file"]),
        "wakeRunning": _wake.running,
        "wakeError": _wake.error,
    }


@app.get("/wake/stream")
async def wake_stream():
    """Server-Sent Events: emits a 'wake' event each time the wake word fires."""

    async def gen():
        last = _wake_count
        ticks = 0
        # Initial comment so the client knows the stream is open.
        yield ": connected\n\n"
        while True:
            await asyncio.sleep(0.15)
            cur = _wake_count
            if cur != last:
                last = cur
                yield "event: wake\ndata: 1\n\n"
            ticks += 1
            if ticks >= 100:  # ~15s heartbeat to keep the connection alive
                ticks = 0
                yield ": ping\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/search")
def search(q: str, limit: int = 12):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Empty query")
    try:
        return {"results": search_youtube(q, max(1, min(limit, 25)))}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Search failed: {exc}") from exc


@app.get("/stream/{video_id}")
def stream(video_id: str):
    """Return the proxy URL + metadata for a track. Audio bytes come from /audio."""
    try:
        return {"streamUrl": _proxy_url(video_id), "track": metadata(video_id)}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Resolve failed: {exc}") from exc


@app.get("/top")
def top(q: str):
    """Search and return the top hit's proxy URL + metadata (used by voice)."""
    results = search_youtube(q, 1)
    if not results:
        raise HTTPException(status_code=404, detail="No results")
    track = results[0]
    return {"streamUrl": _proxy_url(track["id"]), "track": track}


@app.get("/audio/{video_id}")
def audio(video_id: str):
    """Serve cached audio (downloading on first request). FileResponse handles
    HTTP Range, so the player can seek and replays are instant."""
    path = cached_path(video_id)
    if not path:
        try:
            path = download_audio(video_id, CACHE_DIR)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Audio fetch failed: {exc}") from exc
    return FileResponse(path)


@app.get("/file")
def serve_file(path: str):
    """Serve a locally-downloaded audio file with range support (offline playback)."""
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@app.delete("/file")
def delete_file(path: str):
    """Delete a downloaded file (user removed it from the Offline library)."""
    try:
        if os.path.isfile(path):
            os.remove(path)
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Delete failed: {exc}") from exc


@app.post("/download/{video_id}")
def download(video_id: str, folder: Optional[str] = None, fmt: str = "m4a"):
    """Save a track to the user's library folder (for offline / instant replay)."""
    dest = folder or os.path.join(USERDATA, "downloads")
    try:
        path = download_audio(video_id, dest, transcode_fmt=fmt)
        return {"path": path}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Download failed: {exc}") from exc


# ---- STT --------------------------------------------------------------------


def _transcribe_groq(tmp_path: str, api_key: str) -> str:
    """Transcribe via Groq's hosted Whisper (very fast). Returns the text."""
    import requests

    with open(tmp_path, "rb") as f:
        resp = requests.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": ("speech.webm", f, "audio/webm")},
            data={"model": "whisper-large-v3-turbo", "language": "en", "response_format": "json"},
            timeout=30,
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Groq STT {resp.status_code}: {resp.text[:200]}")
    return (resp.json().get("text") or "").strip()


@app.post("/stt")
async def stt(audio: UploadFile = File(...), model: str = Form("small")):
    suffix = os.path.splitext(audio.filename or "speech.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name
    try:
        # Primary: Groq (very fast hosted whisper-large-v3-turbo). Falls back to
        # the local CPU worker if Groq isn't configured or errors out.
        if CONFIG["stt_provider"] == "groq" and CONFIG.get("stt_api_key"):
            try:
                text = await asyncio.to_thread(_transcribe_groq, tmp_path, CONFIG["stt_api_key"])
                return {"text": text, "device": "groq"}
            except Exception as exc:  # noqa: BLE001
                print(f"[stt] Groq failed, falling back to local CPU: {exc}", flush=True)

        # Fallback / explicit local: faster-whisper on CPU in the worker process.
        size = CONFIG.get("whisper_model") or model
        resp = await asyncio.to_thread(_pool.transcribe, tmp_path, size)
        return {"text": resp.get("text", ""), "device": resp.get("device", "?")}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"STT failed: {exc}") from exc
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    import multiprocessing

    # Required for the whisper worker (multiprocessing spawn) in a PyInstaller
    # frozen build — intercepts re-launched child processes before the server
    # starts. Harmless when run from source.
    multiprocessing.freeze_support()

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
