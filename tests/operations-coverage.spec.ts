import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { parseOperations } from '../scripts/openapi-ops.mjs'
import { OPERATION_IDS, OPERATIONS } from '../src/operations.generated.ts'

const yamlPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi', 'powercontext.yaml')

function loadYamlDoc() {
  return parse(readFileSync(yamlPath, 'utf8'))
}

describe('operations coverage', () => {
  it('matches every OpenAPI operationId exactly', () => {
    const fromYaml = parseOperations(loadYamlDoc()).map((row) => row.operationId).sort()
    const generated = [...OPERATION_IDS].sort()
    expect(generated).toEqual(fromYaml)
    expect(generated).toHaveLength(48)
  })

  it('records method, path, and location for each operation', () => {
    expect(OPERATIONS.get_liveness).toEqual({
      method: 'GET',
      path: '/health/live',
      location: null,
      scope: false,
    })
    expect(OPERATIONS.get_stats).toEqual({
      method: 'GET',
      path: '/v1/stats',
      location: 'query',
      scope: true,
    })
    expect(OPERATIONS.remember_memory).toEqual({
      method: 'POST',
      path: '/v1/memory/remember',
      location: 'body',
      scope: true,
    })
    expect(OPERATIONS.get_handoff_report.scope).toBe(false)
    expect(OPERATIONS.get_capabilities.location).toBeNull()
  })

  it('matches generated method, path, location, and scope for every operation', () => {
    for (const row of parseOperations(loadYamlDoc())) {
      expect(OPERATIONS[row.operationId]).toEqual({
        method: row.method,
        path: row.path,
        location: row.location,
        scope: row.scope,
      })
    }
  })
})
