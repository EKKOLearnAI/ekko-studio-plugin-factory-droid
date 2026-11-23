import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isMap, parseDocument } from './vendor-yaml.mjs'

const limit = 256 * 1024
const skillName = /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/
const serverName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/
const forbidden = new Set(['__proto__', 'constructor', 'prototype'])
const deviceName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const efforts = new Set(['off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'dynamic'])
const settingsFields = {
  model: value => typeof value === 'string' && /^[\w./:@+-]{1,256}$/.test(value),
  reasoningEffort: value => efforts.has(value),
  disabledSkills: value => Array.isArray(value) && value.length <= 512 && value.every(item => typeof item === 'string' && skillName.test(item)),
  blockOnMcpLoad: value => typeof value === 'boolean',
  streamAssistantResponses: value => typeof value === 'boolean',
}
const resources = new Set(['skill', 'mcp', 'settings', 'settings-local'])
const mcpFields = ['type', 'command', 'args', 'env', 'url', 'headers', 'oauth', 'disabled']
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const version = snapshot => createHash('sha256').update(snapshot.exists ? 'present\0' : 'absent\0').update(snapshot.text).digest('hex')
const pending = new Map()

function checkResource(resource, name) {
  if (!resources.has(resource)) throw new Error('Unknown Droid configuration resource.')
  if (resource === 'skill') {
    if (!skillName.test(name ?? '') || deviceName.test(name)) throw new Error('Use a lowercase skill name with letters, numbers or hyphens.')
  } else if (resource === 'mcp') {
    if (!serverName.test(name ?? '') || forbidden.has(name)) throw new Error('Use a valid MCP server name.')
  } else if (name !== undefined) throw new Error('A settings file has no item name.')
}

async function folder(path, create = false) {
  if (create) {
    try { await mkdir(path, { mode: 0o700 }) }
    catch (error) { if (error.code !== 'EEXIST') throw error }
  }
  try {
    if (!(await lstat(path)).isDirectory() || await realpath(path) !== path) {
      throw new Error('Droid configuration directories must be regular directories without links.')
    }
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function snapshot(path) {
  let handle
  try {
    if (!(await lstat(path)).isFile() || await realpath(path) !== path) {
      throw new Error('Droid configuration entries must be regular files without links.')
    }
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    const info = await handle.stat()
    if (!info.isFile() || info.size > limit) throw new Error('Droid configuration exceeds the 256 KiB file limit.')
    const bytes = await handle.readFile()
    if (bytes.length > limit) throw new Error('Droid configuration exceeds the 256 KiB file limit.')
    let text
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
    catch { throw new Error('Droid configuration must be valid UTF-8.') }
    return { exists: true, text }
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, text: '' }
    throw error
  } finally { await handle?.close() }
}

function checkRevision(saved, requested) {
  if (version(saved) !== requested) throw new Error('The native file changed. Reload it before saving.')
}

async function replace(path, text, revision, signal) {
  if (Buffer.byteLength(text) > limit) throw new Error('Droid configuration exceeds the 256 KiB file limit.')
  const parent = dirname(path)
  const temporary = join(parent, '.studio-droid-' + randomUUID())
  await folder(parent)
  try {
    await writeFile(temporary, text, { mode: 0o600, flag: 'wx', signal })
    await folder(parent)
    checkRevision(await snapshot(path), revision)
    signal.throwIfAborted()
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}

function serialize(root, work) {
  const active = (pending.get(root) ?? Promise.resolve()).catch(() => {}).then(work)
  pending.set(root, active)
  return active.finally(() => { if (pending.get(root) === active) pending.delete(root) })
}

function parseJson(text) {
  let value
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { throw new Error('Enter a valid JSON object.') }
  if (!isRecord(value)) throw new Error('Droid configuration must be a JSON object.')
  return value
}

function jsonText(value) { return JSON.stringify(value, null, 2) + '\n' }

function readJson(saved) {
  if (!saved.exists) return {}
  try { return parseJson(saved.text) }
  catch { throw new Error('The native file is not a valid JSON object. Repair it in Droid or a text editor first.') }
}

function skillParts(text) {
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(text)
  const header = match?.index === 0 ? match : undefined
  if (!header && /^(?:\uFEFF)?---(?:\r?\n|$)/.test(text)) throw new Error('Repair the SKILL.md frontmatter in Droid first.')
  const document = parseDocument(header?.[1] ?? '')
  if (document.errors.length || document.contents !== null && !isMap(document.contents)) {
    throw new Error('Repair the SKILL.md frontmatter in Droid first.')
  }
  return { document, metadata: document.toJS({ maxAliasCount: 20 }) ?? {},
    body: header ? text.slice(header[0].length).replace(/^\r?\n/, '') : text }
}

function skillDocument(name, text) {
  const { metadata } = skillParts(text)
  if (metadata.name !== name || typeof metadata.description !== 'string' || !metadata.description.trim()) {
    throw new Error('SKILL.md needs frontmatter with the matching name and a nonempty description.')
  }
  return text.endsWith('\n') ? text : text + '\n'
}

function settingsView(file) {
  const view = {}
  for (const [key, valid] of Object.entries(settingsFields)) {
    if (!Object.hasOwn(file, key)) continue
    if (!valid(file[key])) throw new Error('A supported native setting has an invalid value. Repair it in the native file first.')
    view[key] = file[key]
  }
  return view
}

function applySettings(file, view) {
  for (const [key, value] of Object.entries(view)) {
    if (!Object.hasOwn(settingsFields, key) || !settingsFields[key](value)) throw new Error('Use supported Droid preference keys and values.')
  }
  const updated = { ...file }
  for (const key of Object.keys(settingsFields)) delete updated[key]
  return { ...updated, ...view }
}

function mcpEntries(file) {
  const servers = Object.hasOwn(file, 'mcpServers') ? file.mcpServers : {}
  if (!isRecord(servers)) throw new Error('The native MCP file needs an mcpServers object.')
  return servers
}

function redactMap(value) {
  return isRecord(value) ? Object.fromEntries(Object.keys(value).map(key => [key, null])) : null
}

function mcpView(entry) {
  if (!isRecord(entry)) throw new Error('This native MCP entry is not an object.')
  const type = entry.type ?? 'stdio'
  if (!['stdio', 'http', 'sse'].includes(type)) throw new Error('This native MCP transport cannot be edited here.')
  const view = { type, disabled: entry.disabled === true }
  if (type === 'stdio') {
    if (typeof entry.command === 'string') view.command = entry.command
    if (Object.hasOwn(entry, 'args')) view.args = null
    if (Object.hasOwn(entry, 'env')) view.env = redactMap(entry.env)
  } else {
    if (Object.hasOwn(entry, 'url')) view.url = null
    if (Object.hasOwn(entry, 'headers')) view.headers = redactMap(entry.headers)
    if (Object.hasOwn(entry, 'oauth')) view.oauth = entry.oauth === false ? false : null
  }
  return view
}

function keepValue(value, saved) {
  if (value !== null) return value
  if (saved === undefined) throw new Error('A null placeholder needs an existing native value.')
  return saved
}

function credentials(value, fallback) {
  if (!isRecord(value) || Object.keys(value).length > 128) throw new Error('Credentials must be an object with text values.')
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (forbidden.has(key) || typeof key !== 'string' || key.length > 128 || !key.trim()) throw new Error('Invalid credential name.')
    const revealed = keepValue(item, Object.hasOwn(fallback, key) ? fallback[key] : undefined)
    if (typeof revealed !== 'string') throw new Error('Credential values must be text or null placeholders.')
    return [key, revealed]
  }))
}

function applyMcp(entry, view) {
  if (Object.keys(view).some(key => !mcpFields.includes(key))) throw new Error('Use supported MCP fields.')
  const type = view.type ?? 'stdio'
  if (!['stdio', 'http', 'sse'].includes(type)) throw new Error('MCP supports stdio, http and sse.')
  if (view.disabled !== undefined && typeof view.disabled !== 'boolean') throw new Error('The disabled field must be true or false.')
  if (entry && !isRecord(entry)) throw new Error('This native MCP entry is not an object.')
  const before = entry ?? {}
  if (entry && (before.type ?? 'stdio') !== type) throw new Error('Create a new MCP entry to use a different transport.')
  const updated = { ...before, type, disabled: view.disabled ?? false }
  if (type === 'stdio') {
    if (['url','headers','oauth'].some(key => Object.hasOwn(view, key))) throw new Error('stdio servers use command, args and env.')
    if (typeof view.command !== 'string' || !view.command.trim() || /[\x00-\x1f]/.test(view.command)) throw new Error('A stdio server needs an executable command.')
    updated.command = view.command
    if (Object.hasOwn(view, 'args')) {
      const args = keepValue(view.args, before.args)
      if (!Array.isArray(args) || args.length > 128 || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) {
        throw new Error('MCP arguments must be an array of text values.')
      }
      updated.args = args
    }
    if (Object.hasOwn(view, 'env')) {
      updated.env = view.env === null ? keepValue(null, before.env) : credentials(view.env, isRecord(before.env) ? before.env : {})
    }
  } else {
    if (['command','args','env'].some(key => Object.hasOwn(view, key))) throw new Error('Remote servers use url, headers and oauth.')
    try {
      const raw = keepValue(view.url, before.url)
      const url = new URL(raw)
      if (typeof raw !== 'string' || !['http:', 'https:'].includes(url.protocol)) throw new Error()
      updated.url = raw
    } catch { throw new Error('An HTTP or SSE MCP server needs an HTTP(S) URL.') }
    if (Object.hasOwn(view, 'headers')) {
      updated.headers = view.headers === null ? keepValue(null, before.headers) : credentials(view.headers, isRecord(before.headers) ? before.headers : {})
    }
    if (Object.hasOwn(view, 'oauth')) {
      if (view.oauth !== null && view.oauth !== false) throw new Error('Use false to disable OAuth or null to retain a native override.')
      updated.oauth = keepValue(view.oauth, before.oauth)
    }
  }
  return updated
}

export function nativeConfiguration(home, signal) {
  async function configRoot() { return join(await realpath(home), '.factory') }
  async function locate(root, resource, name, create = false) {
    const exists = await folder(root, create)
    if (resource === 'skill') {
      const skills = join(root, 'skills')
      if (exists && await folder(skills, create)) await folder(join(skills, name), create)
      return join(skills, name, 'SKILL.md')
    }
    return join(root, resource === 'mcp' ? 'mcp.json' : resource === 'settings-local' ? 'settings.local.json' : 'settings.json')
  }

  async function skillLedger(root) {
    const basePath = join(root, 'settings.json')
    const localPath = join(root, 'settings.local.json')
    const [base, local] = await Promise.all([snapshot(basePath), snapshot(localPath)])
    const localConfig = readJson(local)
    const useLocal = Object.hasOwn(localConfig, 'disabledSkills')
    const file = useLocal ? localConfig : readJson(base)
    const disabled = Object.hasOwn(file, 'disabledSkills') ? file.disabledSkills : []
    if (!settingsFields.disabledSkills(disabled)) throw new Error('Repair disabledSkills in the native Droid settings first.')
    const revision = createHash('sha256').update(version(base)).update(version(local)).digest('hex')
    return { path: useLocal ? localPath : basePath, saved: useLocal ? local : base, file, disabled, revision }
  }

  function skillState(metadata, name, ledger) {
    if (metadata.name !== name || typeof metadata.description !== 'string' || !metadata.description.trim()) return 'unavailable'
    return metadata.enabled === false || ledger?.disabled.includes(name) ? 'disabled' : ledger ? 'enabled' : 'unavailable'
  }

  return {
    async overview({ resource }) {
      signal.throwIfAborted()
      const root = await configRoot()
      if (resource === 'mcp') {
        const path = await locate(root, resource)
        const saved = await snapshot(path)
        const revision = version(saved)
        const entries = mcpEntries(readJson(saved))
        const items = Object.keys(entries).filter(name => serverName.test(name) && !forbidden.has(name)).sort().map(name => {
          try {
            const entry = mcpView(entries[name])
            return { name, revision, state: entry.disabled ? 'disabled' : 'enabled', transport: entry.type,
              description: typeof entry.command === 'string' ? entry.command.slice(0, 2000) : '', readOnly: false, canToggle: true }
          } catch { return { name, state: 'unavailable', description: '', readOnly: true, canToggle: false } }
        })
        return { path, items }
      }
      const path = join(root, 'skills')
      const items = []
      if (!await folder(root) || !await folder(path)) return { path, items }
      const ledger = await skillLedger(root).catch(() => null)
      for (const entry of await readdir(path, { withFileTypes: true })) {
        signal.throwIfAborted()
        const name = entry.name
        if (!skillName.test(name) || deviceName.test(name)) continue
        const file = join(path, name, 'SKILL.md')
        try {
          if (entry.isSymbolicLink()) throw new Error('A linked directory is read-only.')
          if (!entry.isDirectory()) continue
          const saved = await snapshot(file)
          if (!saved.exists) continue
          const { metadata } = skillParts(saved.text)
          const state = skillState(metadata, name, ledger)
          const description = typeof metadata.description === 'string' ? metadata.description : ''
          const readOnly = description.length > 2000
          items.push({ name, state, revision: version(saved), description: description.slice(0, 2000),
            readOnly, canToggle: !readOnly && state !== 'unavailable' && metadata.enabled !== false, path: file })
        } catch {
          items.push({ name, state: 'unavailable', description: '', readOnly: true, canToggle: false, path: file })
        }
      }
      return { path, items: items.sort((a, b) => a.name.localeCompare(b.name)), ...(ledger ? { ledgerRevision: ledger.revision, ledgerPath: ledger.path } : {}) }
    },
    async editSkill({ name, revision, description, content }) {
      checkResource('skill', name)
      if (!description.trim() || !content.trim()) throw new Error('A Skill requires a description and Markdown content.')
      const root = await configRoot()
      return serialize(root, async () => {
        signal.throwIfAborted()
        const path = await locate(root, 'skill', name)
        const saved = await snapshot(path)
        checkRevision(saved, revision)
        const { document, metadata, body } = skillParts(saved.text)
        if (metadata.name === name && metadata.description === description.trim() && body === content) return { ok: true }
        document.set('name', name)
        document.set('description', description.trim())
        const markdown = skillDocument(name, `---\n${document.toString({ lineWidth: 0 })}---\n\n${content}`)
        await locate(root, 'skill', name, true)
        await replace(path, markdown, revision, signal)
        return { ok: true }
      })
    },
    async toggleSkill({ name, revision, ledgerRevision, enabled }) {
      checkResource('skill', name)
      const root = await configRoot()
      return serialize(root, async () => {
        signal.throwIfAborted()
        const saved = await snapshot(await locate(root, 'skill', name))
        checkRevision(saved, revision)
        const { metadata } = skillParts(saved.text)
        const ledger = await skillLedger(root)
        if (ledger.revision !== ledgerRevision) throw new Error('The native Skill settings changed. Refresh before editing.')
        if (metadata.enabled === false || skillState(metadata, name, ledger) === 'unavailable') {
          throw new Error('This Skill cannot be toggled in the personal settings.')
        }
        if (enabled === !ledger.disabled.includes(name)) return { ok: true }
        const disabledSkills = enabled ? ledger.disabled.filter(value => value !== name) : [...ledger.disabled, name]
        if (!settingsFields.disabledSkills(disabledSkills)) throw new Error('The native disabledSkills list is full.')
        await replace(ledger.path, jsonText({ ...ledger.file, disabledSkills }), version(ledger.saved), signal)
        return { ok: true }
      })
    },
    async list({ resource }) {
      signal.throwIfAborted()
      const root = await configRoot()
      if (resource === 'mcp') {
        const docs = readJson(await snapshot(await locate(root, resource)))
        return { names: Object.keys(mcpEntries(docs)).filter(key => serverName.test(key) && !forbidden.has(key)).sort() }
      }
      const skills = join(root, 'skills')
      const names = []
      if (await folder(root) && await folder(skills)) {
        for (const entry of await readdir(skills, { withFileTypes: true })) {
          if (!entry.isDirectory() || !skillName.test(entry.name) || deviceName.test(entry.name)) continue
          const found = await lstat(join(skills, entry.name, 'SKILL.md')).catch(error => { if (error.code !== 'ENOENT') throw error })
          if (found?.isFile()) names.push(entry.name)
        }
      }
      return { names: names.sort() }
    },
    async read({ resource, name }) {
      checkResource(resource, name)
      signal.throwIfAborted()
      const path = await locate(await configRoot(), resource, name)
      const saved = await snapshot(path)
      let text = saved.text
      let exists = saved.exists
      if (resource === 'skill' && !exists) {
        text = `---\nname: ${name}\ndescription: Describe when Droid should use this skill.\n---\n\n# ${name}\n`
      } else if (resource === 'mcp') {
        const servers = mcpEntries(readJson(saved))
        exists = Object.hasOwn(servers, name)
        text = jsonText(exists ? mcpView(servers[name]) : { type: 'stdio', command: '', args: [], disabled: false })
      } else if (resource !== 'skill') {
        text = jsonText(settingsView(readJson(saved)))
      }
      return { path, revision: version(saved), text, exists }
    },
    async save({ resource, name, revision, text }) {
      checkResource(resource, name)
      const root = await configRoot()
      return serialize(root, async () => {
        signal.throwIfAborted()
        const path = await locate(root, resource, name)
        const saved = await snapshot(path)
        checkRevision(saved, revision)
        let updated
        if (resource === 'skill') {
          updated = skillDocument(name, text)
        } else if (resource === 'mcp') {
          const file = readJson(saved)
          const servers = mcpEntries(file)
          const before = Object.hasOwn(servers, name) ? servers[name] : undefined
          updated = jsonText({ ...file, mcpServers: { ...servers, [name]: applyMcp(before, parseJson(text)) } })
        } else {
          const file = readJson(saved)
          settingsView(file)
          updated = jsonText(applySettings(file, parseJson(text)))
        }
        await locate(root, resource, name, true)
        await replace(path, updated, revision, signal)
        return { ok: true }
      })
    },
    async remove({ resource, name, revision }) {
      if (!['skill', 'mcp'].includes(resource)) throw new Error('Select a skill or MCP server to remove.')
      checkResource(resource, name)
      const root = await configRoot()
      return serialize(root, async () => {
        signal.throwIfAborted()
        const path = await locate(root, resource, name)
        const saved = await snapshot(path)
        checkRevision(saved, revision)
        if (resource === 'skill') {
          signal.throwIfAborted()
          if (saved.exists) await unlink(path)
        } else if (saved.exists) {
          const file = readJson(saved)
          const servers = mcpEntries(file)
          if (Object.hasOwn(servers, name)) {
            delete servers[name]
            await replace(path, jsonText({ ...file, mcpServers: servers }), revision, signal)
          }
        }
        return { ok: true }
      })
    },
  }
}
