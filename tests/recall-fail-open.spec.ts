import { describe, expect, it, vi } from 'vitest'
import { UnavailableError } from '../src/errors.ts'
import { runRecallPreStep, type RecallInput } from '../src/recall.ts'
import type { ResolvedConfig } from '../src/config.ts'

const config: ResolvedConfig = {
  baseUrl: 'http://127.0.0.1:8000',
  authorization: undefined,
  scopeId: 'project:demo',
  timeoutMs: 4000,
  requestTimeoutMs: 1000,
  maxBytes: 8000,
  capturePrompts: true,
  flushOnCapture: false,
  flushMaxCalls: 4,
}

function input(overrides: Partial<RecallInput> = {}): RecallInput {
  return {
    messages: [{ content: [{ type: 'text', text: 'remember the public API stays async' }] }],
    next: async () => ({ kind: 'enter', messages: [] }),
    cwd: '/repo',
    sessionId: 's1',
    turnId: '1',
    client: { request: vi.fn() } as never,
    config,
    resolveScope: async () => 'project:demo',
    wrapContent: (text) => ({ role: 'user', content: [{ type: 'text', text }] }),
    log: vi.fn(),
    ...overrides,
  }
}

describe('runRecallPreStep fail-open', () => {
  it('calls next when messages are empty', async () => {
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))
    const result = await runRecallPreStep(input({ messages: [], next }))
    expect(next).toHaveBeenCalledOnce()
    expect(result).toEqual({ kind: 'enter', messages: [] })
  })

  it('still calls next when prepare fetch rejects', async () => {
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [{ id: 'user' }] }))
    const request = vi.fn(async (operationId: string) => {
      if (operationId === 'prepare_context') throw new UnavailableError('/v1/context/prepare')
      return { kind: 'json', value: { status: 'accepted' }, status: 202, requestId: undefined }
    })
    const result = await runRecallPreStep(input({ next, client: { request } as never }))
    expect(next).toHaveBeenCalledOnce()
    expect(result).toEqual({ kind: 'enter', messages: [{ id: 'user' }] })
    expect(request).toHaveBeenCalled()
  })

  it('does not throw when next is reached after an invalid prepare payload', async () => {
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))
    const request = vi.fn(async (operationId: string) => {
      if (operationId === 'prepare_context') {
        return { kind: 'json', value: { schema: 'nope' }, status: 200, requestId: undefined }
      }
      throw new Error('capture should be independent')
    })
    await expect(runRecallPreStep(input({ next, client: { request } as never }))).resolves.toEqual({
      kind: 'enter',
      messages: [],
    })
    expect(next).toHaveBeenCalledOnce()
  })

  it('appends untrusted context after a ready prepare result', async () => {
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))
    const content = 'Public API stays async.'
    const request = vi.fn(async (operationId: string) => {
      if (operationId === 'prepare_context') {
        return {
          kind: 'json' as const,
          value: {
            schema: 'powercontext.prepared-context.v1',
            status: 'ready',
            content,
            content_bytes: Buffer.byteLength(content, 'utf8'),
          },
          status: 200,
          requestId: undefined,
        }
      }
      return { kind: 'json' as const, value: { status: 'accepted', position: 1 }, status: 202, requestId: undefined }
    })
    const result = await runRecallPreStep(input({ next, client: { request } as never }))
    expect(result.kind).toBe('enter')
    if (result.kind === 'enter') {
      expect(result.messages).toHaveLength(1)
      const wrapped = result.messages[0] as { content: Array<{ text: string }> }
      expect(wrapped.content[0].text).toContain('untrusted historical evidence')
      expect(wrapped.content[0].text).toContain(content)
    }
  })
})
