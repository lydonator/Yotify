"""
Offline "Hey DJ" wake-word detection via Vosk keyword spotting.

A background thread captures the default microphone at 16 kHz and feeds it to a
grammar-constrained Vosk recognizer (the small English model). The grammar is
limited to the wake phrase + "[unk]", which makes spotting the exact phrase
robust and cheap. On detection it invokes a callback, then enters a short
cooldown so the follow-up command (and any TTS reply) doesn't re-trigger it.

Free, fully offline, no training, no API key — works for the exact "Hey DJ"
phrase the user wanted.
"""
import json
import os
import threading
import time
import urllib.request
import zipfile

MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
MODEL_DIR_NAME = "vosk-model-small-en-us-0.15"

# Phrases Vosk may emit for "Hey DJ" depending on how it hears it.
WAKE_PHRASES = ("hey dj", "hey d j", "hey deejay", "hey dee jay", "a dj", "hey djay")
# Grammar handed to Vosk: constrain decoding to the wake phrase + unknown filler.
GRAMMAR = json.dumps(["hey dj", "hey deejay", "[unk]"])

SAMPLE_RATE = 16000
COOLDOWN_S = 6.0


def ensure_model(models_dir: str) -> str:
    """Return the path to the Vosk model, downloading + unzipping it on first use."""
    target = os.path.join(models_dir, MODEL_DIR_NAME)
    if os.path.isdir(target):
        return target
    os.makedirs(models_dir, exist_ok=True)
    zip_path = os.path.join(models_dir, MODEL_DIR_NAME + ".zip")
    print(f"[wake] downloading Vosk model to {zip_path} ...", flush=True)
    urllib.request.urlretrieve(MODEL_URL, zip_path)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(models_dir)
    try:
        os.remove(zip_path)
    except OSError:
        pass
    print("[wake] Vosk model ready", flush=True)
    return target


class WakeListener:
    def __init__(self, models_dir: str, on_wake):
        self._models_dir = models_dir
        self._on_wake = on_wake
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._error: str | None = None
        self._running = False

    @property
    def running(self) -> bool:
        return self._running

    @property
    def error(self) -> str | None:
        return self._error

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._error = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._running = False

    def _run(self) -> None:
        try:
            import sounddevice as sd
            from vosk import KaldiRecognizer, Model, SetLogLevel

            SetLogLevel(-1)
            model_path = ensure_model(self._models_dir)
            model = Model(model_path)
            rec = KaldiRecognizer(model, SAMPLE_RATE, GRAMMAR)
            rec.SetWords(False)

            last_fire = 0.0

            def matches(text: str) -> bool:
                t = (text or "").lower()
                return any(p in t for p in WAKE_PHRASES)

            with sd.RawInputStream(
                samplerate=SAMPLE_RATE,
                blocksize=4000,
                dtype="int16",
                channels=1,
            ) as stream:
                self._running = True
                print("[wake] listening for 'Hey DJ'", flush=True)
                while not self._stop.is_set():
                    data, _ = stream.read(4000)
                    raw = bytes(data)
                    now = time.monotonic()
                    if now - last_fire < COOLDOWN_S:
                        # In cooldown: keep the stream drained but ignore results.
                        rec.AcceptWaveform(raw)
                        continue
                    fired = False
                    if rec.AcceptWaveform(raw):
                        if matches(json.loads(rec.Result()).get("text", "")):
                            fired = True
                    else:
                        if matches(json.loads(rec.PartialResult()).get("partial", "")):
                            fired = True
                    if fired:
                        last_fire = now
                        rec.Reset()
                        print("[wake] detected", flush=True)
                        try:
                            self._on_wake()
                        except Exception as exc:  # noqa: BLE001
                            print(f"[wake] callback error: {exc}", flush=True)
        except Exception as exc:  # noqa: BLE001
            self._error = str(exc)
            print(f"[wake] error: {exc}", flush=True)
        finally:
            self._running = False
