import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function profileModulesAnchor(): string {
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(home, 'profiles', 'node_modules', 'powercontext-dsh-resolver.cjs')
}

function resolvePeer(specifier: string): string {
  try {
    return createRequire(import.meta.url).resolve(specifier)
  } catch {
    return createRequire(profileModulesAnchor()).resolve(specifier)
  }
}

export async function loadPeer<T>(specifier: string): Promise<T> {
  const href = pathToFileURL(resolvePeer(specifier)).href
  return await import(href) as T
}
