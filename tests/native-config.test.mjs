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

test('Skill cards and detail edits preserve YAML metadata and use the effective personal ledger', async t => {
  const home = await temporaryHome(t)
  const config = nativeConfiguration(home, timeout())
  const skill = input('skill', 'review-patch')
  const frontmatter = [
    '---', 'name: review-patch', 'description: >-', '  Check a patch.',
    '# preserve this', 'user-invocable: false', 'metadata:', '  owner: fixture', '---', '', 'Original body',
  ].join('\n')
  await save(config, skill, frontmatter)
  const base = input('settings')
  const local = input('settings-local')
  await save(config, base, '{"disabledSkills":["review-patch"]}')
  await save(config, local, '{"model":"other-setting","disabledSkills":["unrelated-skill"]}')
  let overview = await config.overview({ resource: 'skill' })
  let [item] = overview.items
  assert.equal(item.description, 'Check a patch.')
  assert.equal(item.state, 'enabled')
  assert.ok(overview.ledgerPath.endsWith('settings.local.json'))
  const stale = { name: item.name, revision: item.revision, ledgerRevision: overview.ledgerRevision, enabled: false }
  await config.editSkill({ name: item.name, revision: item.revision, description: 'Review: bugs and behavior', content: 'Edited body' })
  const edited = (await config.read(skill)).text
  assert.match(edited, /preserve this/)
  assert.match(edited, /user-invocable: false/)
  assert.match(edited, /metadata:\r?\n  owner: fixture/)
  assert.match(edited, /Edited body/)
  await assert.rejects(config.toggleSkill(stale), /changed/)
  overview = await config.overview({ resource: 'skill' })
  ;[item] = overview.items
  const current = { ...stale, revision: item.revision, ledgerRevision: overview.ledgerRevision }
  await config.toggleSkill(current)
  assert.deepEqual(JSON.parse((await config.read(local)).text), {
    model: 'other-setting', disabledSkills: ['unrelated-skill', 'review-patch'],
  })
  assert.deepEqual(JSON.parse((await config.read(base)).text), { disabledSkills: ['review-patch'] })
  await assert.rejects(config.toggleSkill({ ...current, enabled: true }), /settings changed/)
  overview = await config.overview({ resource: 'skill' })
  await config.toggleSkill({ ...current, enabled: true, ledgerRevision: overview.ledgerRevision })
  assert.equal((await config.overview({ resource: 'skill' })).items[0].state, 'enabled')

  await save(config, skill, edited.replace('user-invocable: false', 'enabled: false'))
  overview = await config.overview({ resource: 'skill' })
  ;[item] = overview.items
  assert.equal(item.state, 'disabled')
  assert.equal(item.canToggle, false)
  await assert.rejects(config.toggleSkill({ ...current, revision: item.revision,
    ledgerRevision: overview.ledgerRevision, enabled: true }), /cannot be toggled/)
})

test('Skill editor state and same-name recreation clear only the matching personal ledger entries', async t => {
  const home = await temporaryHome(t)
  const config = nativeConfiguration(home, timeout())
  const name = 'repeatable-skill'
  const selection = input('skill', name)
  const native = join(home, '.factory')
  await mkdir(native)
  const basePath = join(native, 'settings.json')
  const localPath = join(native, 'settings.local.json')
  await writeFile(basePath, JSON.stringify({ disabledSkills: [name, 'other-base'], privateField: 'keep-base' }))
  await writeFile(localPath, JSON.stringify({ disabledSkills: [name, 'other-local'], privateField: 'keep-local' }))
  const onDisk = async path => JSON.parse(await readFile(path, 'utf8'))
  const edit = async (enabled, content) => {
    const { ledgerRevision } = await config.overview({ resource: 'skill' })
    const { revision } = await config.read(selection)
    await config.editSkill({ name, ledgerRevision, revision, description: 'Fixture Skill', content, enabled })
  }
  await edit(false, 'First version')
  assert.deepEqual(await onDisk(basePath), { disabledSkills: ['other-base'], privateField: 'keep-base' })
  assert.deepEqual(await onDisk(localPath), { disabledSkills: [name, 'other-local'], privateField: 'keep-local' })
  await edit(true, 'Second version')
  assert.equal((await config.overview({ resource: 'skill' })).items[0].state, 'enabled')
  assert.match((await config.read(selection)).text, /Second version/)
  await edit(false, 'Second version')
  const { ledgerRevision } = await config.overview({ resource: 'skill' })
  const { revision } = await config.read(selection)
  await writeFile(basePath, JSON.stringify({ disabledSkills: ['other-base', name], privateField: 'keep-base' }))
  await assert.rejects(config.remove({ ...selection, revision, ledgerRevision }), /settings changed/)
  assert.equal((await config.read(selection)).exists, true)
  await remove(config, selection)
  assert.deepEqual(await onDisk(basePath), { disabledSkills: ['other-base'], privateField: 'keep-base' })
  assert.deepEqual(await onDisk(localPath), { disabledSkills: ['other-local'], privateField: 'keep-local' })
  await edit(true, 'Recreated')
  assert.equal((await config.overview({ resource: 'skill' })).items[0].state, 'enabled')
  assert.match((await config.read(selection)).text, /Recreated/)
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
  const unsupported = { type: 'future-protocol', token: 'secret-unsupported' }
  await writeFile(mcpFile, JSON.stringify({ mcpServers: { 'api-service': entry, unrelated, unsupported }, futureKey: 'keep' }))
  const inventory = await config.overview({ resource: 'mcp' })
  assert.doesNotMatch(JSON.stringify(inventory), /secret|private-value/)
  assert.deepEqual(inventory.items.map(({ name, transport, state, canToggle }) => [name, transport, state, canToggle]), [
    ['api-service', 'http', 'enabled', true], ['unrelated', 'stdio', 'enabled', true], ['unsupported', undefined, 'unavailable', false],
  ])
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
  assert.deepEqual(stored, { mcpServers: { 'api-service': { ...entry, disabled: true }, unrelated, unsupported }, futureKey: 'keep' })
  const fresh = input('mcp', 'new-local')
  await save(config, fresh, '{"type":"stdio","command":"node","args":["fixture.mjs"],"env":{},"disabled":true}')
  await assert.rejects(save(config, input('mcp', 'wrong'), '{"type":"http","url":"file:///outside"}'), /HTTP/)
  await assert.rejects(save(config, input('mcp', 'null-header'), '{"type":"http","url":"https://example.invalid/mcp","headers":{"Authorization":null}}'), /existing native value/)
  await assert.rejects(config.remove({ ...selected, revision: remote.revision }), /changed/)
  await remove(config, selected)
  stored = JSON.parse(await readFile(mcpFile, 'utf8'))
  assert.equal(stored.futureKey, 'keep')
  assert.deepEqual(stored.mcpServers.unrelated, unrelated)
  assert.deepEqual(stored.mcpServers.unsupported, unsupported)
  assert.equal(stored.mcpServers['new-local'].disabled, true)
  assert.equal(stored.mcpServers['api-service'], undefined)
})

test('MCP edits remove omitted fields, safely replace transports, and reject masked credentials for a different endpoint', async t => {
  const home = await temporaryHome(t)
  const config = nativeConfiguration(home, timeout())
  const selection = input('mcp', 'audit-service')
  const mcpPath = join(home, '.factory', 'mcp.json')
  await mkdir(join(home, '.factory'))
  const onDisk = async () => JSON.parse(await readFile(mcpPath, 'utf8'))
  await writeFile(mcpPath, JSON.stringify({ untouched: true, mcpServers: {
    'audit-service': { type: 'http', url: 'https://example.invalid/original', headers: { Authorization: 'secret' },
      oauth: { clientSecret: 'original' }, timeout: 2000 },
    sibling: { type: 'stdio', command: 'untouched' },
  } }))
  const projected = JSON.parse((await config.read(selection)).text)
  const oldDocument = await onDisk()
  await assert.rejects(save(config, selection, JSON.stringify({ ...projected, url: 'https://example.invalid/new' })), /existing native value/)
  assert.deepEqual(await onDisk(), oldDocument)
  await save(config, selection, JSON.stringify({ ...projected, type: 'sse' }))
  assert.deepEqual((await onDisk()).mcpServers['audit-service'], {
    ...oldDocument.mcpServers['audit-service'], type: 'sse', disabled: false,
  })
  await save(config, selection, '{"type":"stdio","command":"node","args":["fixture.mjs"],"env":{"TOKEN":"fixture"}}')
  assert.deepEqual((await onDisk()).mcpServers['audit-service'], {
    type: 'stdio', command: 'node', args: ['fixture.mjs'], env: { TOKEN: 'fixture' }, disabled: false, timeout: 2000,
  })
  const editor = JSON.parse((await config.read(selection)).text)
  delete editor.env
  await save(config, selection, JSON.stringify(editor))
  const document = await onDisk()
  assert.deepEqual(document, { untouched: true, mcpServers: { ...oldDocument.mcpServers, 'audit-service': {
    type: 'stdio', command: 'node', args: ['fixture.mjs'], disabled: false, timeout: 2000,
  } } })
  assert.equal(Object.hasOwn(JSON.parse((await config.read(selection)).text), 'env'), false)
})

test('invalid MCP entries are unavailable and cannot toggle until repaired', async t => {
  const home = await temporaryHome(t)
  const config = nativeConfiguration(home, timeout())
  const selection = input('mcp', 'bad-stdio')
  const root = join(home, '.factory')
  await mkdir(root)
  const mcpPath = join(root, 'mcp.json')
  const original = JSON.stringify({ mcpServers: { 'bad-stdio': { type: 'stdio' }, 'bad-http': { type: 'http' } } })
  await writeFile(mcpPath, original)
  const inventory = await config.overview({ resource: 'mcp' })
  assert(inventory.items.every(item => item.state === 'unavailable' && !item.canToggle && !item.readOnly))
  await assert.rejects(config.toggleMcp({ name: selection.name, revision: inventory.items[0].revision, enabled: false }), /needs an executable command/)
  assert.equal(await readFile(mcpPath, 'utf8'), original)
  await save(config, selection, '{"type":"stdio","command":"node","env":{"TOKEN":"keep"}}')
  const { revision } = await config.read(selection)
  await config.toggleMcp({ name: selection.name, revision, enabled: false })
  const stored = JSON.parse(await readFile(mcpPath, 'utf8')).mcpServers
  assert.deepEqual(stored['bad-stdio'], { type: 'stdio', command: 'node', env: { TOKEN: 'keep' }, disabled: true })
  assert.deepEqual(stored['bad-http'], { type: 'http' })
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
  await assert.rejects(registrations.get('overview-native-config')(input('skill'), wrong), /enabled the plugin/)
  await assert.rejects(registrations.get('native-engine-status')({}, wrong), /enabled the plugin/)
  await assert.rejects(read({ resource: 'settings', path: 'absolute-external' }, run), /unknown property/)
  assert.equal((await read(input('settings'), run)).path, join(home, '.factory', 'settings.json'))
  assert.equal(factoryUserHome(), home)
  assert.equal(globalDroidEngine({ env: { HOME: home, USERPROFILE: home } }).env.FACTORY_HOME_OVERRIDE, home)
  await dispose()
  assert.equal(agentDisposed, true)
  assert.equal(registrations.size, 0)
})
