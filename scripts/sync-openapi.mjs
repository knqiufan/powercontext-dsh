import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'openapi', 'powercontext.yaml')
const nestedSource = join(root, '..', '..', 'openapi', 'powercontext.yaml')

export function resolveOpenApiPath() {
  const fromEnv = process.env.POWERCONTEXT_OPENAPI?.trim()
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  if (existsSync(nestedSource)) return nestedSource
  if (existsSync(dest)) return dest
  throw new Error(
    'openapi/powercontext.yaml is missing. Copy it from a PowerContext checkout or set POWERCONTEXT_OPENAPI.',
  )
}

export function syncOpenApi() {
  const source = resolveOpenApiPath()
  if (source === dest) return dest
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(source, dest)
  return dest
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  console.log(`openapi synced to ${syncOpenApi()}`)
}
