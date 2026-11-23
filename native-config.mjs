import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

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

function skillDocument(name, text) {
  const body = text.match(/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
  const declarations = [...(body ?? '').matchAll(/^name:[ \t]*(.*?)\r?$/gm)]
  const descriptions = [...(body ?? '').matchAll(/^description:[ \t]*(.*?)(?:\r?\n|$)/gm)]
  const declared = declarations[0]?.[1].trim()
  const description = descriptions[0]?.[1].trim()
  if (declarations.length !== 1 || ![name, `"${name}"`, `'${name}'`].includes(declared) ||
      descriptions.length !== 1 || !description || description.startsWith('#') || ['""', "''", 'null', '~'].includes(description)) {
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

  return {
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
