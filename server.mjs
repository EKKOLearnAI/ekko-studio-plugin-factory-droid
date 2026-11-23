import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { Acp, AcpError } from './acp.mjs'
import { engineStatus, findEngine } from './engine.mjs'
import { managedEngine } from './managed-engine.mjs'
import { acpServers, chooseModel, initialize, loginRequired, nativeModels, promptContent, sessionError, validId } from './protocol.mjs'
import { openAcp } from './turn.mjs'
import { runScoped, scopedProtocols } from './scoped.mjs'
import manifest from './plugin.json' with { type: 'json' }

const fullId = 'plugin:factory-droid/factory-droid'
const ownerOnly = 'Factory Droid is available to the Studio account and Profile that enabled the plugin.'
const identityMismatch = 'The Droid turn does not match the Studio account, Profile, session and mode.'
const install = 'Install Droid CLI in Studio Agent Management or configure an external Droid executable on the Studio host.'
const stopReasons = { end_turn: 'stop', refusal: 'stop', max_tokens: 'length', max_turn_requests: 'tool_limit' }
const sameOwner = (left, right) => left.userId === right.userId && left.profile === right.profile
const catalog = (status, models = [], message) => ({
  status, models, source: 'factory-droid-acp', scope: 'available', ...(message ? { message } : {}),
})

async function listModels(run, getEngine) {
  const signal = AbortSignal.any([run.signal, AbortSignal.timeout(20_000)])
  let acp
  let cwd
  try {
    signal.throwIfAborted()
    const engine = await getEngine()
    if (!engine) return catalog('not_installed', [], install)
    cwd = await mkdtemp(join(await realpath(tmpdir()), 'studio-droid-catalog-'))
    signal.throwIfAborted()
    acp = new Acp(engine.executable, engine.args, { cwd, env: engine.env }, ({ id }) => {
      if (id !== undefined) acp.methodNotFound(id)
    })
    run.lifecycle.add(() => acp.close())
    await initialize(acp, signal, manifest.version)
    const session = await acp.request('session/new', { cwd, mcpServers: [] }, signal).catch(error => { throw sessionError(error) })
    const models = nativeModels(session)
    return catalog(models.length ? 'ready' : 'empty', models)
  } catch (error) {
    run.signal.throwIfAborted()
    if (signal.aborted) return catalog('timeout', [], 'Droid model discovery timed out.')
    if (error.message === loginRequired) return catalog('auth_required', [], loginRequired)
    return catalog('error', [], 'Could not load the native Droid model catalog.')
  } finally {
    try { await acp?.close() }
    finally { if (cwd) await rm(cwd, { force: true, recursive: true }) }
  }
}

async function runTurn(input, run, previous, getEngine, signal) {
  const engine = await getEngine()
  if (!engine) throw new Error(install)
  if (!isAbsolute(run.paths.workspaceDir)) throw new Error('Studio must provide an absolute workspace path.')
  const cwd = await realpath(run.paths.workspaceDir)
  signal.throwIfAborted()
  if (run.mode === 'scoped') return { reply: await runScoped(input, run, engine, cwd, signal) }
  const turn = openAcp(engine, cwd, run, signal)
  const startup = AbortSignal.any([signal, AbortSignal.timeout(25_000)])
  try {
    const capabilities = await initialize(turn.acp, startup, manifest.version)
    const options = { cwd, mcpServers: acpServers(run.mcpServers ?? {}, capabilities.mcpCapabilities) }
    let session
    let sessionId
    if (previous?.cwd === cwd && previous.executable === engine.executable && capabilities.loadSession === true) {
      try {
        session = await turn.acp.request('session/load', { sessionId: previous.sessionId, ...options }, startup)
        if (session?.sessionId && session.sessionId !== previous.sessionId) throw new Error('Droid loaded an unexpected native session.')
        sessionId = previous.sessionId
      } catch (error) {
        if (!(error instanceof AcpError)) throw error
        const converted = sessionError(error)
        if (converted !== error) throw converted
      }
    }
    const resumed = Boolean(sessionId)
    if (!resumed) {
      session = await turn.acp.request('session/new', options, startup).catch(error => { throw sessionError(error) })
      sessionId = session?.sessionId
      if (!validId(sessionId)) throw new Error('Droid did not provide a valid ACP session ID.')
    } else if (!(session?.configOptions?.length || session?.models) &&
        (run.model?.model || run.model?.reasoningEffort)) {
      // ACP allows a load response without options. Only continue an unchanged selection.
      if (run.model?.model !== previous.model || run.model?.reasoningEffort !== previous.reasoningEffort) {
        throw new Error('Droid did not return settings for changing the model of the loaded session.')
      }
    }
    if (!resumed || session?.configOptions?.length || session?.models) {
      await chooseModel(turn.acp, sessionId, session, run.model, startup)
    }
    const prompt = await promptContent(input, run, capabilities.promptCapabilities, !resumed, signal)
    const { result, content } = await turn.prompt(sessionId, prompt)
    if (result?.stopReason === 'cancelled') throw new Error('Droid cancelled the prompt.')
    if (!Object.hasOwn(stopReasons, result?.stopReason)) throw new Error('Droid returned an unsupported ACP stop reason.')
    return {
      native: { sessionId, cwd, executable: engine.executable, model: run.model?.model, reasoningEffort: run.model?.reasoningEffort },
      reply: { content, finishReason: stopReasons[result.stopReason] },
    }
  } catch (error) {
    if (!signal.aborted && startup.aborted && error.name === 'TimeoutError') throw new Error('Droid ACP startup timed out.')
    throw error
  } finally {
    await turn.close()
  }
}

function createSession(owner, session, getEngine) {
  if (session.identity.agentId !== fullId || !['global', 'scoped'].includes(session.mode)) throw new Error(identityMismatch)
  if (session.mode === 'global' && !sameOwner(owner, session.identity)) throw new Error(ownerOnly)
  const disposed = new AbortController()
  let active
  let previous
  return {
    async run(input, run) {
      if (!sameOwner(session.identity, run.identity) || run.identity.sessionId !== session.identity.sessionId ||
          run.identity.agentId !== fullId || run.mode !== session.mode) throw new Error(identityMismatch)
      if (active) throw new Error('Factory Droid already has an active turn in this Studio session.')
      const remaining = run.deadlineAt - Date.now()
      if (remaining <= 0) throw new Error('Droid turn timed out.')
      const deadline = AbortSignal.timeout(remaining)
      const signal = AbortSignal.any([session.signal, run.signal, disposed.signal, deadline])
      signal.throwIfAborted()
      const resume = previous
      previous = undefined
      active = runTurn(input, run, resume, getEngine, signal)
      try {
        const { native, reply } = await active
        signal.throwIfAborted()
        previous = native
        return reply
      } catch (error) {
        if (signal.aborted) throw new Error(deadline.aborted ? 'Droid turn timed out.' : 'Droid turn cancelled.')
        throw error
      } finally {
        active = undefined
      }
    },
    async dispose() {
      disposed.abort()
      previous = undefined
      await active?.catch(() => {})
    },
  }
}

export function definitionFor(owner, getEngine = findEngine, manager) {
  function managementOwner(run) {
    if (!sameOwner(owner, run.identity)) throw new Error(ownerOnly)
  }
  return {
    id: manifest.id, name: manifest.name, vendor: 'Factory AI', description: manifest.description, agentApiVersion: 1,
    async getStatus(run) { return manager ? manager.status(run.signal) : engineStatus(await getEngine(), run.signal) },
    management: {
      installGuideUrl: manifest.documentation,
      ...(manager?.native ? {
        checkUpdate(run) { managementOwner(run); return manager.checkUpdate(run) },
        upgrade(input, run) { managementOwner(run); return manager.upgrade(input, run) },
        remove(run) { managementOwner(run); return manager.remove(run) },
      } : {}),
    },
    modes: {
      global: { listModels: run => sameOwner(owner, run.identity) ? listModels(run, getEngine) : catalog('auth_required', [], ownerOnly) },
      scoped: { protocols: scopedProtocols },
    },
    features: { surfaces: ['chat'], streaming: true, resume: false },
    runtime: { createSession: session => createSession(owner, session, getEngine) },
  }
}

export function apply(ctx) {
  const { userId, profile } = ctx.identity
  const manager = managedEngine(ctx.paths.dataDir)
  const registration = ctx.extensions.agents.register(definitionFor({ userId, profile }, async () => (await manager.resolve()).engine, manager))
  return () => registration.dispose()
}
