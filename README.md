# Yotify

A voice-controlled YouTube music player for Windows 11 with live audio visualizations and an
ultra-modern UI. Say **"Hey DJ"**, request a song, and Yotify finds it on YouTube, streams the audio,
and plays it through a built-in player.

## Features

- **Wake word** — always-listening "Hey DJ" via on-device detection (Picovoice Porcupine).
- **Voice requests** — speech-to-text (local faster-whisper, or cloud) + spoken confirmation (TTS).
- **YouTube playback** — searches and streams audio via `yt-dlp` (no API key required).
- **Built-in player** — transport controls, queue, playlists, history, favorites.
- **Visualizations** — bars / waveform / radial / spectrum presets, configurable accent & sensitivity.
- **Smart DJ** *(optional)* — an LLM layer for requests like "play something chill".
- **Lyrics & metadata** — synced lyrics (LRCLIB), album art, artist info.
- **Local downloads** *(optional)* — save songs to a chosen folder; future plays load from disk.
- **OS integration** — global media hotkeys, tray mini-player, Windows media overlay.

## Architecture

| Layer | Tech | Role |
| --- | --- | --- |
| Renderer | React + TypeScript + Tailwind | UI, Web Audio graph, visualizer, wake word (Porcupine Web SDK) |
| Main | Electron | Window/tray/hotkeys, settings, sidecar supervision, IPC |
| Sidecar | Python + FastAPI | `yt-dlp` search/stream/download, faster-whisper STT |

The renderer/main talk to the sidecar over `http://127.0.0.1:<port>` (port chosen at launch).

## Prerequisites

- Node.js 20+ and npm
- Python 3.12 (for the sidecar)
- **FFmpeg** on PATH (required by `yt-dlp` for remuxing / format conversion)
- **Deno 2.3+** on PATH — yt-dlp's EJS solver uses it to crack YouTube's
  n-signature challenge. Without a JS runtime, **no audio formats are available**
  and playback fails. (Node 22+ also works, but Deno is the recommended runtime.)

### YouTube authentication (optional)

Most songs play **without signing in** — Deno + the EJS solver is what actually
makes playback work. Adding a **cookies.txt** is optional and only helps with:

- age-restricted / region-locked / private videos, and
- occasional throttling on heavy use.

To sign in:

1. Install the “Get cookies.txt LOCALLY” extension in your browser.
2. Open youtube.com (signed in) and export cookies to a `cookies.txt`.
3. In Yotify → **Settings → YouTube access**, select that file.

## Setup

```powershell
# Install app dependencies
npm install

# Set up the Python sidecar
cd sidecar
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

## Run (development)

```powershell
npm run dev
```

This starts Vite + Electron and launches the Python sidecar automatically.

## Build (Windows installer)

```powershell
npm run make:icon       # regenerate resources/icon.png (optional)
npm run build:sidecar   # PyInstaller → sidecar/dist/yotify-sidecar (self-contained)
npm run build:win       # electron-vite build + electron-builder (NSIS)
```

The NSIS installer is written to `release/` as `Yotify-<version>-setup.exe`.

The build is **fully self-contained**: it bundles the app, the PyInstaller
sidecar binary (no Python needed), and **deno + ffmpeg** (from `resources/bin/`).
It installs and runs on a clean Windows machine with **no prerequisites**.
Speech-to-text uses **Groq (cloud)** by default with **local CPU Whisper** as an
offline fallback — there is no GPU/CUDA dependency.

> The bundled deno/ffmpeg live in `resources/bin/` (git-ignored). Copy
> `deno.exe` and `ffmpeg.exe` there before packaging (e.g. from your winget
> installs). The sidecar binary comes from `npm run build:sidecar`.

## Configuration

Open **Settings** in the app to configure:

- **Speech-to-text** — Groq (fast cloud, default; free key from console.groq.com) or local CPU Whisper (offline fallback).
- **Smart DJ** — Groq or DeepSeek for conversational requests ("play something chill").
- **YouTube cookies** (optional) — only needed for age/region-restricted videos.
- Output/input devices, appearance, downloads folder & format, tray behavior.

## Features at a glance

- "Hey DJ" wake word (offline Vosk) + push-to-talk; STT (Whisper/Groq), spoken/chime feedback.
- YouTube search & streaming via yt-dlp; album-art-reactive visualizer with dynamic color theming.
- Queue with collapsible album/playlist groups; library of playlists, history, favorites.
- Synced lyrics; Album tab (tracklist from iTunes, played from YouTube).
- Offline **Sync** for tracks/albums/playlists; tray mini-controls + Windows media overlay (SMTC).

## Notes

- yt-dlp needs occasional updates as YouTube changes (it's unpinned in `requirements.txt`).
- Use of YouTube content and local downloads is your responsibility (personal-use framing).
