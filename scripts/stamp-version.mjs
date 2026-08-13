import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]?.trim()
if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('usage: node scripts/stamp-version.mjs <semver>')
}

const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.version = version
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`stamped version ${version}`)
