# Yotify

**A voice-controlled YouTube music player for Windows 11.**

Say *"Hey DJ"* and ask for a song — Yotify finds it on YouTube, streams the audio, and plays it
through a full-featured player with live, album-reactive visualizations. Includes a hands-free
Smart DJ (LLM), synced lyrics, queues/playlists/history/favorites, curated offline sync, and a
clean, modern dark UI. The app keeps itself up to date automatically via GitHub Releases.

## Download

➡️ **[Download the latest version](https://github.com/lydonator/Yotify/releases/latest)** — grab
`Yotify-<version>-setup.exe` from the latest release and run it.

> On first launch Windows SmartScreen may warn about an unrecognized app (the installer isn't code
> signed). Click **More info → Run anyway**. After that, updates install silently in the background.

## Features

- 🎙️ **Wake word** — hands-free "Hey DJ" listening, plus push-to-talk (`Ctrl+Shift+Space`)
- 🗣️ **Voice control** — request songs, control playback, and chat with the Smart DJ
- 🎵 **YouTube playback** — streams audio with no API key required
- 📊 **Live visualizations** — multiple presets that react to the music and the album's colors
- 📝 **Synced lyrics & album info**
- 📂 **Queues, playlists, history & favorites**
- 💾 **Offline sync** — keep chosen tracks/albums/playlists on disk for offline play
- 🔄 **Automatic updates**

---

*Personal-use project. Built with Electron, React, and a Python sidecar (yt-dlp + Whisper/Groq STT).*
