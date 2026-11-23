import { randomUUID } from 'node:crypto'
import { Acp } from './acp.mjs'
import { text, validId } from './protocol.mjs'

const cancelled = { outcome: { outcome: 'cancelled' } }
const toolKinds = new Set(['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other'])

function permissionTitle(value, factoryKey) {
  if (typeof value !== 'string') return ''
  const title = factoryKey ? value.replaceAll(factoryKey, '[redacted]') : value
  return title
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/\b(?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[redacted]')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .trim().slice(0, 300)
}

export function openAcp(engine, cwd, run, signal) {
  const acp = new Acp(engine.executable, engine.args, { cwd, env: engine.env }, onFrame)
  const permissions = new Map()
  const tools = new Set()
  let currentSession
  let answer = ''
  let updates = Promise.resolve()
  let streamError
  const interrupted = Promise.withResolvers()

  function answerPermission(id, outcome) {
    if (!permissions.delete(id)) return
    acp.respond(id, outcome)
  }

  function clearPermissions() {
    for (const id of permissions.keys()) answerPermission(id, cancelled)
  }

  async function approve({ id, params }) {
    if (permissions.has(id)) return
    permissions.set(id, true)
    let outcome = cancelled
    try {
      const options = Array.isArray(params.options) ? params.options : []
      const tool = params.toolCall
      const ids = options.map(option => option?.optionId)
      const allow = options.filter(option => option?.kind === 'allow_once')
      const deny = options.filter(option => option?.kind === 'reject_once')
      if (validId(tool?.toolCallId) && ids.every(validId) && new Set(ids).size === ids.length && allow.length === 1) {
        const kind = toolKinds.has(tool.kind) ? tool.kind : 'other'
        const result = await run.interactions.approve({
          operationId: randomUUID(),
          title: `Factory Droid tool permission · ${kind}`,
          details: permissionTitle(tool.title, engine.env?.FACTORY_API_KEY) || 'Droid requests permission for this tool call.',
        })
        const selected = result.outcome === 'approved' ? allow[0] : result.outcome === 'denied' && deny.length === 1 ? deny[0] : null
        if (selected && !signal.aborted && currentSession === params.sessionId) {
          outcome = { outcome: { outcome: 'selected', optionId: selected.optionId } }
        }
      }
    } catch { /* An unavailable interaction leaves the request cancelled. */ }
    answerPermission(id, outcome)
  }

  async function emitUpdate(update) {
    const { sessionUpdate, content, toolCallId, status, kind } = update ?? {}
    if (sessionUpdate === 'agent_message_chunk' && content?.type === 'text' && typeof content.text === 'string') {
      answer += content.text
      await run.output.emit({ type: 'text.delta', text: content.text })
    }
    if (!['tool_call', 'tool_call_update'].includes(sessionUpdate) || !validId(toolCallId)) return
    if (sessionUpdate === 'tool_call' && !tools.has(toolCallId)) {
      tools.add(toolCallId)
      await run.output.emit({ type: 'tool.started', callId: toolCallId, name: toolKinds.has(kind) ? kind : 'Droid tool', input: {} })
    }
    if (['completed', 'failed', 'cancelled'].includes(status) && tools.delete(toolCallId)) {
      await run.output.emit(status === 'completed'
        ? { type: 'tool.completed', callId: toolCallId, result: null }
        : { type: 'tool.failed', callId: toolCallId, error: 'Droid tool failed, was denied, or was cancelled.' })
    }
  }

  function onFrame(frame) {
    const { id, method, params } = frame
    const current = currentSession && params?.sessionId === currentSession && !signal.aborted
    if (id !== undefined) {
      if (method !== 'session/request_permission') acp.methodNotFound(id)
      else if (current) void approve(frame)
      else acp.respond(id, cancelled)
    } else if (current && method === 'session/update') {
      updates = updates.then(async () => {
        if (!signal.aborted && !streamError) await emitUpdate(params.update)
      }).catch(error => { streamError = error })
    }
  }

  function abort() {
    interrupted.resolve()
    if (currentSession) acp.notify('session/cancel', { sessionId: currentSession })
    clearPermissions()
  }

  signal.addEventListener('abort', abort, { once: true })
  run.lifecycle.add(() => acp.close())
  return {
    acp,
    async prompt(sessionId, prompt) {
      currentSession = sessionId
      const result = await acp.request('session/prompt', { sessionId, prompt }, signal)
      currentSession = undefined
      clearPermissions()
      await Promise.race([updates, interrupted.promise])
      signal.throwIfAborted()
      if (streamError) throw streamError
      for (const callId of tools) {
        await run.output.emit({ type: 'tool.failed', callId, error: 'Droid ended the turn before reporting a tool result.' })
      }
      return { result, content: [text(answer)] }
    },
    async close() {
      const cancel = signal.aborted && Boolean(currentSession)
      currentSession = undefined
      clearPermissions()
      signal.removeEventListener('abort', abort)
      await acp.close({ cancel })
    },
  }
}
