import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Acp } from './acp.mjs'
import { childEnv } from './engine.mjs'
import { acpServers, promptContent, text, validId } from './protocol.mjs'
import { permissionTitle } from './turn.mjs'

export const scopedProtocols = ['chat_completions']
// Envelope negotiated by the official Factory TypeScript SDK 0.11.0.
const factoryProtocol = '1.332.0'
const endpoint = '/chat/completions'
const permittedImages = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const reasoningEfforts = new Set(['off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'dynamic'])
const maxRequestBytes = 24 * 1024 * 1024

function modelEndpoint(model) {
  if (!scopedProtocols.includes(model?.apiMode) || !validId(model?.model) ||
      typeof model.token !== 'string' || !model.token) throw new Error('A Studio Chat Completions model binding is required for Droid.')
  try {
    const target = new URL(model.baseUrl)
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) throw new Error()
    target.pathname = target.pathname.replace(/\/+$/, '') + endpoint
    return target
  } catch {
    throw new Error('The Studio scoped model endpoint is invalid.')
  }
}

async function requestBody(request, expectedModel) {
  const chunks = []
  let size = 0
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length
      if (size > maxRequestBytes) { request.resume(); return null }
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)
    return JSON.parse(body).model === expectedModel ? body : null
  } catch {
    return null
  }
}

async function modelProxy(model, signal) {
  const target = modelEndpoint(model)
  const key = randomBytes(32).toString('base64url')
  let used = false
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== 'Bearer ' + key) { response.writeHead(401).end(); return }
    if (request.method !== 'POST' || request.url !== '/v1' + endpoint) { response.writeHead(404).end(); return }
    const connection = new AbortController()
    response.once('close', () => connection.abort())
    const body = await requestBody(request, model.model)
    if (!body) { response.writeHead(400).end(); return }
    try {
      const reply = await fetch(target, {
        method: 'POST', body, redirect: 'error',
        headers: { authorization: 'Bearer ' + model.token, 'content-type': 'application/json' },
        signal: AbortSignal.any([signal, connection.signal]),
      })
      if (!reply.ok) {
        await reply.body?.cancel()
        response.writeHead(reply.status, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: { message: 'Studio model request failed.' } }))
        return
      }
      used = true
      response.writeHead(reply.status, {
        'content-type': reply.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store',
      })
      if (reply.body) await pipeline(Readable.fromWeb(reply.body), response)
      else response.end()
    } catch {
      if (!response.headersSent) response.writeHead(502).end()
      else response.destroy()
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  let closing
  return { key, baseUrl: `http://127.0.0.1:${server.address().port}/v1`, used: () => used,
    close: () => closing ??= new Promise(resolve => { server.close(resolve); server.closeAllConnections() }) }
}

async function makeScope(model, paths, engine, signal) {
  modelEndpoint(model)
  signal.throwIfAborted()
  await mkdir(paths.runtimeDir, { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(join(paths.runtimeDir, 'droid-scoped-'))
  let proxy
  const dispose = async () => {
    try { await proxy?.close() }
    finally { await rm(directory, { force: true, recursive: true, maxRetries: 3 }) }
  }
  try {
    proxy = await modelProxy(model, signal)
    const home = join(directory, 'home')
    const factory = join(home, '.factory')
    await mkdir(factory, { recursive: true, mode: 0o700 })
    const displayName = 'Ekko-Studio-' + randomUUID()
    const modelId = 'custom:' + displayName + '-0'
    const reasoningEffort = reasoningEfforts.has(model.reasoningEffort) ? model.reasoningEffort : undefined
    const settings = {
      customModels: [{
        displayName, model: model.model, provider: 'generic-chat-completion-api', baseUrl: proxy.baseUrl, apiKey: proxy.key,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(Number.isInteger(model.contextWindow) && model.contextWindow > 0 ? { maxContextLimit: model.contextWindow } : {}),
        ...(Number.isInteger(model.outputLimit) && model.outputLimit > 0 ? { maxOutputTokens: model.outputLimit } : {}),
      }],
      model: modelId, compactionModel: 'same', modelFallbacks: {}, streamAssistantResponses: true,
    }
    const settingsPath = join(factory, 'settings.json')
    await writeFile(settingsPath, JSON.stringify(settings), { mode: 0o600, signal })
    const env = childEnv(engine.env)
    delete env.FACTORY_API_KEY
    Object.assign(env, {
      FACTORY_HOME_OVERRIDE: home, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
      XDG_CONFIG_HOME: home, XDG_DATA_HOME: home, XDG_CACHE_HOME: home, TMPDIR: directory, TEMP: directory, TMP: directory,
    })
    const prefix = engine.args.slice(0, -3)
    return { proxy, modelId, reasoningEffort, env, dispose, args: [
      ...prefix, 'exec', '--input-format', 'stream-jsonrpc', '--output-format', 'stream-jsonrpc', '--settings', settingsPath,
    ] }
  } catch (error) {
    await dispose()
    throw error
  }
}

async function sdkInput(input, run, signal) {
  const blocks = await promptContent(input, run, { image: true, embeddedContext: true }, true, signal)
  const content = []
  const files = []
  for (const part of blocks) {
    if (part.type === 'text') {
      content.push(part)
    } else if (part.type === 'image' && permittedImages.has(part.mimeType)) {
      content.push({ type: 'image', source: { type: 'base64', data: part.data, mediaType: part.mimeType } })
    } else if (part.type === 'resource') {
      const resource = part.resource
      const name = decodeURIComponent(resource.uri.split('/').at(-1))
      if (resource.mimeType === 'application/pdf' && resource.blob) {
        files.push({ type: 'base64', mediaType: 'application/pdf', data: resource.blob, name })
      } else if (typeof resource.text === 'string') {
        files.push({ type: 'text', mediaType: 'text/plain', data: resource.text, name })
      } else {
        throw new Error('Droid scoped mode supports UTF-8 text and PDF files.')
      }
    } else {
      throw new Error('Droid scoped mode supports PNG, JPEG, GIF and WebP images.')
    }
  }
  const prompt = content.filter(part => part.type === 'text').map(part => part.text).join('\n\n')
  return { text: prompt, ...(content.length ? { content } : {}), ...(files.length ? { files } : {}),
    queuePlacement: 'end_of_turn' }
}

function sdkServers(servers) {
  return acpServers(servers, { sse: true, http: true }).map(server => {
    if (!server.command) return server
    return { ...server, env: Object.fromEntries(server.env.map(({ name, value }) => [name, value])) }
  })
}

function permissionDetails(toolUses, key) {
  return toolUses.map(({ toolUse }) => {
    const args = toolUse?.input ?? {}
    const target = [args.command, args.file_path, args.filePath, args.path, args.url].find(value => typeof value === 'string')
    return permissionTitle([toolUse?.name, target].filter(Boolean).join(' '), key)
  }).filter(Boolean).join('\n').slice(0, 1000)
}

function sdkTurn(engine, scope, cwd, run, signal) {
  const acp = new Acp(engine.executable, scope.args, { cwd, env: scope.env }, onFrame, factoryProtocol)
  const completion = Promise.withResolvers()
  const interrupted = Promise.withResolvers()
  const permissions = new Set()
  const tools = new Set()
  const messages = new Map()
  let updates = Promise.resolve()
  let updateError
  let sessionId
  let active = false
  let denied = false

  function respond(id, outcome) {
    if (permissions.delete(id)) acp.respond(id, { selectedOption: outcome })
  }

  function cancelPermissions() {
    for (const id of permissions) respond(id, 'cancel')
  }

  async function permission(id, params) {
    if (permissions.has(id)) return
    permissions.add(id)
    let decision = 'cancel'
    try {
      const valid = active && !signal.aborted && !params?.workerSessionId &&
        (!params?.associatedSessionIds || params.associatedSessionIds.includes(sessionId))
      const once = params?.options?.filter(option => option.value === 'proceed_once').length === 1
      const tools = Array.isArray(params?.toolUses) ? params.toolUses : []
      const details = permissionDetails(tools, scope.proxy.key)
      if (valid && once && details) {
        const result = await run.interactions.approve({
          operationId: randomUUID(), title: 'Factory Droid tool permission', details,
        })
        if (result.outcome === 'approved' && active && !signal.aborted) decision = 'proceed_once'
        if (result.outcome === 'denied' && active && !signal.aborted) denied = true
      }
    } catch { /* An unavailable interaction leaves the request cancelled. */ }
    respond(id, decision)
  }

  async function event(notification) {
    const { type, messageId, textDelta, message, toolUse, toolUseId, isError } = notification
    if (type === 'assistant_text_delta' && validId(messageId) && typeof textDelta === 'string') {
      messages.set(messageId, (messages.get(messageId) ?? '') + textDelta)
      await run.output.emit({ type: 'text.delta', text: textDelta })
    } else if (type === 'create_message' && message?.role === 'assistant' && validId(message.id) && !messages.has(message.id)) {
      const value = (message.content ?? []).filter(part => part.type === 'text' && typeof part.text === 'string')
        .map(part => part.text).join('')
      if (value) {
        messages.set(message.id, value)
        await run.output.emit({ type: 'text.delta', text: value })
      }
    } else if (type === 'assistant_message_retracted') {
      messages.delete(messageId)
    } else if (type === 'tool_call' && validId(toolUse?.id) && !tools.has(toolUse.id)) {
      tools.add(toolUse.id)
      const name = typeof toolUse.name === 'string' && /^[\w.:-]{1,80}$/.test(toolUse.name) ? toolUse.name : 'Droid tool'
      await run.output.emit({ type: 'tool.started', callId: toolUse.id, name, input: {} })
    } else if (type === 'tool_result' && tools.delete(toolUseId)) {
      await run.output.emit(isError
        ? { type: 'tool.failed', callId: toolUseId, error: 'Droid tool failed, was denied, or was cancelled.' }
        : { type: 'tool.completed', callId: toolUseId, result: null })
    }
  }

  function onFrame({ id, method, params }) {
    if (id !== undefined) {
      if (method === 'droid.request_permission') void permission(id, params)
      else acp.methodNotFound(id)
      return
    }
    if (!active || signal.aborted || method !== 'droid.session_notification' ||
        (params?.sessionId && params.sessionId !== sessionId) || !params?.notification) return
    const n = params.notification
    if (n.type === 'agent_turn_completed') {
      active = false
      completion.resolve(n.reason)
    } else {
      updates = updates.then(async () => {
        if (!signal.aborted && !updateError) await event(n)
      }).catch(error => { updateError = error })
    }
  }

  function abort() {
    if (active) void acp.request('droid.interrupt_session', {}, AbortSignal.timeout(750)).catch(() => {})
    completion.resolve('cancelled')
    interrupted.resolve()
    cancelPermissions()
  }
  signal.addEventListener('abort', abort, { once: true })
  return {
    async run(input) {
      const startup = AbortSignal.any([signal, AbortSignal.timeout(25_000)])
      const init = await acp.request('droid.initialize_session', {
        machineId: 'default', cwd, modelId: scope.modelId, specModeModelId: scope.modelId,
        interactionMode: 'auto', autonomyLevel: 'off', autoRejectPermissionRequests: false,
        ...(scope.reasoningEffort ? { reasoningEffort: scope.reasoningEffort } : {}),
        mcpServers: sdkServers(run.mcpServers ?? {}),
      }, startup)
      if (!validId(init?.sessionId) || init.settings?.modelId !== scope.modelId) {
        throw new Error('Droid did not confirm the bound Studio model.')
      }
      sessionId = init.sessionId
      signal.throwIfAborted()
      active = true
      await acp.request('droid.add_user_message', input, signal)
      const reason = await Promise.race([completion.promise, acp.closed.then(() => 'process_exit')])
      await Promise.race([updates, interrupted.promise])
      signal.throwIfAborted()
      if (updateError) throw updateError
      for (const callId of tools) {
        await run.output.emit({ type: 'tool.failed', callId, error: 'Droid ended the turn before reporting a tool result.' })
      }
      if (reason !== 'completed' && reason !== 'permission_rejected' && !(reason === 'cancelled' && denied)) {
        const known = ['cancelled', 'error', 'process_exit', 'model_authentication_failed', 'model_request_rejected',
          'model_provider_unreachable', 'model_provider_unavailable', 'model_rate_limited', 'model_usage_exhausted', 'no_approver_available']
        const details = known.includes(reason) ? ` (${reason})` : ''
        throw new Error(`Droid could not complete the Studio model turn${details}.`)
      }
      if (!scope.proxy.used()) throw new Error('Droid did not receive a response from the selected Studio model.')
      return { content: [text([...messages.values()].join(''))], finishReason: 'stop' }
    },
    async close() {
      cancelPermissions()
      signal.removeEventListener('abort', abort)
      await acp.close({ cancel: signal.aborted && active })
    },
  }
}

export async function runScoped(input, run, engine, cwd, signal) {
  const payload = await sdkInput(input, run, signal)
  const scope = await makeScope(run.model, run.paths, engine, signal)
  let turn
  let disposal
  const dispose = () => disposal ??= (async () => {
    try { await turn?.close() }
    finally { await scope.dispose() }
  })()
  try {
    signal.throwIfAborted()
    turn = sdkTurn(engine, scope, cwd, run, signal)
    run.lifecycle.add(dispose)
    return await turn.run(payload)
  } finally {
    await dispose()
  }
}
