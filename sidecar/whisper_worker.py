"""
Out-of-process faster-whisper worker.

Running the model in a child process means we can **fully** release the GPU —
including the CUDA context, which CTranslate2 can't free in-process — simply by
terminating the child when the user switches to a cloud STT provider.

Protocol over a duplex Pipe (pickled dicts):
  parent -> child : {"cmd": "load", "model": "small"}
                    {"cmd": "transcribe", "path": "...", "model": "small"}
  child  -> parent: {"ok": True, "device": "cuda"}                     (load)
                    {"ok": True, "text": "...", "device": "cuda"}       (transcribe)
                    {"ok": False, "error": "..."}
"""
import multiprocessing as mp
import threading


def _worker(conn) -> None:
    from faster_whisper import WhisperModel

    models: dict = {}
    device = "cpu"

    def get_model(size: str):
        # CPU-only int8 (Groq is the default/primary STT; local Whisper is the
        # offline fallback). No GPU/CUDA anywhere.
        if size in models:
            return models[size]
        m = WhisperModel(size, device="cpu", compute_type="int8")
        models.clear()  # keep only the active size resident
        models[size] = m
        return m

    while True:
        try:
            msg = conn.recv()
        except EOFError:
            break
        cmd = msg.get("cmd")
        try:
            if cmd == "load":
                get_model(msg["model"])
                conn.send({"ok": True, "device": device})
            elif cmd == "transcribe":
                m = get_model(msg["model"])
                segments, _ = m.transcribe(
                    msg["path"],
                    language="en",
                    beam_size=5,
                    vad_filter=True,
                    condition_on_previous_text=False,
                )
                text = " ".join(s.text for s in segments).strip()
                conn.send({"ok": True, "text": text, "device": device})
            elif cmd == "stop":
                break
            else:
                conn.send({"ok": False, "error": f"unknown cmd {cmd}"})
        except Exception as exc:  # noqa: BLE001
            conn.send({"ok": False, "error": str(exc)})


class WhisperPool:
    """Manages the worker process. Terminating it frees ALL GPU memory."""

    def __init__(self) -> None:
        self._proc: mp.Process | None = None
        self._conn = None
        self._lock = threading.Lock()
        self.device = "?"

    def _ensure(self) -> None:
        if self._proc and self._proc.is_alive():
            return
        ctx = mp.get_context("spawn")
        parent, child = ctx.Pipe()
        self._conn = parent
        self._proc = ctx.Process(target=_worker, args=(child,), daemon=True)
        self._proc.start()

    def warm(self, model: str) -> None:
        def go():
            with self._lock:
                self._ensure()
                self._conn.send({"cmd": "load", "model": model})
                resp = self._conn.recv()
                self.device = resp.get("device", "?")

        threading.Thread(target=go, daemon=True).start()

    def transcribe(self, path: str, model: str) -> dict:
        with self._lock:
            self._ensure()
            self._conn.send({"cmd": "transcribe", "path": path, "model": model})
            resp = self._conn.recv()
        if not resp.get("ok"):
            raise RuntimeError(resp.get("error", "whisper worker error"))
        self.device = resp.get("device", "?")
        return resp

    def unload(self) -> bool:
        """Terminate the worker, fully releasing its CUDA context / VRAM."""
        with self._lock:
            if not (self._proc and self._proc.is_alive()):
                return False
            try:
                self._proc.terminate()
                self._proc.join(timeout=5)
            except Exception:
                pass
            self._proc = None
            self._conn = None
            return True

    @property
    def loaded(self) -> bool:
        return bool(self._proc and self._proc.is_alive())
