/**
 * Fail the build if a source or bundle file contains the GBK reading of a UTF-8
 * separator. A `Get-Content`/`WriteAllLines` round-trip decodes UTF-8 as the ANSI
 * codepage and writes it back as UTF-8, which silently turns every `·` into
 * `路` -- it happened twice, and both times it shipped. The characters checked
 * are the ones that corruption produces; none of them belongs in this plugin.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SUSPECT = ['\u8DEF', '\u9225', '\u9239', '\u950B', '\u9227']
const roots = ['src', 'client', 'lib']
let hits = 0
for (const root of roots) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8')
    for (const char of SUSPECT) {
      const count = text.split(char).length - 1
      if (count === 0) continue
      hits += count
      console.error(`${file}: ${String(count)}x U+${char.codePointAt(0).toString(16).toUpperCase()}`)
    }
  }
}
if (hits > 0) {
  console.error(`mojibake check: ${String(hits)} damaged character(s); rewrite the file with a UTF-8 writer`)
  process.exit(1)
}
console.log('mojibake check: clean')

function* walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const entry of entries) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) { yield* walk(path); continue }
    if (!/\.(ts|tsx|css|json|js|mjs)$/.test(entry)) continue
    yield path
  }
}