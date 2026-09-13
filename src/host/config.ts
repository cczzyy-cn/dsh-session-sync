/**
 * Configuration persistence.
 *
 * The plugin owns a small JSON document in the Harness home rather than a
 * settings namespace, because two of the five settings are not scalars: the
 * per-Session publish switch is a growing map keyed by Session id, and a
 * settings-namespace schema would have to describe a dictionary the user never
 * edits as text. A document the plugin reads and writes itself keeps the write
 * path identical to the read path.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { CONFIG_FILE_NAME, normalizeConfig, type SyncConfig } from '../shared/protocol.ts'

/**
 * Resolve the Harness home, honouring `DSH_HOME` and otherwise `~/.dsh`.
 * @param environment - process environment; injectable for tests.
 * @returns the absolute Harness home directory.
 */
export function resolveHome(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment['DSH_HOME']
  if (configured !== undefined && configured.trim().length > 0) return configured.trim()
  return join(homedir(), '.dsh')
}

/** Path of this plugin's configuration document. */
export function configPath(home: string): string {
  return join(home, CONFIG_FILE_NAME)
}

/**
 * Read the persisted configuration, falling back to defaults.
 * A missing or unreadable document is not an error: a fresh install has none.
 * @param home - Harness home directory.
 * @param fallbackMachineName - name to use when the document carries none.
 * @returns the complete configuration.
 */
export async function loadConfig(home: string, fallbackMachineName: string): Promise<SyncConfig> {
  const path = configPath(home)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return normalizeConfig(undefined, fallbackMachineName)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  return normalizeConfig(parsed, fallbackMachineName)
}

/**
 * Write the configuration document atomically.
 * A rename over the target means a crash mid-write cannot leave a truncated
 * document that would silently reset every setting on the next start.
 * @param home - Harness home directory.
 * @param config - the configuration to persist.
 */
export async function saveConfig(home: string, config: SyncConfig): Promise<void> {
  const path = configPath(home)
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid.toString()}.tmp`
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}
