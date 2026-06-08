import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { createServer } from 'net'
import type { SidecarStatus } from '@shared/types'

/**
 * Supervises the Python sidecar (FastAPI: yt-dlp search/stream + faster-whisper STT).
 * In dev it runs the source via the project venv / system python; in a packaged
 * build it runs the PyInstaller-built binary from resources/.
 */
export class Sidecar {
  private proc: ChildProcess | null = null
  private port: number | null = null
  private status: SidecarStatus = { running: false, port: null }
  private onStatus?: (s: SidecarStatus) => void
  private stopping = false

  constructor(onStatus?: (s: SidecarStatus) => void) {
    this.onStatus = onStatus
  }

  getStatus(): SidecarStatus {
    return this.status
  }

  baseUrl(): string | null {
    return this.port ? `http://127.0.0.1:${this.port}` : null
  }

  private emit(s: SidecarStatus): void {
    this.status = s
    this.onStatus?.(s)
  }

  private async freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = createServer()
      srv.unref()
      srv.on('error', reject)
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        srv.close(() => resolve(port))
      })
    })
  }

  /** Resolve how to launch the sidecar (python server). The sidecar folder
   * lives in the project in dev, and is bundled to resources/sidecar when
   * packaged. We prefer the bundled venv's python, else a system python. */
  private resolveCommand(): { cmd: string; args: string[]; cwd: string } | null {
    const sidecarDir = app.isPackaged
      ? join(process.resourcesPath, 'sidecar')
      : join(app.getAppPath(), 'sidecar')

    // Packaged: the self-contained PyInstaller binary (no Python needed).
    if (app.isPackaged) {
      const exe = join(sidecarDir, 'yotify-sidecar.exe')
      if (existsSync(exe)) return { cmd: exe, args: [], cwd: sidecarDir }
    }

    // Dev: run server.py with the project venv's python.
    const venvPy =
      process.platform === 'win32'
        ? join(sidecarDir, '.venv', 'Scripts', 'python.exe')
        : join(sidecarDir, '.venv', 'bin', 'python')
    const py = existsSync(venvPy) ? venvPy : process.platform === 'win32' ? 'python' : 'python3'
    const serverPy = join(sidecarDir, 'server.py')
    if (!existsSync(serverPy)) {
      return null
    }
    return { cmd: py, args: [serverPy], cwd: sidecarDir }
  }

  async start(): Promise<void> {
    if (this.proc) return
    this.stopping = false
    const resolved = this.resolveCommand()
    if (!resolved) {
      this.emit({ running: false, port: null, error: 'Sidecar not found (sidecar/server.py missing)' })
      return
    }

    try {
      this.port = await this.freePort()
    } catch (e) {
      this.emit({ running: false, port: null, error: `Could not allocate port: ${String(e)}` })
      return
    }

    // In a packaged build, put the bundled deno + ffmpeg on PATH so yt-dlp can
    // find them (the target machine may not have them installed).
    let pathEnv = process.env.PATH ?? ''
    if (app.isPackaged) {
      pathEnv = `${join(process.resourcesPath, 'bin')}${process.platform === 'win32' ? ';' : ':'}${pathEnv}`
    }

    const env = {
      ...process.env,
      PATH: pathEnv,
      Path: pathEnv,
      YOTIFY_PORT: String(this.port),
      YOTIFY_USERDATA: app.getPath('userData')
    }

    const child = spawn(resolved.cmd, resolved.args, {
      cwd: resolved.cwd,
      env,
      windowsHide: true
    })
    this.proc = child

    child.stdout?.on('data', (d) => console.log('[sidecar]', d.toString().trimEnd()))
    child.stderr?.on('data', (d) => console.warn('[sidecar:err]', d.toString().trimEnd()))

    child.on('exit', (code) => {
      this.proc = null
      const wasRunning = this.status.running
      this.emit({
        running: false,
        port: null,
        error: this.stopping ? undefined : `Sidecar exited (code ${code})`
      })
      // Auto-restart on unexpected crash.
      if (!this.stopping && wasRunning) setTimeout(() => this.start(), 1500)
    })

    child.on('error', (err) => {
      this.emit({ running: false, port: null, error: `Failed to launch sidecar: ${err.message}` })
    })

    await this.waitForHealth()
  }

  private async waitForHealth(timeoutMs = 30000): Promise<void> {
    const url = `${this.baseUrl()}/health`
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!this.proc) return // crashed during startup
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
        if (res.ok) {
          this.emit({ running: true, port: this.port })
          return
        }
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    this.emit({ running: false, port: null, error: 'Sidecar health check timed out' })
  }

  stop(): void {
    this.stopping = true
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
    this.emit({ running: false, port: null })
  }
}
