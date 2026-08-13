import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { parseOperations, renderOperationsSource } from './openapi-ops.mjs'
import { syncOpenApi } from './sync-openapi.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function generate() {
  const yamlPath = syncOpenApi()
  const doc = parse(readFileSync(yamlPath, 'utf8'))
  const rows = parseOperations(doc)
  if (rows.length === 0) {
    throw new Error('gen-operations: no operations parsed from openapi/powercontext.yaml')
  }
  const outDir = join(root, 'src')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'operations.generated.ts'), renderOperationsSource(rows))
  console.log(`wrote ${rows.length} operations to src/operations.generated.ts`)
}

generate()
