/**
 * The working directory a mirrored Session is written with.
 *
 * The format validator uses this Host's own `path.isAbsolute`, so a Session
 * mirrored from a Windows machine could not be written to a Linux Host at all:
 * every event was refused with `format v4 header cwd must be absolute` before a
 * single byte reached storage. Measured live, on a real 11,836-event Session.
 *
 * The platform is injected rather than inherited, so both sides of that mismatch
 * are pinned on whichever machine runs this file: a Windows checkout answers
 * `isAbsolute('C:\\work')` true, and the code under test must behave identically
 * in both worlds.
 */
import { posix, win32 } from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { portableCwd } from '../src/host/materialize.ts'

/** How a POSIX Host answers, which is what the Linux sync server uses. */
const posixAbsolute = (path: string): boolean => posix.isAbsolute(path)

/** How a Windows Host answers. */
const winAbsolute = (path: string): boolean => win32.isAbsolute(path)

describe('the cwd a materialized log is written with', () => {
  it('restates a Windows drive path so a POSIX Host accepts it', () => {
    const restated = portableCwd('C:\\Users\\me\\Desktop\\git\\c-vision', posixAbsolute)
    assert.equal(restated, '/C:/Users/me/Desktop/git/c-vision')
    // The point of the exercise: the Host's own validator now says absolute.
    assert.ok(restated !== undefined && posixAbsolute(restated))
  })

  it('keeps the drive letter, so the path still says where it came from', () => {
    assert.equal(portableCwd('D:/work/thing', posixAbsolute), '/D:/work/thing')
  })

  it('leaves it alone when this Host already reads it as absolute', () => {
    // On Windows the very same path needs no restating, and must not be mangled.
    assert.equal(portableCwd('C:\\Users\\me\\work', winAbsolute), 'C:\\Users\\me\\work')
    assert.equal(portableCwd('/home/me/work', posixAbsolute), '/home/me/work')
  })

  it('drops a path it cannot restate rather than guessing', () => {
    // A relative path was never usable, and a wrong cwd is worse than none.
    assert.equal(portableCwd('work/thing', posixAbsolute), undefined)
    assert.equal(portableCwd('', posixAbsolute), undefined)
    assert.equal(portableCwd(undefined, posixAbsolute), undefined)
  })
})
