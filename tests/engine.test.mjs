import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { findEngine, nativePackages, registryArgs } from '../engine.mjs'
import { managedEngine } from '../managed-engine.mjs'
import { apply } from '../server.mjs'

async function setup(t, options = {}) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'droid-engine-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const home = join(root, 'home')
  const dataDir = join(root, 'plugin')
  const dir = join(dataDir, 'droid-engine')
  const env = { HOME: home, USERPROFILE: home, PATH: join(root, 'path'), FACTORY_API_KEY: 'host-native-secret' }
  const signal = AbortSignal.timeout(25_000)
  const run = { signal, progress() {}, log: { warn() {} } }
  const install = async (stage, native, version, npmEnv) => {
    assert.equal(npmEnv.FACTORY_API_KEY, undefined)
    const library = join(stage, 'node_modules', ...native.name.split('/'))
    await mkdir(join(library, 'bin'), { recursive: true })
    await writeFile(join(library, 'package.json'), JSON.stringify({ name: native.name, version }))
    await writeFile(join(library, 'bin', native.binary), version)
    await chmod(join(library, 'bin', native.binary), 0o755)
  }
  const manager = managedEngine(dataDir, {
    env, platform: 'linux', arch: 'x64',
    registryLookup: async version => version === 'latest' ? '1.17.2' : version,
    install, verify: async candidate => readFile(candidate.executable, 'utf8'), ...options,
  })
  return { root, dir, dataDir, home, env, run, signal, manager }
}

async function file(path, content = '1.17.1') {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  await chmod(path, 0o755)
  return await realpath(path)
}

test('published npm platform variants cover the official x64 baseline and ARM64 layouts', () => {
  for (const platform of ['linux', 'darwin', 'win32']) {
    assert.equal(nativePackages(platform, 'x64')[0].name, `@factory/cli-${platform}-x64-baseline`)
    assert.equal(nativePackages(platform, 'arm64')[0].name, `@factory/cli-${platform}-arm64`)
    assert.equal(nativePackages(platform, 'arm64')[0].binary, platform === 'win32' ? 'droid.exe' : 'droid')
  }
  assert.deepEqual(nativePackages('linux', 'arm'), [])
})

test('install, restart detection, real path selection, update and remove are bounded to plugin data', async t => {
  const { root, dir, env, home, run, signal, manager } = await setup(t)
  const userConfig = await file(join(home, '.factory', 'settings.json'), 'native settings')
  assert.deepEqual(await manager.status(signal), { installed: false, version: '', source: 'managed' })
  assert.deepEqual(await manager.checkUpdate(run), { currentVersion: '', latestVersion: '1.17.2', updateAvailable: true })
  await manager.upgrade({ version: '1.17.1', expectedVersion: '' }, run)
  const old = (await manager.resolve()).engine
  assert.ok(old.executable.startsWith(dir))
  assert.deepEqual(old.args, registryArgs)
  assert.equal(old.env.FACTORY_API_KEY, 'host-native-secret')
  assert.deepEqual(await manager.checkUpdate(run), { currentVersion: '1.17.1', latestVersion: '1.17.2', updateAvailable: true })
  await assert.rejects(manager.upgrade({ version: '1.17.2', expectedVersion: '' }, run), /version changed/)
  assert.deepEqual(await manager.upgrade({ version: '1.17.2', expectedVersion: '1.17.1' }, run), { installedVersion: '1.17.2' })
  assert.notEqual((await manager.resolve()).engine.executable, old.executable)
  await assert.rejects(readFile(old.executable), { code: 'ENOENT' })
  const restarted = managedEngine(join(root, 'plugin'), {
    env, platform: 'linux', arch: 'x64', verify: engine => readFile(engine.executable, 'utf8'),
  })
  assert.deepEqual(await restarted.status(signal), { installed: true, version: '1.17.2', source: 'managed' })
  const external = await file(join(env.PATH, 'droid'))
  await restarted.remove(run)
  assert.deepEqual(await restarted.status(signal), { installed: false, version: '', source: 'managed' })
  assert.deepEqual(await readdir(dir), ['current.json'])
  assert.equal(await readFile(userConfig, 'utf8'), 'native settings')
  assert.equal(await readFile(external, 'utf8'), '1.17.1')
  env.EKKO_FACTORY_DROID_EXECUTABLE = external
  assert.deepEqual(await restarted.status(signal), { installed: true, version: '1.17.1', source: 'external' })
})

test('external versions, Windows npm shims and broken explicit paths stay outside management', async t => {
  const { root, env, run, manager } = await setup(t)
  const external = await file(join(env.PATH, 'droid'))
  assert.equal((await manager.resolve()).engine.executable, external)
  assert.equal((await manager.checkUpdate(run)).updateAvailable, false)
  await assert.rejects(manager.upgrade({ version: '1.17.2', expectedVersion: '1.17.1' }, run), /outside Studio/)
  await assert.rejects(manager.remove(run), /outside Studio/)
  assert.equal(await readFile(external, 'utf8'), '1.17.1')
  const shim = await file(join(env.PATH, 'droid.cmd'), 'not executable by this test')
  const win = await file(join(env.PATH, 'node_modules', 'droid', 'node_modules', '@factory', 'cli-win32-arm64', 'bin', 'droid.exe'))
  assert.equal((await findEngine(env, 'win32', join(root, 'home'), 'arm64')).executable, win)
  assert.ok(shim)
  env.EKKO_FACTORY_DROID_EXECUTABLE = join(root, 'missing-cli')
  assert.equal((await manager.status(run.signal)).installed, false)
  await assert.rejects(manager.upgrade({ version: '1.17.2', expectedVersion: '' }, run), /outside Studio/)
  await assert.rejects(manager.remove(run), /outside Studio/)
})

test('failed verification and cancelled installation preserve the selected release', async t => {
  const { dir, run, manager } = await setup(t, {
    verify: async engine => {
      const version = await readFile(engine.executable, 'utf8')
      return version === '1.17.2' ? '' : version
    },
  })
  await manager.upgrade({ version: '1.17.1', expectedVersion: '' }, run)
  const previous = await readdir(dir)
  await assert.rejects(manager.upgrade({ version: '1.17.2', expectedVersion: '1.17.1' }, run), /ACP verification/)
  assert.deepEqual(await readdir(dir), previous)
  assert.equal((await manager.status(run.signal)).version, '1.17.1')
  await assert.rejects(manager.upgrade({ version: '1.17.2', expectedVersion: '1.17.1' },
    { ...run, signal: AbortSignal.abort() }), { name: 'AbortError' })
})

test('unsafe selection and symlink directories cannot delete outside the managed root', async t => {
  const { root, dir, run, manager } = await setup(t)
  const outside = await file(join(root, 'unrelated', 'droid'))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'current.json'), JSON.stringify({ release: '../unrelated', version: '1.17.1' }))
  await assert.rejects(manager.remove(run), /selection is invalid/)
  await symlink(dirname(outside), join(dir, 'release-existing'), process.platform === 'win32' ? 'junction' : 'dir')
  await writeFile(join(dir, 'current.json'), JSON.stringify({ release: 'release-existing', version: '1.17.1' }))
  await assert.rejects(manager.remove(run), /outside its installation/)
  assert.equal(await readFile(outside, 'utf8'), '1.17.1')
})

test('Studio registration exposes management to the activating account and Profile', async t => {
  const { dataDir } = await setup(t)
  const identity = { userId: 10, profile: 'activation' }
  let registered
  const dispose = apply({ identity, paths: { dataDir }, extensions: { rpc: { register() { return () => {} } }, agents: { register(definition) {
    registered = definition
    return { dispose() {} }
  } } } })
  for (const action of ['checkUpdate', 'upgrade', 'remove']) assert.equal(typeof registered.management[action], 'function')
  const other = { identity: { userId: 11, profile: 'activation' } }
  assert.throws(() => registered.management.checkUpdate(other), /enabled the plugin/)
  assert.throws(() => registered.management.upgrade({}, other), /enabled the plugin/)
  assert.throws(() => registered.management.remove(other), /enabled the plugin/)
  await dispose()
})
