import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

assert.deepEqual(process.argv.slice(2, -1), ['exec', '--input-format', 'stream-jsonrpc', '--output-format', 'stream-jsonrpc', '--settings'])
assert.equal(process.env.FACTORY_API_KEY, undefined)
assert.equal(process.env.HOME, process.env.FACTORY_HOME_OVERRIDE)
const settings = JSON.parse(readFileSync(process.argv.at(-1), 'utf8'))
const config = settings.customModels[0]
const wire = join(process.cwd(), 'sdk-wire.jsonl')
const sessionId = 'sdk-fixture-session'
const envelope = { jsonrpc: '2.0', factoryApiVersion: '1.0.0', factoryProtocolVersion: '1.332.0' }
let waiting = false
const send = value => process.stdout.write(JSON.stringify({ ...envelope, ...value }) + '\n')
const respond = (id, result) => send({ type: 'response', id, result })
const note = (notification, forSession = sessionId) => send({ type: 'notification', method: 'droid.session_notification', params: { sessionId: forSession, notification } })
const done = reason => note({ type: 'agent_turn_completed', reason })
const record = value => appendFileSync(wire, JSON.stringify(value) + '\n')

for await (const line of createInterface({ input: process.stdin })) {
  const { id, method, params, result, type, factoryApiVersion } = JSON.parse(line)
  assert.equal(factoryApiVersion, '1.0.0')
  if (method === 'droid.initialize_session') {
    assert.equal(type, 'request')
    assert.equal(params.modelId, settings.model)
    assert.equal(params.specModeModelId, settings.model)
    assert.equal(params.autonomyLevel, 'off')
    assert.equal(params.autoRejectPermissionRequests, false)
    assert.equal(params.cwd, process.cwd())
    record({ method, model: config.model, servers: params.mcpServers })
    respond(id, { sessionId, settings: { modelId: config.model === 'invalid-binding' ? 'unbound' : settings.model } })
  } else if (method === 'droid.add_user_message') {
    record({ method, params })
    respond(id, {})
    const reply = await fetch(config.baseUrl + '/chat/completions', {
      method: 'POST', headers: { authorization: 'Bearer ' + config.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ model: params.text.includes('wrong model') ? 'unexpected' : config.model, messages: [{ role: 'user', content: params.text }] }),
    })
    if (!reply.ok) { done('model_request_rejected'); continue }
    const value = await reply.text()
    if (params.text.includes('permission')) {
      waiting = true
      note({ type: 'tool_call', toolUse: { id: 'fixture-execute', name: 'Execute' } })
      send({ type: 'request', id: 'fixture-permission', method: 'droid.request_permission', params: {
        toolUses: [{ toolUse: { id: 'fixture-execute', name: 'Execute', input: { command: 'echo fixture token=hidden-scope-value', irrelevant: config.apiKey } } }],
        options: [{ value: 'proceed_once' }, { value: 'proceed_always' }, { value: 'cancel' }],
      } })
    } else {
      note({ type: 'assistant_text_delta', messageId: 'msg', textDelta: 'foreign' }, 'foreign-session')
      note({ type: 'assistant_text_delta', messageId: 'msg', textDelta: value })
      note({ type: 'create_message', message: { id: 'msg', role: 'assistant', content: [{ type: 'text', text: value }] } })
      done('completed')
    }
  } else if (method === 'droid.interrupt_session') {
    record({ method })
    respond(id, {})
    done('cancelled')
  } else if (id === 'fixture-permission' && type === 'response') {
    record({ permission: result.selectedOption })
    if (waiting) {
      note({ type: 'tool_result', toolUseId: 'fixture-execute', isError: result.selectedOption !== 'proceed_once' })
      done(result.selectedOption === 'proceed_once' ? 'completed' : 'cancelled')
      waiting = false
    }
  }
}
