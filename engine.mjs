import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
export const registryArgs = Object.freeze(['exec', '--output-format', 'acp-daemon'])
export const registryEnv = Object.freeze({
  DROID_DISABLE_AUTO_UPDATE: 'true',
  FACTORY_DROID_AUTO_UPDATE_ENABLED: 'false',
})
const inherited = new Set([
  'PATH', 'PATHEXT', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
  'TMPDIR', 'TEMP', 'TMP', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'FACTORY_API_KEY',
])

export function childEnv(parent = process.env) {
  const env = Object.fromEntries(Object.entries(parent).filter(([key]) => inherited.has(key.toUpperCase())))
  return { ...env, ...registryEnv }
}

export async function findEngine(env = process.env, platform = process.platform, home = homedir()) {
  const override = env.EKKO_FACTORY_DROID_EXECUTABLE
  const windows = platform === 'win32'
  const name = windows ? 'droid.exe' : 'droid'
  const path = Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? ''
  const search = [...path.split(delimiter), join(home, '.local', 'bin'), join(home, '.factory', 'bin')]
  const candidates = override ? [override] : search.filter(isAbsolute).map(dir => join(dir, name))
  for (const candidate of candidates) {
    if (!isAbsolute(candidate) || (windows && !candidate.toLowerCase().endsWith('.exe'))) continue
    try {
      await access(candidate, windows ? constants.F_OK : constants.X_OK)
      if ((await stat(candidate)).isFile()) {
        return { executable: await realpath(candidate), args: registryArgs, env: childEnv(env) }
      }
    } catch { /* Continue looking through absolute installation locations. */ }
  }
  return null
}

export async function engineStatus(engine, signal) {
  signal.throwIfAborted()
  if (!engine) return { installed: false, version: '', source: 'not-installed' }
  try {
    const { stdout } = await execFileAsync(engine.executable, ['--version'], {
      env: engine.env, signal, timeout: 5000, maxBuffer: 8192, windowsHide: true,
    })
    const version = stdout.trim().match(/^(?:droid\s+)?v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/i)?.[1]
    if (version) return { installed: true, version, source: 'external' }
  } catch {
    signal.throwIfAborted()
  }
  return { installed: false, version: '', source: 'not-installed', error: 'Could not verify the Droid CLI executable.' }
}
