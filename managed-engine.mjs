import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { Acp } from './acp.mjs'
import { childEnv, engineStatus, executableAt, findEngine, nativePackages, registryArgs } from './engine.mjs'
import contract from './contracts/plugin.json' with { type: 'json' }
import { validateModel } from './sdk/harness/contracts.mjs'

const exec = promisify(execFile)
const registry = 'https://registry.npmjs.org/'
const externalMessage = 'This Droid CLI is managed outside Studio.'
const removeMarker = { release: '', version: '' }
const operations = new Map()
const releaseId = /^release-[a-zA-Z0-9]+$/
const stableVersion = /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/
const removeTree = directory => rm(directory, { recursive: true, force: true, maxRetries: 3 })
const fileExists = path => stat(path).then(info => info.isFile(), () => false)

function newer(latest, current) {
  if (!stableVersion.test(current)) return !current
  const installed = current.split('.').map(Number)
  for (const [index, part] of latest.split('.').map(Number).entries()) {
    if (part !== installed[index]) return part > installed[index]
  }
  return false
}

async function readSelection(root) {
  let value
  try { value = JSON.parse(await readFile(join(root, 'current.json'), 'utf8')) }
  catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error('Could not read the Studio-managed Droid engine selection.')
  }
  validateModel(contract, 'engineSelection', value)
  if ((value.release || value.version) && (!releaseId.test(value.release) || !stableVersion.test(value.version))) {
    throw new Error('The Studio-managed Droid engine selection is invalid.')
  }
  return value
}

async function select(root, state) {
  validateModel(contract, 'engineSelection', state)
  const temporary = join(root, '.selection-' + randomUUID())
  try {
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
    await rename(temporary, join(root, 'current.json'))
  } finally {
    await rm(temporary, { force: true })
  }
}

function serialize(root, work) {
  const pending = (operations.get(root) ?? Promise.resolve()).catch(() => {}).then(work)
  operations.set(root, pending)
  return pending.finally(() => {
    if (operations.get(root) === pending) operations.delete(root)
  })
}

async function safeRelease(root, release) {
  if (!releaseId.test(release)) throw new Error('Invalid managed Droid directory.')
  const directory = join(root, release)
  try {
    if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== join(await realpath(root), release)) {
      throw new Error('Managed Droid release is outside its installation directory.')
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return directory
}

async function releaseEngine(root, release, version, native, env) {
  const directory = await safeRelease(root, release)
  const library = join(directory, 'node_modules', ...native.name.split('/'))
  try {
    const disk = JSON.parse(await readFile(join(library, 'package.json'), 'utf8'))
    const executable = await executableAt(join(library, 'bin', native.binary), native.platform)
    if (disk.name === native.name && disk.version === version && executable === join(await realpath(directory), 'node_modules', ...native.name.split('/'), 'bin', native.binary)) {
      return { executable, args: registryArgs, env: childEnv(env) }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

async function registryRelease(target, native, signal) {
  if (target !== 'latest' && !stableVersion.test(target)) throw new Error('Choose a published stable Droid CLI version.')
  try {
    const response = await fetch(registry + 'droid/' + target, {
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    })
    if (response.ok) {
      const pkg = await response.json()
      if (pkg.name === 'droid' && stableVersion.test(pkg.version) && (target === 'latest' || target === pkg.version) &&
          pkg.optionalDependencies?.[native.name] === pkg.version) return pkg.version
    }
  } catch {
    signal.throwIfAborted()
  }
  throw new Error('The official npm registry did not return a matching Droid CLI release for this platform.')
}

async function npmRuntime(env, signal) {
  const windows = process.platform === 'win32'
  const nodeName = windows ? 'node.exe' : 'node'
  const path = Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? ''
  const candidates = new Set([
    ...(isAbsolute(process.env.HERMES_AGENT_NODE || '.') ? [process.env.HERMES_AGENT_NODE] : []),
    ...(!process.versions.electron ? [process.execPath] : []),
    ...path.split(delimiter).filter(isAbsolute).map(dir => join(dir, nodeName)),
  ])
  for (const candidate of candidates) {
    signal.throwIfAborted()
    if (!await fileExists(candidate)) continue
    const node = await realpath(candidate)
    const bin = dirname(node)
    const paths = [
      join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ]
    const npmShim = join(dirname(candidate), 'npm')
    if (!windows && await fileExists(npmShim)) {
      const npm = await realpath(npmShim)
      if (npm.endsWith('.js')) paths.push(npm)
    }
    for (const npm of paths) {
      if (await fileExists(npm)) return { node, npm }
    }
  }
  throw new Error('The Studio host needs a Node.js installation with npm to manage Droid CLI.')
}

async function installPackage(stage, native, version, env, signal) {
  const { node, npm } = await npmRuntime(env, signal)
  const npmrc = join(stage, '.studio-npmrc')
  const global = join(stage, '.studio-global-npmrc')
  const cache = join(stage, '.cache')
  await Promise.all([writeFile(npmrc, '', { mode: 0o600 }), writeFile(global, '', { mode: 0o600 })])
  try {
    await exec(node, [npm, 'install', '--prefix', stage, '--registry', registry,
      '--userconfig', npmrc, '--globalconfig', global, '--cache', cache, '--ignore-scripts',
      '--no-audit', '--no-fund', '--no-package-lock', native.name + '@' + version], {
      cwd: stage, env, signal, timeout: 100_000, maxBuffer: 512 * 1024, windowsHide: true,
    })
  } catch {
    signal.throwIfAborted()
    throw new Error('npm could not install the official Droid native package.')
  } finally {
    await removeTree(cache)
  }
}

function probeEnvironment(engine, directory) {
  const env = childEnv(engine.env)
  delete env.FACTORY_API_KEY
  return { ...env, HOME: directory, USERPROFILE: directory, APPDATA: directory, LOCALAPPDATA: directory,
    XDG_CONFIG_HOME: directory, XDG_DATA_HOME: directory, XDG_CACHE_HOME: directory }
}

async function probeOnce(engine, signal) {
  const cwd = await mkdtemp(join(await realpath(tmpdir()), 'studio-droid-probe-'))
  let acp
  try {
    const env = probeEnvironment(engine, cwd)
    const version = (await engineStatus({ ...engine, env }, signal, cwd)).version
    if (!version) throw new Error('Droid CLI did not report its version.')
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    acp = new Acp(engine.executable, engine.args, { cwd, env }, ({ id }) => {
      if (id !== undefined) acp.methodNotFound(id)
    })
    let hello
    try {
      hello = await acp.request('initialize', { protocolVersion: 1, clientCapabilities: {},
        clientInfo: { name: 'ekko-studio-factory-droid-probe', version: '1.0.0' } }, deadline)
    } catch {
      signal.throwIfAborted()
      throw new Error('Droid CLI did not complete its ACP handshake.')
    }
    if (hello?.protocolVersion !== 1 || hello.agentInfo?.name !== '@factory/cli') {
      throw new Error('The executable did not identify itself as the Droid CLI ACP agent.')
    }
    return version
  } finally {
    try { await acp?.close() }
    finally { await removeTree(cwd) }
  }
}

async function probe(engine, signal) {
  // A newly extracted binary can be slow to start. Retry once with a new ACP process and home.
  try { return await probeOnce(engine, signal) }
  catch {
    signal.throwIfAborted()
    await delay(250, undefined, { signal })
    return probeOnce(engine, signal)
  }
}

export function managedEngine(dataDir, { env = process.env, platform = process.platform, arch = process.arch,
  registryLookup = registryRelease, install = installPackage, verify = probe } = {}) {
  const root = join(dataDir, 'droid-engine')
  // The official wrapper publishes a non-AVX2 build for each x64 platform.
  const native = nativePackages(platform, arch).at(0)
  let verified

  async function inspectRoot(create = false) {
    if (create) await mkdir(root, { recursive: true, mode: 0o700 })
    try {
      if (!(await lstat(root)).isDirectory()) throw new Error('The managed Droid engine root must be a directory.')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  async function resolve() {
    const home = env[platform === 'win32' ? 'USERPROFILE' : 'HOME']
    if (env.EKKO_FACTORY_DROID_EXECUTABLE) return { source: 'external', engine: await findEngine(env, platform, home, arch) }
    await inspectRoot()
    const selected = await readSelection(root)
    if (selected) {
      return { source: 'managed', selected,
        engine: selected.release && native ? await releaseEngine(root, selected.release, selected.version, native, env) : undefined }
    }
    const external = await findEngine(env, platform, home, arch)
    return external ? { source: 'external', engine: external } : { source: native ? 'managed' : 'not-installed' }
  }

  async function verifiedVersion(engine, signal) {
    signal.throwIfAborted()
    const info = await stat(engine.executable)
    const signature = JSON.stringify([engine.executable, info.ino, info.size, info.mtimeMs, info.ctimeMs])
    if (verified?.signature === signature) return verified.version
    const version = await verify(engine, signal)
    if (version) verified = { signature, version }
    return version
  }

  async function observe(current, signal) {
    try {
      signal.throwIfAborted()
      const version = current.engine ? await verifiedVersion(current.engine, signal) : ''
      if (version && (!current.selected || current.selected.version === version)) {
        return { installed: true, version, source: current.source }
      }
    } catch {
      signal.throwIfAborted()
    }
    const broken = current.source === 'external' || Boolean(current.selected?.release)
    return { installed: false, version: '', source: current.source,
      ...(broken ? { error: 'Droid CLI could not be verified. Check its version and ACP support.' } : {}) }
  }

  async function status(signal) {
    try { return await observe(await resolve(), signal) }
    catch {
      signal.throwIfAborted()
      return { installed: false, version: '', source: 'error', error: 'Could not read the managed Droid installation.' }
    }
  }

  async function checkUpdate(run) {
    const current = await resolve()
    const { version } = await observe(current, run.signal)
    if (current.source === 'external') {
      return { currentVersion: version, latestVersion: version, updateAvailable: false, message: externalMessage }
    }
    if (!native) {
      return { currentVersion: version, latestVersion: '', updateAvailable: false, message: 'Official Droid npm binaries are unavailable for this platform.' }
    }
    const latest = await registryLookup('latest', native, run.signal)
    return { currentVersion: version, latestVersion: latest, updateAvailable: newer(latest, version) }
  }

  function upgrade(input, run) {
    return serialize(root, async () => {
      run.signal.throwIfAborted()
      const prior = await resolve()
      if (prior.source === 'external') throw new Error(externalMessage)
      if (!native) throw new Error('Droid CLI installation is unsupported on this platform.')
      if (!stableVersion.test(input.version)) throw new Error('Choose a published stable Droid CLI version.')
      const { version: existing } = await observe(prior, run.signal)
      if (existing !== input.expectedVersion || !newer(input.version, existing)) {
        throw new Error('Droid CLI version changed. Check updates again.')
      }
      const target = await registryLookup(input.version, native, run.signal)
      if (target !== input.version) throw new Error('Droid CLI release did not match the requested version.')
      await inspectRoot(true)
      const stage = await mkdtemp(join(root, 'release-'))
      const release = stage.slice(root.length + 1)
      let selected = false
      try {
        run.progress({ message: 'Installing the official Droid CLI from npm', percent: 15 })
        const npmEnv = childEnv(env)
        delete npmEnv.FACTORY_API_KEY
        await install(stage, native, target, npmEnv, run.signal)
        run.progress({ message: 'Verifying Droid CLI version and ACP handshake', percent: 85 })
        const engine = await releaseEngine(root, release, target, native, env)
        if (!engine) throw new Error('The official package did not install the expected Droid executable.')
        if (await verifiedVersion(engine, run.signal) !== target) throw new Error('The installed Droid CLI failed version or ACP verification.')
        if (!prior.selected && (await resolve()).source === 'external') throw new Error(externalMessage)
        run.signal.throwIfAborted()
        await select(root, { release, version: target })
        selected = true
        if (prior.selected?.release) {
          try { await removeTree(await safeRelease(root, prior.selected.release)) }
          catch { run.log.warn('Could not clean up an older Studio-managed Droid release.') }
        }
        return { installedVersion: target }
      } finally {
        if (!selected) await removeTree(stage)
      }
    })
  }

  function remove(run) {
    return serialize(root, async () => {
      const current = await resolve()
      if (current.source === 'external') throw new Error(externalMessage)
      if (!current.selected?.release) return
      const directory = await safeRelease(root, current.selected.release)
      run.signal.throwIfAborted()
      await removeTree(directory)
      await select(root, removeMarker)
      verified = undefined
    })
  }

  return { native, resolve, status, checkUpdate, upgrade, remove }
}
