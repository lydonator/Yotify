# PyInstaller spec — bundles the Yotify sidecar into a self-contained onedir app
# (no Python needed on the target machine). CPU-only (no NVIDIA CUDA libs).
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas, binaries, hiddenimports = [], [], []

# Heavy packages with native libs / data files / dynamic imports.
for pkg in (
    "ctranslate2",
    "faster_whisper",
    "vosk",
    "sounddevice",
    "av",
    "yt_dlp",
    "yt_dlp_ejs",
    "huggingface_hub",
    "tokenizers",
    "uvicorn",
    "starlette",
    "fastapi",
    "pydantic",
    "pydantic_core",
    "anyio",
    "sniffio",
    "click",
    "h11",
    "httptools",
    "websockets",
    "requests",
    "certifi",
    "charset_normalizer",
):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

hiddenimports += collect_submodules("uvicorn")
hiddenimports += ["multiprocessing", "multiprocessing.spawn"]

a = Analysis(
    ["server.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    # Exclude the giant NVIDIA CUDA libs (GPU STT) and unused frameworks.
    excludes=["nvidia", "torch", "tensorflow", "matplotlib", "tkinter", "PyQt5", "PySide6"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="yotify-sidecar",
    console=True,
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="yotify-sidecar",
)
