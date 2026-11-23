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

export function nativePackages(platform, arch) {
  if (!['darwin', 'linux', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch)) return []
  const name = `@factory/cli-${platform}-${arch}`
  const binary = platform === 'win32' ? 'droid.exe' : 'droid'
  return (arch === 'x64' ? [name + '-baseline', name] : [name]).map(name => ({ name, binary, platform }))
}

export async function executableAt(candidate, platform) {
  if (!isAbsolute(candidate) || (platform === 'win32' && !candidate.toLowerCase().endsWith('.exe'))) return null
  try {
    await access(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK)
    if ((await stat(candidate)).isFile()) return await realpath(candidate)
  } catch { /* A different installation location may be available. */ }
  return null
}

export function childEnv(parent = process.env) {
  const env = Object.fromEntries(Object.entries(parent).filter(([key]) => inherited.has(key.toUpperCase())))
  return { ...env, ...registryEnv }
}

export async function findEngine(env = process.env, platform = process.platform, home = homedir(), arch = process.arch) {
  const override = env.EKKO_FACTORY_DROID_EXECUTABLE
  const windows = platform === 'win32'
  const name = windows ? 'droid.exe' : 'droid'
  const found = executable => executable ? { executable, args: registryArgs, env: childEnv(env) } : null
  if (override) return found(await executableAt(override, platform))
  const path = Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? ''
  const search = [...path.split(delimiter), join(home, '.local', 'bin'), join(home, '.factory', 'bin')].filter(isAbsolute)
  for (const dir of new Set(search)) {
    if (windows) {
      // Resolve an npm-installed package without executing a Windows command shim.
      for (const modules of [join(dir, 'node_modules'), join(dir, '..')]) {
        for (const native of nativePackages(platform, arch)) {
          for (const prefix of [join(modules, 'droid', 'node_modules'), modules]) {
            const executable = await executableAt(join(prefix, ...native.name.split('/'), 'bin', name), platform)
            if (executable) return found(executable)
          }
        }
      }
    }
    const executable = await executableAt(join(dir, name), platform)
    if (executable) return found(executable)
  }
  return null
}

export async function engineStatus(engine, signal, cwd) {
  signal.throwIfAborted()
  if (!engine) return { installed: false, version: '', source: 'not-installed' }
  try {
    const { stdout } = await execFileAsync(engine.executable, ['--version'], {
      cwd, env: engine.env, signal, timeout: 8000, maxBuffer: 8192, windowsHide: true,
    })
    const version = stdout.trim().match(/^(?:droid\s+)?v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/i)?.[1]
    if (version) return { installed: true, version, source: 'external' }
  } catch {
    signal.throwIfAborted()
  }
  return { installed: false, version: '', source: 'not-installed', error: 'Could not verify the Droid CLI executable.' }
}
