/**
 * The plugin's own config document is read back the way it was written.
 *
 * A settings document is user-editable, and on Windows the editors that touch it
 * write a UTF-8 byte order mark: Notepad does, and so does PowerShell's
 * `Set-Content -Encoding UTF8`. `JSON.parse` rejects that mark, so a document
 * that is entirely valid read as corrupt — and the loader's answer to corrupt is
 * "fresh install", which silently discarded the server address and every publish
 * mark. This file pins the reading.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { configPath, loadConfig, resolveHome, saveConfig } from '../src/host/config.ts'

const homes: string[] = []
after(async () => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

/** A throwaway Harness home. */
async function home(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'sync-config-'))
  homes.push(path)
  return path
}

const DOCUMENT = {
  machineName: 'DESKTOP-TEST',
  serverUrl: '210.16.120.228:8791',
  isServer: false,
  password: 'secret',
  listenHost: '127.0.0.1',
  listenPort: 8791,
  syncSessions: { 'session-keep': true, 'session-drop': false },
}

describe('the plugin config document', () => {
  it('round-trips through save and load', async () => {
    const path = await home()
    await saveConfig(path, DOCUMENT)
    const loaded = await loadConfig(path, 'fallback')
    assert.deepEqual(loaded, { ...DOCUMENT, syncSessions: { 'session-keep': true } })
  })

  it('reads a document a Windows editor wrote, mark and all', async () => {
    const path = await home()
    // Exactly what `Set-Content -Encoding UTF8` produces.
    await writeFile(configPath(path), `\uFEFF${JSON.stringify(DOCUMENT, null, 2)}\n`, 'utf8')
    const loaded = await loadConfig(path, 'fallback')
    assert.equal(loaded.serverUrl, '210.16.120.228:8791')
    assert.deepEqual(loaded.syncSessions, { 'session-keep': true })
  })

  it('still treats a genuinely unreadable document as absent', async () => {
    const path = await home()
    await writeFile(configPath(path), '{ this is not json', 'utf8')
    const loaded = await loadConfig(path, 'fallback')
    assert.equal(loaded.machineName, 'fallback')
    assert.equal(loaded.serverUrl, '')
  })

  it('falls back to the home default only when DSH_HOME says nothing', () => {
    assert.equal(resolveHome({ DSH_HOME: ' C:\\custom\\dsh ' }), 'C:\\custom\\dsh')
    assert.match(resolveHome({ DSH_HOME: '   ' }), /[\\/]\.dsh$/)
    assert.match(resolveHome({}), /[\\/]\.dsh$/)
  })
})
