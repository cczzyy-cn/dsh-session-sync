/**
 * Fail the build if a file carries the GBK reading of a UTF-8 character, or bytes
 * that are not valid UTF-8 at all.
 *
 * A `Get-Content`/`WriteAllLines` round-trip decodes UTF-8 as the ANSI codepage
 * and writes it back as UTF-8. It turns every `·` (U+00B7) into U+8DEF and every
 * `—` (U+2014) into a two-character sequence, silently, and it happened twice -
 * both times it shipped, and one instance reached a reader as the close glyph of
 * a notice row (U+8133 where U+00D7 belongs).
 *
 * The codepoints below are what that corruption produces. None belongs in this
 * plugin. They are searched for by codepoint rather than by "does this file look
 * wrong", because every one of them is a plausible CJK character: only the
 * codepoint says whether it is text or damage.
 *
 * What is scanned, and what deliberately is not:
 *  - `src`, `client` and `lib` are the sources and the two artifacts.
 *  - `scripts` and the root-level build inputs are included because a corrupted
 *    comment or path in them is still corruption, and because a gate that covers
 *    only part of the tree is how the two shipped instances got in.
 *  - `docs/` is out on purpose: it quotes these very codepoints while describing
 *    the corruption, so a hit there is the documentation working, not damage.
 *  - `patches/` is out on purpose: it is dead history for a route this plugin no
 *    longer has, and it is not in the published file list.
 *  - Invalid UTF-8 is reported too. Without that, `readFileSync(file, 'utf8')`
 *    hands back U+FFFD and a file no editor can read would pass.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Codepoints this corruption produces, each with the character it replaces.
 *
 * U+8DEF is the one that shipped twice: it is the GBK reading of `·` (U+00B7),
 * the separator every localized ledger row is built from.
 */
const SUSPECT = [
  0x8DEF, // from U+00B7 `·`
  0x9225, // from U+2014 `—`
  0x9239, // from U+2500 `─`
  0x950B, // from U+5173 `关`
  0x9227, // from U+2018 `'`
  0x95B3, // from U+2014 `—` (second misdecoding path)
  0x8133, // from U+00D7 `×`
  0x922B, // from U+2191 `↑` / U+2192 `→`
]

/** The one codepoint that only ever means "these bytes were not UTF-8". */
const REPLACEMENT = 0xFFFD

/** Directories whose every matching file is scanned. */
const ROOTS = ['src', 'client', 'lib', 'scripts']

/** Root-level files that take part in the build or the install. */
const ROOT_FILES = ['tsdown.config.ts', 'cordis.patch.yml', 'package.json']

/** Extensions worth reading: sources, artifacts, and the scripts that build them. */
const SCANNED = /\.(ts|tsx|css|json|js|mjs|ps1|yml|yaml)$/

const damaged = []
let scanned = 0

// `flatMap` flattens arrays, not iterators, so each walk is spread first: passing
// the generator objects straight through left only ROOT_FILES scanned, and the
// read failure below swallowed it into a "clean" report.
const files = [...ROOT_FILES, ...ROOTS.flatMap(root => [...walk(root)])]

for (const file of files) {
  let bytes
  try {
    bytes = readFileSync(file)
  } catch {
    continue
  }
  scanned += 1
  const text = bytes.toString('utf8')
  if (Buffer.compare(Buffer.from(text, 'utf8'), bytes) !== 0) {
    damaged.push(`${file}: not valid UTF-8`)
  }
  const lines = text.split('\n')
  for (const [index, line] of lines.entries()) {
    let column = 0
    for (const character of line) {
      column += 1
      const point = character.codePointAt(0)
      if (point !== REPLACEMENT && !SUSPECT.includes(point)) continue
      const why = point === REPLACEMENT ? 'invalid UTF-8 byte' : 'GBK reading of a UTF-8 character'
      damaged.push(`${file}:${String(index + 1)}:${String(column)} U+${point.toString(16).toUpperCase()} (${why})`)
    }
  }
}

if (damaged.length > 0) {
  for (const hit of damaged) console.error(hit)
  console.error(
    `mojibake check: ${String(damaged.length)} damaged spot(s) in ${String(scanned)} file(s); `
    + 'rewrite the file with a UTF-8 writer',
  )
  process.exit(1)
}
console.log(`mojibake check: clean (${String(scanned)} files)`)

/** Every scanned file under `dir`, recursively; a missing directory yields none. */
function* walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const entry of entries) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) { yield* walk(path); continue }
    if (!SCANNED.test(entry)) continue
    yield path
  }
}
