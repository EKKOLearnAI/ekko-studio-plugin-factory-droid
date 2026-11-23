import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { childEnv, registryArgs } from '../engine.mjs'
import { definitionFor } from '../server.mjs'

const fixture = fileURLToPath(new URL('./fixtures/droid-sdk.mjs', import.meta.url))
const official = process.env.EKKO_FACTORY_DROID_NATIVE_TEST_CLI
const input = (prompt) => ({ input: [{ type: 'text', text: prompt }], history: [{ role: 'user', content: [{ type: 'text', text: 'history for this user' }] }], instructions: [], options: {} })

async function setup(t, { real = false } = {}) {
  const home = await mkdtemp(join(await realpath(tmpdir()), 'droid-scoped-test-'))
  const upstream = []
  const modelServer = createServer(async (request, response) => {
    const bytes = []
    for await (const chunk of request) bytes.push(chunk)
    const data = JSON.parse(Buffer.concat(bytes))
    upstream.push({ url: request.url, auth: request.headers.authorization, data })
    if (!real) { response.end(data.model + '-response'); return }
    const conversational = data.tools?.length > 0
    const user = JSON.stringify(data.messages.filter(item => item.role === 'user'))
    const useTool = conversational && user.includes('use a test tool') && !data.messages.some(item => item.role === 'tool')
    const value = useTool
      ? { role: 'assistant', tool_calls: [{ index: 0, id: 'fixture-call', type: 'function', function: { name: 'Execute',
        arguments: JSON.stringify({ command: 'printf scoped-ok > scoped-tool-marker.txt', riskLevel: 'medium', summary: 'Write a scoped fixture' }) } }] }
      : { role: 'assistant', content: conversational ? 'reply from Studio fixture' : 'fixture title' }
    const event = (delta, finish_reason) => JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: data.model,
      choices: [{ index: 0, delta, finish_reason }] })
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(`data: ${event(value, null)}\n\ndata: ${event({}, useTool ? 'tool_calls' : 'stop')}\n\ndata: [DONE]\n\n`)
  }).listen(0, '127.0.0.1')
  await once(modelServer, 'listening')
  t.after(async () => {
    const closed = once(modelServer, 'close')
    modelServer.close()
    modelServer.closeAllConnections()
    await closed
    await rm(home, { force: true, recursive: true })
  })
  const owner = { userId: 15, profile: 'global-owner' }
  const definition = definitionFor(owner, async () => ({
    executable: real ? official : process.execPath,
    args: real ? registryArgs : [fixture, ...registryArgs],
    env: childEnv({ ...process.env, HOME: home, USERPROFILE: home, FACTORY_API_KEY: 'host-native-credential' }),
  }))
  async function session(name, modelId) {
    const runtimeDir = join(home, name + '-runtime')
    const workspaceDir = join(home, name)
    await mkdir(workspaceDir)
    const identity = { userId: name === 'second' ? 16 : 17, profile: name, agentId: 'plugin:factory-droid/factory-droid', sessionId: name, runId: 'run' }
    const base = { identity, mode: 'scoped', signal: AbortSignal.timeout(40_000), paths: { runtimeDir, workspaceDir }, lifecycle: { add() {} } }
    const runtime = definition.runtime.createSession(base)
    const events = []
    const run = {
      ...base, deadlineAt: Date.now() + 40_000, output: { async emit(event) { events.push(event) } },
      model: { provider: 'studio', model: modelId, apiMode: 'chat_completions',
        baseUrl: `http://127.0.0.1:${modelServer.address().port}/studio/v1`, token: name + '-lease', reasoningEffort: 'low',
        contextWindow: 16_000, outputLimit: 512 },
      attachments: { async resolve(assetId) { return { assetId, name: 'notes.txt', mediaType: 'text/plain', size: 20 } },
        async read() { return Buffer.from('scoped attachment bytes') } },
      interactions: { async approve() { return { outcome: 'approved' } } }, mcpServers: {},
    }
    t.after(() => runtime.dispose())
    return { run, runtime, events, runtimeDir, workspaceDir }
  }
  return { upstream, session }
}

test('scoped callers use their own Studio leases, actual history and attachments, and release turn files', async t => {
  const { upstream, session } = await setup(t)
  const first = await session('first', 'bound-one')
  const second = await session('second', 'bound-two')
  const request = input('hello')
  request.input.push({ type: 'file', assetId: 'notes', name: 'notes.txt', mediaType: 'text/plain' })
  first.run.mcpServers = { test: { command: '/test/program', args: ['arg'], env: { SCOPED: 'binding' } } }
  const replies = await Promise.all([first.runtime.run(request, first.run), second.runtime.run(input('different'), second.run)])
  assert.deepEqual(replies.map(reply => reply.content[0].text), ['bound-one-response', 'bound-two-response'])
  assert.equal(upstream.length, 2)
  for (const [expectedModel, token] of [['bound-one', 'first-lease'], ['bound-two', 'second-lease']]) {
    const found = upstream.find(entry => entry.data.model === expectedModel)
    assert.equal(found.auth, 'Bearer ' + token)
    assert.equal(found.url, '/studio/v1/chat/completions')
    assert.match(found.data.messages[0].content, /history for this user/)
  }
  for (const scope of [first, second]) assert.deepEqual(await readdir(scope.runtimeDir), [])
  assert.deepEqual(first.events, [{ type: 'text.delta', text: 'bound-one-response' }])
  const wire = (await readFile(join(first.workspaceDir, 'sdk-wire.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.deepEqual(wire[0].servers[0].env, { SCOPED: 'binding' })
  assert.deepEqual(wire[1].params.files, [{ type: 'text', mediaType: 'text/plain', name: 'notes.txt', data: 'scoped attachment bytes' }])
  assert.doesNotMatch(JSON.stringify(wire), /first-lease|host-native-credential/)
})

test('binding mismatch, unsupported protocol and mismatched callers fail before using a model', async t => {
  const { upstream, session } = await setup(t)
  const { runtime, run, runtimeDir } = await session('first', 'invalid-binding')
  await assert.rejects(runtime.run(input('hello'), { ...run, model: { ...run.model, apiMode: 'anthropic_messages' } }), /Chat Completions/)
  await assert.rejects(runtime.run(input('hello'), { ...run, identity: { ...run.identity, userId: 15 } }), /does not match/)
  await assert.rejects(runtime.run(input('hello'), run), /did not confirm/)
  assert.equal(upstream.length, 0)
  assert.deepEqual(await readdir(runtimeDir), [])
  const wrong = await session('second', 'bound-model')
  await assert.rejects(wrong.runtime.run(input('wrong model'), wrong.run), /model_request_rejected/)
  assert.equal(upstream.length, 0)
})

test('scoped permission uses one-time authorization and cancellation sends an interrupt', async t => {
  const { session } = await setup(t)
  const { runtime, run, workspaceDir, runtimeDir } = await session('first', 'test-model')
  let approvals = 0
  const approve = (decision) => async details => {
    approvals += 1
    assert.match(details.details, /echo fixture/)
    assert.doesNotMatch(JSON.stringify(details), /hidden-scope-value|first-lease/)
    return { outcome: decision }
  }
  await runtime.run(input('permission'), { ...run, interactions: { approve: approve('approved') } })
  await runtime.run(input('permission'), { ...run, interactions: { approve: approve('denied') } })
  const abort = new AbortController()
  const pending = Promise.withResolvers()
  await assert.rejects(runtime.run(input('permission'), { ...run, signal: abort.signal,
    interactions: { async approve() { abort.abort(); return pending.promise } } }), /turn cancelled/)
  pending.resolve({ outcome: 'approved' })
  const wire = (await readFile(join(workspaceDir, 'sdk-wire.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.deepEqual(wire.filter(frame => frame.permission).map(frame => frame.permission), ['proceed_once', 'cancel', 'cancel'])
  assert.equal(wire.filter(frame => frame.method === 'droid.interrupt_session').length, 1)
  assert.equal(approvals, 2)
  assert.deepEqual(await readdir(runtimeDir), [])
})

test('official Droid uses the Studio relay for scoped text, attachments and real tool approval', {
  skip: !official || process.platform === 'win32',
}, async t => {
  const { upstream, session } = await setup(t, { real: true })
  const { runtime, run, workspaceDir, runtimeDir } = await session('first', 'native-loopback-fixture')
  const message = input('hello')
  message.input.push({ type: 'file', assetId: 'notes', name: 'notes.txt', mediaType: 'text/plain' })
  const answer = await runtime.run(message, run)
  assert.equal(answer.content[0].text, 'reply from Studio fixture')
  const turn = upstream.find(item => item.data.tools?.length)
  assert.equal(turn.auth, 'Bearer first-lease')
  assert.equal(turn.data.model, 'native-loopback-fixture')
  assert.match(JSON.stringify(turn.data.messages), /scoped attachment bytes/)
  const command = /scoped-tool-marker\.txt/
  let permissionRequests = 0
  const interactions = decision => ({ async approve(prompt) {
    assert.match(prompt.details, command)
    permissionRequests++
    return { outcome: decision }
  } })
  await runtime.run(input('use a test tool'), { ...run, interactions: interactions('denied') })
  await assert.rejects(readFile(join(workspaceDir, 'scoped-tool-marker.txt')), { code: 'ENOENT' })
  await runtime.run(input('use a test tool'), { ...run, interactions: interactions('approved') })
  assert.equal(await readFile(join(workspaceDir, 'scoped-tool-marker.txt'), 'utf8'), 'scoped-ok')
  assert.equal(permissionRequests, 2)
  assert.deepEqual(await readdir(runtimeDir), [])
})
