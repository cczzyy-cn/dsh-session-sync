/**
 * What a console's held events actually cover of a Session's log.
 *
 * `hasMore === false` says the paging chain found nothing older; it does **not** say
 * the events already held are contiguous. A console reported "整份日志" while holding
 * 849 of the machine's 956 steps — because a page had ended early or a range was
 * skipped, and neither leaves a mark the chain can see. Counting the gaps locally is
 * something this side can *prove*, so the label is based on that instead of on trust.
 *
 * Sequences are the log's own ordinals: they are integers, ascending with the log, and
 * a range with no missing integer is a range with no missing event.
 */

import type { MirrorEvent } from '../shared/protocol.ts'

/** How much of the log one set of held events covers. */
export interface LogCoverage {
  /** Ordinals missing between the lowest and highest held sequence. */
  readonly gaps: number
  /** Lowest held sequence, or undefined when nothing is held. */
  readonly first: number | undefined
  /** Highest held sequence, or undefined when nothing is held. */
  readonly last: number | undefined
}

/**
 * Count the holes in one set of held events.
 * @param events - the events this console holds, in any order.
 * @returns the gaps, and the range they sit in.
 */
export function logCoverage(events: readonly MirrorEvent[]): LogCoverage {
  let first: number | undefined
  let last: number | undefined
  const seen = new Set<number>()
  for (const event of events) {
    // A transient row is positioned *between* durable sequences and is not part of the
    // log; only whole ordinals are counted, or every live row would read as a gap.
    if (!Number.isInteger(event.seq)) continue
    seen.add(event.seq)
    if (first === undefined || event.seq < first) first = event.seq
    if (last === undefined || event.seq > last) last = event.seq
  }
  if (first === undefined || last === undefined) return { gaps: 0, first, last }
  return { gaps: last - first + 1 - seen.size, first, last }
}