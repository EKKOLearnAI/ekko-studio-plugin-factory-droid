import { Buffer } from 'node:buffer'
import { AcpError } from './acp.mjs'

export const loginRequired = 'Sign in with the Droid CLI on the Studio host, or set FACTORY_API_KEY in the Studio server environment.'
const attachmentLimit = 8 * 1024 * 1024
const authCode = -32000
export const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value
export const text = value => ({ type: 'text', text: value })

export async function initialize(acp, signal, version) {
  const hello = await acp.request('initialize', {
    protocolVersion: 1, clientCapabilities: {},
    clientInfo: { name: 'ekko-studio-factory-droid', version },
  }, signal)
  if (hello?.protocolVersion !== 1 || hello.agentInfo?.name !== '@factory/cli') {
    throw new Error('The executable did not identify itself as the Droid CLI ACP agent.')
  }
  const capabilities = hello.agentCapabilities ?? {}
  if (capabilities.auth?.status) {
    const status = await acp.request('auth/status', {}, signal)
    if (status?.state === 'unauthenticated') throw new Error(loginRequired)
  }
  return capabilities
}

export function sessionError(error) {
  return error instanceof AcpError && error.code === authCode ? new Error(loginRequired) : error
}

function stringPairs(values) {
  return Object.entries(values ?? {}).map(([name, value]) => ({ name, value: String(value) }))
}

export function acpServers(servers, capabilities) {
  return Object.entries(servers).map(([name, server]) => {
    if (typeof server.command === 'string' && server.command) {
      return { name, command: server.command, args: server.args ?? [], env: stringPairs(server.env) }
    }
    const type = server.type ?? 'http'
    if ((type !== 'http' && type !== 'sse') || !capabilities?.[type] || typeof server.url !== 'string') {
      throw new Error('Droid does not support a Studio MCP server transport required by this turn.')
    }
    return { name, type, url: server.url, headers: stringPairs(server.headers) }
  })
}

function optionFor(session, category) {
  return session?.configOptions?.find(option => option.type === 'select' && (option.category === category || option.id === category))
}

function choices(option) {
  return option.options.flatMap(item => Array.isArray(item.options) ? item.options : [item])
}

export function nativeModels(session) {
  const option = optionFor(session, 'model')
  const current = option?.currentValue ?? session?.models?.currentModelId
  const options = option ? choices(option) : session?.models?.availableModels ?? []
  const efforts = optionFor(session, 'thought_level')
  const reasoningEfforts = efforts ? choices(efforts).map(item => item.value).filter(validId) : []
  const models = new Map()
  for (const model of options) {
    const id = model.value ?? model.modelId
    if (!validId(id) || models.has(id)) continue
    models.set(id, {
      id, name: validId(model.name) ? model.name : id,
      ...(id === current ? { isDefault: true, ...(reasoningEfforts.length ? { reasoningEfforts } : {}) } : {}),
    })
  }
  return [...models.values()]
}

async function setOption(acp, sessionId, option, selected, signal) {
  if (option.currentValue === selected) return
  if (!choices(option).some(item => item.value === selected)) throw new Error('The selected Droid session option is unavailable.')
  const result = await acp.request('session/set_config_option', { sessionId, configId: option.id, value: selected }, signal)
  if (result?.configOptions?.find(item => item.id === option.id)?.currentValue !== selected) {
    throw new Error('Droid did not confirm the selected session option.')
  }
  return result.configOptions
}

export async function chooseModel(acp, sessionId, session, model, signal) {
  if (model?.model) {
    const option = optionFor(session, 'model')
    if (option) {
      const configOptions = await setOption(acp, sessionId, option, model.model, signal)
      if (configOptions) session = { ...session, configOptions }
    } else if (session?.models?.currentModelId !== model.model) {
      if (!nativeModels(session).some(item => item.id === model.model)) throw new Error('The selected Droid model is unavailable.')
      await acp.request('session/set_model', { sessionId, modelId: model.model }, signal)
    }
  }
  if (model?.reasoningEffort) {
    const effort = optionFor(session, 'thought_level')
    if (!effort) throw new Error('Droid did not expose a reasoning setting for the selected model.')
    await setOption(acp, sessionId, effort, model.reasoningEffort, signal)
  }
}

export async function promptContent(input, run, capabilities, includeHistory, signal) {
  let attachmentBytes = 0
  const encode = async part => {
    if (part.type === 'text') return text(part.text)
    const file = await run.attachments.resolve(part.assetId)
    signal.throwIfAborted()
    const isImage = part.type === 'image'
    if (!capabilities?.[isImage ? 'image' : 'embeddedContext']) {
      throw new Error(`Droid does not support this ${isImage ? 'image' : 'file'} input over ACP.`)
    }
    const mimeType = file.mediaType || part.mediaType || 'application/octet-stream'
    if (isImage && !mimeType.startsWith('image/')) throw new Error('The Studio image has an invalid media type.')
    if (file.size > attachmentLimit - attachmentBytes) throw new Error('Droid attachments exceed the 8 MiB per-turn limit.')
    const bytes = Buffer.from(await run.attachments.read(part.assetId))
    signal.throwIfAborted()
    attachmentBytes += bytes.byteLength
    if (attachmentBytes > attachmentLimit) throw new Error('Droid attachments exceed the 8 MiB per-turn limit.')
    if (isImage) return { type: 'image', mimeType, data: bytes.toString('base64') }
    const uri = `file:///studio-attachments/${encodeURIComponent(part.assetId)}/${encodeURIComponent(file.name || part.name)}`
    const resource = { uri, mimeType }
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      try { resource.text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      catch { resource.blob = bytes.toString('base64') }
    } else {
      resource.blob = bytes.toString('base64')
    }
    return { type: 'resource', resource }
  }

  const prompt = []
  const instructions = input.instructions.map(item => `[${item.kind}] ${item.text}`).join('\n\n')
  if (instructions) prompt.push(text(`Studio instructions:\n${instructions}`))
  if (includeHistory && input.history.length) {
    prompt.push(text('The following is prior Studio conversation history. Use it as context for the current turn. Do not replay earlier actions.'))
    for (const message of input.history) {
      prompt.push(text(`[Earlier ${message.role} message]`))
      for (const part of message.content) prompt.push(await encode(part))
    }
    prompt.push(text('[Current user turn]'))
  }
  for (const part of input.input) prompt.push(await encode(part))
  return prompt
}
