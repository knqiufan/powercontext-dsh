import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PowerContextClient } from '../../src/client.ts'
import { registerCommands } from '../../src/commands.ts'
import { resolveConfig } from '../../src/config.ts'
import type { PluginRuntime } from '../../src/invoke.ts'
import { runRecallPreStep } from '../../src/recall.ts'
import { deriveScopeId } from '../../src/scope.ts'
import { startPowerContextServer } from '../../scripts/e2e-server.mjs'

const SCOPE_ID = 'project:dsh-e2e'
const TEXT = 'Keep the DSH plugin on the public HTTP contract.'

function pluginRuntime(baseUrl: string, scopeId?: string): PluginRuntime {
  const config = resolveConfig({
    baseUrl,
    scopeId,
    requestTimeoutMs: 5000,
    capturePrompts: true,
  })
  return {
    client: new PowerContextClient({ baseUrl, requestTimeoutMs: 5000 }),
    config,
    resolveScope: (cwd) => deriveScopeId(cwd, { configuredScopeId: config.scopeId }),
    log: () => undefined,
  }
}

function pcHandler(runtime: PluginRuntime) {
  let handler: ((invocation: {
    rawInput: string
    signal: AbortSignal
    agent: { session: { header: { cwd?: string } } }
  }) => Promise<{ kind: string; text: string }>) | undefined
  registerCommands({
    get: (name) => name === 'commands'
      ? { register: (definition: { handler: typeof handler }) => { handler = definition.handler } }
      : undefined,
  }, runtime)
  if (!handler) throw new Error('expected /pc handler')
  return handler
}

function invokePc(
  handler: ReturnType<typeof pcHandler>,
  rawInput: string,
  cwd?: string,
) {
  return handler({
    rawInput,
    signal: AbortSignal.timeout(5000),
    agent: { session: { header: cwd === undefined ? {} : { cwd } } },
  })
}

describe('e2e against a real PowerContext server', () => {
  let server: Awaited<ReturnType<typeof startPowerContextServer>>
  let client: PowerContextClient

  beforeAll(async () => {
    server = await startPowerContextServer()
    client = new PowerContextClient({
      baseUrl: server.baseUrl,
      requestTimeoutMs: 5000,
    })
  }, 60_000)

  afterAll(async () => {
    await server?.stop()
  })

  it('reaches liveness and readiness without inference', async () => {
    const live = await client.request('get_liveness')
    expect(live.kind).toBe('json')
    expect(live.value).toMatchObject({ status: 'ok' })
    const ready = await client.request('get_readiness')
    expect(ready.kind).toBe('json')
    expect(['ready', 'degraded']).toContain((ready.value as { status: string }).status)
  })

  it('remembers, searches, prepares, and captures over HTTP', async () => {
    const remembered = await client.request('remember_memory', {
      scope_id: SCOPE_ID,
      kind: 'decision',
      text: TEXT,
    })
    expect(remembered.kind).toBe('json')

    const found = await client.request('search_memory', {
      scope_id: SCOPE_ID,
      query: 'DSH plugin HTTP contract',
    })
    expect(found.kind).toBe('json')
    const hits = (found.value as { hits: Array<{ text: string }> }).hits
    expect(Array.isArray(hits)).toBe(true)
    expect(hits.some((hit) => hit.text === TEXT)).toBe(true)

    const prepared = await client.request('prepare_context', {
      scope_id: SCOPE_ID,
      query: 'DSH plugin HTTP contract',
    })
    expect(prepared.kind).toBe('json')
    const content = (prepared.value as { content: string | null }).content
    expect(typeof content === 'string' || content === null).toBe(true)

    const captured = await client.request('capture_content_source', {
      scope_id: SCOPE_ID,
      source_id: 'dsh-e2e-turn-1',
      content: 'Call through the plugin client without a model.',
      metadata: { origin: 'dsh', event: 'e2e' },
    })
    expect(captured.kind).toBe('json')
  })

  it('still derives a git scope from a real workspace cwd', async () => {
    const scope = await deriveScopeId(process.cwd())
    expect(scope).toMatch(/^git:/)
  })

  it('resolves /pc against the server when cwd is missing but scopeId is set', async () => {
    const handler = pcHandler(pluginRuntime(server.baseUrl, SCOPE_ID))
    const remembered = await invokePc(handler, `remember ${TEXT}`)
    expect(remembered.kind).toBe('success')
    const searched = await invokePc(handler, 'search DSH plugin HTTP contract')
    expect(searched.kind).toBe('success')
    expect(searched.text).toContain(TEXT)
  })

  it('does not treat a missing cwd as the process directory on /pc', async () => {
    const handler = pcHandler(pluginRuntime(server.baseUrl))
    const result = await invokePc(handler, 'search DSH plugin HTTP contract')
    expect(result.kind).toBe('error')
    expect(result.text).toContain('scopeId')
  })

  it('recalls through the plugin with configured scopeId and no session cwd', async () => {
    const logs: Array<Record<string, unknown>> = []
    const runtime = pluginRuntime(server.baseUrl, SCOPE_ID)
    const result = await runRecallPreStep({
      messages: [{
        content: [{ type: 'text', text: 'DSH plugin HTTP contract' }],
        source: { kind: 'user' },
      }],
      next: async () => ({ kind: 'enter', messages: [] }),
      cwd: undefined,
      sessionId: 'e2e-recall',
      turnId: '1',
      client: runtime.client,
      config: runtime.config,
      resolveScope: runtime.resolveScope,
      wrapContent: (text) => ({ role: 'user', content: [{ type: 'text', text }] }),
      log: (event) => logs.push(event),
    })
    expect(result.kind).toBe('enter')
    expect(logs).toContainEqual(expect.objectContaining({
      event: 'context_prepare',
    }))
    expect(logs).not.toContainEqual(expect.objectContaining({
      outcome: 'skipped',
      reason: 'missing_session_cwd',
    }))
  })

  it('skips plugin recall when both cwd and scopeId are missing', async () => {
    const logs: Array<Record<string, unknown>> = []
    const runtime = pluginRuntime(server.baseUrl)
    const result = await runRecallPreStep({
      messages: [{
        content: [{ type: 'text', text: `e2e-unscoped-${Date.now()}` }],
        source: { kind: 'user' },
      }],
      next: async () => ({ kind: 'enter', messages: [{ id: 'user' }] }),
      cwd: undefined,
      sessionId: 'e2e-unscoped',
      turnId: '1',
      client: runtime.client,
      config: runtime.config,
      resolveScope: runtime.resolveScope,
      wrapContent: (text) => ({ role: 'user', content: [{ type: 'text', text }] }),
      log: (event) => logs.push(event),
    })
    expect(result).toEqual({ kind: 'enter', messages: [{ id: 'user' }] })
    expect(logs).toContainEqual({
      event: 'context_prepare',
      outcome: 'skipped',
      reason: 'missing_session_cwd',
    })
  })
})
