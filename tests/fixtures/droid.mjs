#!/usr/bin/env node
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

if (process.argv[2] === '--version') {
  console.log('1.17.2')
  process.exit(0)
}
assert.deepEqual(process.argv.slice(2), ['exec', '--output-format', 'acp-daemon'])
assert.equal(process.env.DROID_DISABLE_AUTO_UPDATE, 'true')
assert.equal(process.env.FACTORY_DROID_AUTO_UPDATE_ENABLED, 'false')

const cwd = process.cwd()
const authRequired = process.env.FACTORY_API_KEY === 'fixture-unauthenticated'
const useLegacy = process.env.FACTORY_API_KEY === 'fixture-legacy'
const loadDisabled = process.env.FACTORY_API_KEY === 'fixture-no-load'
const loadRejected = process.env.FACTORY_API_KEY === 'fixture-load-rejected'
const imageDisabled = process.env.FACTORY_API_KEY === 'fixture-no-image'
const wire = join(cwd, 'wire.jsonl')
let nativeId
let selected = 'native-default'
let effort = 'low'
let turn
let pending
let continued = false
const config = () => [
  { type: 'select', category: 'model', id: 'native-model', currentValue: selected,
    options: [{ value: 'native-default', name: 'Native Default' }, { group: 'more', options: [{ value: 'native-other', name: 'Native Other' }] }] },
  { type: 'select', category: 'thought_level', id: 'native-effort', currentValue: effort,
    options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] },
]
const sessionOptions = () => useLegacy ? { models: { currentModelId: selected, availableModels: [
  { modelId: 'native-default', name: 'Native Default' }, { modelId: 'native-other', name: 'Native Other' },
] } } : { configOptions: config() }
const send = frame => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...frame }) + '\n')
const respond = (id, result = {}) => send({ id, result })
const fail = (id, code) => send({ id, error: { code, message: 'SECRET_DROID_ERROR_REJECTED' } })
const update = (value, sessionId = nativeId) => send({ method: 'session/update', params: { sessionId, update: value } })
const message = (text, sessionId) => update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }, sessionId)
const finish = reason => {
  respond(turn, { stopReason: reason })
  turn = undefined
}

for await (const line of createInterface({ input: process.stdin })) {
  const frame = JSON.parse(line)
  const { method, params, id, result } = frame
  if (method === 'initialize') {
    respond(id, { protocolVersion: 1, agentInfo: { name: '@factory/cli', version: '1.17.2' },
      agentCapabilities: { loadSession: !loadDisabled, auth: { status: {} },
        promptCapabilities: { image: !imageDisabled, embeddedContext: true }, mcpCapabilities: { http: true, sse: true } } })
  } else if (method === 'auth/status') {
    respond(id, { state: authRequired ? 'unauthenticated' : 'authenticated' })
  } else if (method === 'session/new') {
    assert.equal(params.cwd, cwd)
    nativeId = randomUUID()
    appendFileSync(wire, JSON.stringify(frame) + '\n')
    writeFileSync(join(cwd, `fixture-${nativeId}.json`), JSON.stringify({ selected, effort }))
    respond(id, { sessionId: nativeId, ...sessionOptions() })
  } else if (method === 'session/load') {
    assert.equal(params.cwd, cwd)
    appendFileSync(wire, JSON.stringify(frame) + '\n')
    if (loadRejected) { fail(id, -32601); continue }
    nativeId = params.sessionId
    ;({ selected, effort } = JSON.parse(readFileSync(join(cwd, `fixture-${nativeId}.json`), 'utf8')))
    continued = true
    message('REPLAY_MUST_NOT_STREAM')
    respond(id, sessionOptions())
  } else if (method === 'session/set_config_option' || method === 'session/set_model') {
    assert.equal(params.sessionId, nativeId)
    appendFileSync(wire, JSON.stringify(frame) + '\n')
    if (params.configId === 'native-effort') effort = params.value
    else selected = params.modelId || params.value
    writeFileSync(join(cwd, `fixture-${nativeId}.json`), JSON.stringify({ selected, effort }))
    respond(id, sessionOptions())
  } else if (method === 'session/prompt') {
    assert.equal(params.sessionId, nativeId)
    appendFileSync(wire, JSON.stringify(frame) + '\n')
    turn = id
    const lastText = params.prompt.filter(block => block.type === 'text').at(-1)?.text
    if (lastText === 'wire-error') {
      process.stderr.write('SECRET_DROID_STDERR')
      fail(id, -32603)
      continue
    }
    if (lastText === 'wait') {
      message('waiting')
      continue
    }
    if (['permission', 'cancel-permission', 'always-only'].includes(lastText)) {
      pending = 'approval'
      const toolCall = { toolCallId: 'fixture-tool', kind: 'execute', title: 'echo fixture token=SECRET_DROID_TITLE',
        rawInput: { command: 'echo fixture', apiKey: 'SECRET_DROID_RAW' } }
      update({ sessionUpdate: 'tool_call', ...toolCall, status: 'pending' })
      send({ id: 'wrong-session', method: 'session/request_permission', params: { sessionId: 'another-session', toolCall, options: [] } })
      send({ id: pending, method: 'session/request_permission', params: { sessionId: nativeId, toolCall,
        options: [
          ...(lastText === 'always-only' ? [] : [{ optionId: 'allow', kind: 'allow_once' }]),
          { optionId: 'allow-always', kind: 'allow_always' }, { optionId: 'deny', kind: 'reject_once' },
        ] } })
      continue
    }
    message('IGNORED_OTHER_SESSION', 'another-session')
    message(continued ? 'continued:' : 'fresh:')
    message(selected)
    finish('end_turn')
  } else if (method === 'session/cancel') {
    appendFileSync(wire, JSON.stringify(frame) + '\n')
    assert.equal(params.sessionId, nativeId)
    message('LATE_MUST_NOT_STREAM')
    finish('cancelled')
  } else if (id === pending || id === 'wrong-session') {
    appendFileSync(wire, JSON.stringify(frame) + '\n')
    if (id === pending && turn !== undefined) {
      const option = result.outcome.optionId
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'fixture-tool', status: option === 'allow' ? 'completed' : 'failed' })
      message(option || 'permission-cancelled')
      finish('end_turn')
    }
  } else {
    fail(id, -32601)
  }
}
