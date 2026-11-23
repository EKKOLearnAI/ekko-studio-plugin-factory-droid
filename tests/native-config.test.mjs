import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { nativeConfiguration } from '../native-config.mjs'
import { factoryUserHome, globalDroidEngine } from '../engine.mjs'
import { apply } from '../server.mjs'
import manifest from '../plugin.json' with { type: 'json' }
import contract from '../contracts/plugin.json' with { type: 'json' }
import { assertContracts } from '../sdk/harness/contracts.mjs'

const timeout = () => AbortSignal.timeout(15_000)

async function temporaryHome(t) {
  const home = await mkdtemp(join(await realpath(tmpdir()), 'factory-user-config-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  return home
}

const input = (resource, name) => ({ resource, ...(name ? { name } : {}) })
async function save(service, selection, text) {
  const read = await service.read(selection)
  return service.save({ ...selection, revision: read.revision, text })
}
async function remove(service, selection) {
  const read = await service.read(selection)
  return service.remove({ ...selection, revision: read.revision })
}

test('skills create, read, edit and remove only the native SKILL.md entry point', async t => {
  const home = await temporaryHome(t)
  const config = nativeConfiguration(home, timeout())
  const selection = input('skill', 'review-patch')
  assert.deepEqual(await config.list({ resource: 'skill' }), { names: [] })
  const blank = await config.read(selection)
  assert.equal(blank.exists, false)
  assert.match(blank.text, /name: review-patch/)
  await config.save({ ...selection, revision: blank.revision, text: blank.text + 'Describe results.' })
  const created = await config.read(selection)
  assert.match(created.path, /[\\/]\.factory[\\/]skills[\\/]review-patch[\\/]SKILL\.md$/)
  assert.match(created.text, /Describe results/)
  assert.deepEqual(await config.list({ resource: 'skill' }), { names: ['review-patch'] })
  const support = join(home, '.factory', 'skills', 'review-patch', 'REFERENCE.md')
  await writeFile(support, 'Keep this')
  await assert.rejects(save(config, selection, 'no frontmatter'), /frontmatter/)
  await save(config, selection, created.text.replace('Describe results.', 'Describe risks.'))
  await assert.rejects(config.remove({ ...selection, revision: created.revision }), /changed/)
  assert.match((await config.read(selection)).text, /Describe risks/)
  await remove(config, selection)
  assert.equal(await readFile(support, 'utf8'), 'Keep this')
  assert.equal((await config.read(selection)).exists, false)
})

test('MCP edits mask private values, preserve hidden values and unrelated entries, and remove a single server', async t => {
  const home = await temporaryHome(t)
  const native = join(home, '.factory')
  await mkdir(native)
  const mcpFile = join(native, 'mcp.json')
  const config = nativeConfiguration(home, timeout())
  const selected = input('mcp', 'api-service')
  const entry = { type: 'http', url: 'https://example.invalid/api?key=literal-secret',
    headers: { Authorization: 'Bearer fixture-secret', 'X-Endpoint': 'private-value' },
    oauth: { clientSecret: 'api-secret' }, timeout: 2000 }
  const unrelated = { type: 'stdio', command: 'node', args: ['secret-argument'], env: { SECRET: 'secret-env' }, disabled: false }
  await writeFile(mcpFile, JSON.stringify({ mcpServers: { 'api-service': entry, unrelated }, futureKey: 'keep' }))
  const remote = await config.read(selected)
  assert.doesNotMatch(remote.text, /secret|private-value/)
  assert.deepEqual(JSON.parse(remote.text), {
    type: 'http', disabled: false, url: null, headers: { Authorization: null, 'X-Endpoint': null }, oauth: null,
  })
  const stdio = await config.read(input('mcp', 'unrelated'))
  assert.deepEqual(JSON.parse(stdio.text), { type: 'stdio', disabled: false, command: 'node', args: null, env: { SECRET: null } })
  const edited = { ...JSON.parse(remote.text), disabled: true }
  await config.save({ ...selected, revision: remote.revision, text: JSON.stringify(edited) })
  let stored = JSON.parse(await readFile(mcpFile, 'utf8'))
  assert.deepEqual(stored, { mcpServers: { 'api-service': { ...entry, disabled: true }, unrelated }, futureKey: 'keep' })
  const fresh = input('mcp', 'new-local')
  await save(config, fresh, '{"type":"stdio","command":"node","args":["fixture.mjs"],"env":{},"disabled":true}')
  await assert.rejects(save(config, input('mcp', 'wrong'), '{"type":"http","url":"file:///outside"}'), /HTTP/)
  await assert.rejects(save(config, input('mcp', 'null-header'), '{"type":"http","url":"https://example.invalid/mcp","headers":{"Authorization":null}}'), /existing native value/)
  await assert.rejects(config.remove({ ...selected, revision: remote.revision }), /changed/)
  await remove(config, selected)
  stored = JSON.parse(await readFile(mcpFile, 'utf8'))
  assert.equal(stored.futureKey, 'keep')
  assert.deepEqual(stored.mcpServers.unrelated, unrelated)
  assert.equal(stored.mcpServers['new-local'].disabled, true)
  assert.equal(stored.mcpServers['api-service'], undefined)
})

test('settings edit only the selected personal layer and retain unknown or protected configuration', async t => {
  const home = await temporaryHome(t)
  const native = join(home, '.factory')
  await mkdir(native)
  const rootFile = join(native, 'settings.json')
  const localFile = join(native, 'settings.local.json')
  const original = { model: 'existing-model', customModels: [{ apiKey: 'hidden-provider-credential' }], future: { preserved: true } }
  await writeFile(rootFile, JSON.stringify(original))
  await writeFile(localFile, '{"reasoningEffort":"high"}')
  const config = nativeConfiguration(home, timeout())
  const base = await config.read(input('settings'))
  assert.deepEqual(JSON.parse(base.text), { model: 'existing-model' })
  await assert.rejects(save(config, input('settings'), '{"customModels":[]}'), /supported Droid preference/)
  await save(config, input('settings'), '{"model":"custom:updated","disabledSkills":["review-patch"],"blockOnMcpLoad":true}')
  assert.deepEqual(JSON.parse(await readFile(rootFile, 'utf8')), {
    ...original, model: 'custom:updated', disabledSkills: ['review-patch'], blockOnMcpLoad: true,
  })
  assert.equal(await readFile(localFile, 'utf8'), '{"reasoningEffort":"high"}')
  await save(config, input('settings-local'), '{"reasoningEffort":"low"}')
  assert.deepEqual(JSON.parse(await readFile(localFile, 'utf8')), { reasoningEffort: 'low' })
  await writeFile(rootFile, '{"broken":')
  await assert.rejects(config.read(input('settings')), /Repair/)
  assert.equal(await readFile(rootFile, 'utf8'), '{"broken":')
})

test('stale and concurrent saves cannot replace another editor’s settings', async t => {
  const home = await temporaryHome(t)
  const config = nativeConfiguration(home, timeout())
  const selection = input('settings')
  const first = await config.read(selection)
  const values = await Promise.allSettled([
    config.save({ ...selection, revision: first.revision, text: '{"model":"first"}' }),
    config.save({ ...selection, revision: first.revision, text: '{"model":"second"}' }),
  ])
  assert.equal(values.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(values.filter(item => item.status === 'rejected').length, 1)
  assert.match(values.find(item => item.status === 'rejected').reason.message, /changed/)
})

test('configured scope refuses traversal and file or directory links', async t => {
  const home = await temporaryHome(t)
  const config = nativeConfiguration(home, timeout())
  await assert.rejects(config.read(input('skill', '../outside')), /lowercase skill/)
  await assert.rejects(config.read(input('mcp', '__proto__')), /valid MCP/)
  const outside = join(home, 'other')
  await mkdir(outside)
  const native = join(home, '.factory')
  const protectedFile = join(outside, 'settings.json')
  await writeFile(protectedFile, '{"model":"outside"}')
  await symlink(outside, native, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(config.read(input('settings')), /without links/)
  if (process.platform !== 'win32') {
    await unlink(native)
    await mkdir(native)
    const missing = await config.read(input('settings'))
    await symlink(protectedFile, join(native, 'settings.json'), 'file')
    await assert.rejects(config.read(input('settings')), /without links/)
    await assert.rejects(config.save({ ...input('settings'), revision: missing.revision, text: '{}' }), /without links/)
  }
  assert.equal(await readFile(protectedFile, 'utf8'), '{"model":"outside"}')
})

test('registration exposes three owned settings pages and validates RPC ownership before touching files', async t => {
  const home = await temporaryHome(t)
  const actualEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }
  process.env.HOME = process.env.USERPROFILE = home
  t.after(() => {
    for (const [key, value] of Object.entries(actualEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const registrations = new Map()
  const owner = { userId: 13, profile: 'owner-profile' }
  let agent
  let agentDisposed = false
  const dispose = apply({ identity: owner, paths: { dataDir: join(home, 'data') }, extensions: {
    agents: { register(value) { agent = value; return { dispose() { agentDisposed = true } } } },
    rpc: { register(name, callback) { registrations.set(name, callback); return () => registrations.delete(name) } },
  } })
  assertContracts(contract)
  assert.equal(manifest.client, 'client.mjs')
  assert.deepEqual(manifest.views.map(({ id, slot }) => [id, slot]), [
    ['skills', 'agent-settings'], ['mcp', 'agent-settings'], ['settings', 'agent-settings'],
  ])
  const run = { signal: timeout(), identity: owner }
  assert.deepEqual(agent.management.settings(run), { viewId: 'skills' })
  const read = registrations.get('read-native-config')
  const wrong = { ...run, identity: { ...owner, profile: 'other' } }
  assert.throws(() => agent.management.settings(wrong), /enabled the plugin/)
  await assert.rejects(read(input('settings'), wrong), /enabled the plugin/)
  await assert.rejects(read({ resource: 'settings', path: 'absolute-external' }, run), /unknown property/)
  assert.equal((await read(input('settings'), run)).path, join(home, '.factory', 'settings.json'))
  assert.equal(factoryUserHome(), home)
  assert.equal(globalDroidEngine({ env: { HOME: home, USERPROFILE: home } }).env.FACTORY_HOME_OVERRIDE, home)
  await dispose()
  assert.equal(agentDisposed, true)
  assert.equal(registrations.size, 0)
})
