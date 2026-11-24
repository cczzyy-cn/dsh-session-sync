/**
 * The official live Assistant stream, reduced to what the sync link carries.
 *
 * A publishing Host already holds the authoritative stream: `follow` with
 * `assistantStream: true` yields one `start` frame per attempt, a dense run of
 * `chunk` frames carrying the model's raw `StreamChunk`s, and one `end`. This
 * module names that vocabulary once and folds it in one place, because three
 * different consumers need the same answer:
 *
 *  - the **origin** batches the chunks and expands the follow opening's compact
 *    runs into the same dense frames;
 *  - the **server** folds them so a browser that opens the console in the middle
 *    of a step still gets a baseline instead of an index gap;
 *  - the **browser** folds them for its own live row, and the shipped renderer
 *    pane feeds the raw chunks to DSH's own chat assembler.
 *
 * The previous relay carried two whole-text strings (`reasoning` and `text`) and
 * dropped every other chunk. That was enough to draw a paragraph, and it silently
 * lost live tool calls, block boundaries, usage, and the attempt's own end — the
 * four things the shipped renderer needs to show a step while it runs. Carrying
 * the official frames is both more faithful and smaller: a dense delta is a few
 * bytes where a whole-text frame grows with the step.
 */

/** One official `assistant-stream` chunk frame. */
export interface LiveChunkFrame {
  /** Dense position in the attempt, matching the follow's own `index`. */
  readonly index: number
  /** Session time of the chunk. */
  readonly time: number
  /** One raw `StreamChunk` from the model stream. */
  readonly chunk: Record<string, unknown>
}

/** The identity every frame of one attempt carries. */
export interface LiveAttemptIdentity {
  readonly attemptId: string
  readonly turn: number
  readonly step: number
}

/** How one attempt ended. */
export type LiveOutcome = 'committed' | 'abandoned'

/**
 * A folded view of one live attempt — what a reader would draw right now.
 *
 * `text` and `reasoning` are kept beside `blocks` because the console's older
 * surfaces and its tests read the two strings; `blocks` is the authored order and
 * is what a renderer should use.
 */
export interface LiveAttemptView {
  readonly attemptId: string
  readonly turn: number
  readonly step: number
  readonly blocks: readonly LiveBlock[]
  readonly reasoning: string
  readonly text: string
  readonly tools: readonly LiveToolCall[]
}

/** One block of a live attempt, in authored order. */
export type LiveBlock =
  | { readonly kind: 'text'; readonly index: number; readonly text: string }
  | { readonly kind: 'reasoning'; readonly index: number; readonly text: string }
  | { readonly kind: 'tool'; readonly index: number; readonly id: string; readonly name: string; readonly arguments: string }

/** A Tool call whose arguments are still streaming. */
export interface LiveToolCall {
  /** Block index the arguments belong to. */
  readonly index: number
  readonly id: string
  readonly name: string
  /** Raw JSON text so far; it is not valid JSON until the block ends. */
  readonly arguments: string
}

/**
 * One event on the live wire.
 *
 * `baseline` is the only one that is not a frame of the official stream: it is a
 * compact re-statement of an attempt already in flight, so a reader that arrived
 * late starts from the same text instead of from a dense-index gap.
 */
export type LiveStreamEvent =
  | (LiveAttemptIdentity & {
    readonly type: 'baseline'
    /** Dense position the next frame will carry; `chunks` hold only the view. */
    readonly nextIndex: number
    readonly chunks: readonly LiveChunkFrame[]
  })
  | (LiveAttemptIdentity & {
    readonly type: 'start'
    readonly startedAfterSeq: number
  })
  | {
    readonly type: 'chunks'
    readonly attemptId: string
    readonly chunks: readonly LiveChunkFrame[]
  }
  | {
    readonly type: 'end'
    readonly attemptId: string
    /** Number of dense frames this terminal marker follows. */
    readonly index: number
    readonly outcome: LiveOutcome
  }
  | {
    readonly type: 'clear'
    /** Present when the settlement names the attempt; absent for a step-scoped drop. */
    readonly attemptId?: string
    readonly turn: number
    readonly step: number
  }

/** One origin → server live post. */
export type LiveStreamPayload = LiveStreamEvent & { readonly sessionId: string }

/** The block kinds this fold understands; anything else is kept opaque. */
type BlockKind = 'text' | 'reasoning' | 'tool' | 'other'

interface BlockState {
  kind: BlockKind
  text: string
  id: string
  name: string
  arguments: string
}

/** One chunk paired with the time it arrived at. */
interface TimedChunk {
  readonly time: number
  readonly chunk: Record<string, unknown>
}

/** One writable block, created on first sight of its index. */
function blank(kind: BlockKind): BlockState {
  return { kind, text: '', id: '', name: '', arguments: '' }
}

/** Read one non-negative safe integer, or undefined. */
function indexOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/** Read one optional finite number, defaulting to 0. */
function timeOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Keep one chunk's presentation content, dropping adapter-private replay state.
 *
 * `finish` carries the adapter's lossless replay envelope, which is opaque, can be
 * megabytes, and is meaningless to every consumer of this relay — the durable
 * `assistant/message` keeps the authoritative copy. Everything else passes
 * through untouched so the shipped assembler folds exactly what it would have
 * received from `follow`.
 * @param value - one raw `StreamChunk` from a follow frame.
 * @returns the chunk to relay, or undefined when it is not a stream chunk.
 */
export function wireChunk(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const chunk = value as Record<string, unknown>
  const type = chunk['type']
  if (typeof type !== 'string') return undefined
  switch (type) {
    case 'block-start':
    case 'text-delta':
    case 'reasoning-delta':
    case 'tool-call-delta':
    case 'block-end':
    case 'usage':
      return { ...chunk }
    case 'finish': {
      const { replayState: _replayState, ...rest } = chunk
      return rest
    }
    default:
      return undefined
  }
}

/**
 * Expand one follow opening's compact attempt into dense chunk frames.
 *
 * This mirrors `expandAssistantStream` in `@deepseek-ai/dsh-llm` for the record
 * kinds a live attempt can carry: packed text/reasoning runs, packed Tool-call
 * argument runs, and raw chunks. It is deliberately permissive about field types
 * (a malformed record ends the expansion) because it reads another package's JSON
 * over a wire, not a value this repository built.
 * @param value - the opening's `assistantStream.activeAttempt`.
 * @returns the baseline, or undefined when it cannot be represented whole.
 */
export function expandLiveBaseline(value: unknown): (LiveAttemptIdentity & {
  readonly nextIndex: number
  readonly chunks: readonly LiveChunkFrame[]
}) | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const attempt = value as Record<string, unknown>
  const attemptId = typeof attempt['attemptId'] === 'string' ? attempt['attemptId'] : ''
  const turn = attempt['turn']
  const step = attempt['step']
  const nextIndex = indexOf(attempt['nextIndex'])
  if (attemptId === '' || typeof turn !== 'number' || typeof step !== 'number' || nextIndex === undefined) return undefined
  if (!Array.isArray(attempt['stream'])) return undefined
  const timed: TimedChunk[] = []
  for (const candidate of attempt['stream']) {
    if (timed.length >= nextIndex) break
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return undefined
    const record = candidate as Record<string, unknown>
    if (record['type'] === 'chunk') {
      const chunk = wireChunk(record['chunk'])
      if (chunk === undefined) return undefined
      timed.push({ time: timeOf(record['time']), chunk })
      continue
    }
    const blockIndex = indexOf(record['index'])
    const time0 = timeOf(record['time0'])
    const dt = Array.isArray(record['dt']) ? record['dt'] : []
    if (blockIndex === undefined) return undefined
    if (record['type'] === 'text-chunks' || record['type'] === 'reasoning-chunks') {
      const texts = Array.isArray(record['texts']) ? record['texts'] : []
      let time = time0
      for (const [position, text] of texts.entries()) {
        if (position > 0) time += timeOf(dt[position - 1])
        if (typeof text !== 'string') return undefined
        timed.push({
          time,
          chunk: {
            type: record['type'] === 'text-chunks' ? 'text-delta' : 'reasoning-delta',
            index: blockIndex,
            text,
          },
        })
        if (timed.length >= nextIndex) break
      }
      continue
    }
    if (record['type'] === 'tool-call-chunks') {
      const id = typeof record['id'] === 'string' ? record['id'] : ''
      if (id === '') return undefined
      const name = typeof record['name'] === 'string' ? record['name'] : undefined
      const args = Array.isArray(record['args']) ? record['args'] : []
      let time = time0
      for (const [position, argument] of args.entries()) {
        if (position > 0) time += timeOf(dt[position - 1])
        if (typeof argument !== 'string') return undefined
        timed.push({
          time,
          chunk: {
            type: 'tool-call-delta',
            index: blockIndex,
            id,
            ...(name === undefined ? {} : { name }),
            argumentsDelta: argument,
          },
        })
        if (timed.length >= nextIndex) break
      }
      continue
    }
    return undefined
  }
  if (timed.length < nextIndex) return undefined
  return {
    attemptId,
    turn,
    step,
    nextIndex,
    chunks: timed.map(({ time, chunk }, index) => ({ index, time, chunk })),
  }
}

/**
 * The chunks one relay tick carries, merged and numbered.
 *
 * The model emits a few hundred deltas a second; a reader appends them to one
 * block anyway, so a per-delta frame buys nothing and costs bytes. Adjacent deltas
 * of the same block are concatenated here, and the relay's own dense `index` is
 * assigned at drain time — which is what lets merged frames stay a valid attempt.
 *
 * The batch starts at a caller-chosen cursor because one relay may begin from an
 * opening baseline that already accounts for earlier frames.
 */
export class LiveBatch {
  private readonly pending: TimedChunk[] = []
  private cursor: number

  /** @param startIndex - the dense position this batch's first frame carries. */
  constructor(startIndex = 0) {
    this.cursor = startIndex
  }

  /** The dense position the next drained frame will carry. */
  get nextIndex(): number {
    return this.cursor
  }

  /** Chunks waiting for the next drain. */
  get size(): number {
    return this.pending.length
  }

  /**
   * Add one chunk to the batch.
   * @param time - the chunk's session time.
   * @param chunk - one raw `StreamChunk`.
   */
  push(time: number, chunk: Record<string, unknown>): void {
    this.pending.push({ time, chunk })
  }

  /** Drop everything buffered, keeping the cursor. */
  clear(): void {
    this.pending.length = 0
  }

  /**
   * Take the batch, merged and numbered.
   * @returns frames whose `index` is dense from {@link nextIndex} at drain time.
   */
  drain(): LiveChunkFrame[] {
    const frames: LiveChunkFrame[] = []
    for (const entry of this.pending) {
      const last = frames.at(-1)
      const merged = last === undefined ? undefined : mergeChunk(last.chunk, entry.chunk)
      if (last !== undefined && merged !== undefined) {
        frames[frames.length - 1] = { index: last.index, time: entry.time, chunk: merged }
        continue
      }
      frames.push({ index: this.cursor, time: entry.time, chunk: entry.chunk })
      this.cursor += 1
    }
    this.pending.length = 0
    return frames
  }
}

/**
 * Merge one chunk into the frame before it, when the two are the same block.
 *
 * Only the three delta kinds merge — block boundaries, usage and finish each
 * carry their own fact and keep their own frame.
 * @param previous - the chunk already in the batch.
 * @param next - the chunk that arrived after it.
 * @returns the merged chunk, or undefined when they must stay separate frames.
 */
function mergeChunk(previous: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> | undefined {
  if (previous['type'] !== next['type'] || previous['index'] !== next['index']) return undefined
  const type = previous['type']
  if (type === 'text-delta' || type === 'reasoning-delta') {
    const shown = previous['text']
    const added = next['text']
    if (typeof shown !== 'string' || typeof added !== 'string') return undefined
    return { ...previous, text: shown + added }
  }
  if (type === 'tool-call-delta') {
    const shown = previous['argumentsDelta']
    const added = next['argumentsDelta']
    if (typeof shown !== 'string' || typeof added !== 'string') return undefined
    if (previous['id'] !== next['id'] || previous['name'] !== next['name']) return undefined
    return { ...previous, argumentsDelta: shown + added }
  }
  return undefined
}

/**
 * What one live attempt's chunks fold to.
 *
 * Official semantics are followed exactly where they matter: frames are dense and
 * a gap is a rebaseline, a delta at a block index whose kind changed starts that
 * block over, and a `block-end` replaces the streamed content with the assembled
 * block. Usage and finish carry no reader-visible content and are ignored here;
 * they still travel to the shipped renderer, which folds them itself.
 */
export class LiveAttemptFold {
  readonly attemptId: string
  readonly turn: number
  readonly step: number
  private next: number
  private readonly blocks = new Map<number, BlockState>()

  /**
   * @param identity - the attempt these chunks belong to.
   * @param nextIndex - dense position of the first frame; 0 for a fresh attempt.
   */
  constructor(identity: LiveAttemptIdentity, nextIndex = 0) {
    this.attemptId = identity.attemptId
    this.turn = identity.turn
    this.step = identity.step
    this.next = nextIndex
  }

  /** The dense position the next frame must carry. */
  get nextIndex(): number {
    return this.next
  }

  /**
   * Take content from a baseline without enforcing its synthetic frame indexes.
   *
   * A baseline carries only the visible view, so its frame positions and the
   * attempt's real cursor are different numbers; `nextIndex` is the cursor.
   * @param baseline - one re-statement of an attempt in flight.
   */
  seed(baseline: { readonly nextIndex: number; readonly chunks: readonly LiveChunkFrame[] }): void {
    this.blocks.clear()
    for (const frame of baseline.chunks) this.take(frame.chunk)
    this.next = baseline.nextIndex
  }

  /**
   * Fold one dense frame.
   * @param frame - the next frame of this attempt.
   * @returns false when the frame is not the dense next one.
   */
  apply(frame: LiveChunkFrame): boolean {
    if (frame.index !== this.next) return false
    this.next += 1
    this.take(frame.chunk)
    return true
  }

  /** What a reader would draw right now. */
  view(): LiveAttemptView {
    const blocks: LiveBlock[] = []
    for (const index of [...this.blocks.keys()].sort((a, b) => a - b)) {
      const block = this.blocks.get(index)
      if (block === undefined) continue
      if (block.kind === 'text' && block.text !== '') blocks.push({ kind: 'text', index, text: block.text })
      else if (block.kind === 'reasoning' && block.text !== '') blocks.push({ kind: 'reasoning', index, text: block.text })
      else if (block.kind === 'tool' && (block.name !== '' || block.arguments !== '')) {
        blocks.push({ kind: 'tool', index, id: block.id, name: block.name, arguments: block.arguments })
      }
    }
    return {
      attemptId: this.attemptId,
      turn: this.turn,
      step: this.step,
      blocks,
      reasoning: blocks.filter(block => block.kind === 'reasoning').map(block => block.text).join(''),
      text: blocks.filter(block => block.kind === 'text').map(block => block.text).join(''),
      tools: blocks.filter((block): block is Extract<LiveBlock, { kind: 'tool' }> => block.kind === 'tool')
        .map(block => ({ index: block.index, id: block.id, name: block.name, arguments: block.arguments })),
    }
  }

  /**
   * Re-state this attempt as a baseline for a reader that arrived late.
   *
   * One frame per visible block, with the outer positions renumbered densely; the
   * cursor stays the attempt's real one so frames after the baseline still land.
   */
  baseline(): LiveAttemptIdentity & { readonly nextIndex: number; readonly chunks: readonly LiveChunkFrame[] } {
    const now = Date.now()
    const chunks: LiveChunkFrame[] = []
    for (const block of this.view().blocks) {
      const chunk: Record<string, unknown> = block.kind === 'text'
        ? { type: 'text-delta', index: block.index, text: block.text }
        : block.kind === 'reasoning'
          ? { type: 'reasoning-delta', index: block.index, text: block.text }
          : {
              type: 'tool-call-delta',
              index: block.index,
              id: block.id,
              ...(block.name === '' ? {} : { name: block.name }),
              argumentsDelta: block.arguments,
            }
      chunks.push({ index: chunks.length, time: now, chunk })
    }
    return { attemptId: this.attemptId, turn: this.turn, step: this.step, nextIndex: this.next, chunks }
  }

  /** Apply one chunk's content, ignoring its outer position. */
  private take(value: Record<string, unknown>): void {
    const type = value['type']
    const index = indexOf(value['index'])
    if (typeof type !== 'string' || index === undefined) return
    switch (type) {
      case 'block-start': {
        const blockType = value['blockType']
        this.blocks.set(index, blank(
          blockType === 'text' ? 'text' : blockType === 'reasoning' ? 'reasoning' : blockType === 'tool-call' ? 'tool' : 'other',
        ))
        return
      }
      case 'text-delta': {
        const text = value['text']
        if (typeof text !== 'string' || text === '') return
        let state = this.blocks.get(index)
        if (state === undefined || state.kind !== 'text') {
          state = blank('text')
          this.blocks.set(index, state)
        }
        state.text += text
        return
      }
      case 'reasoning-delta': {
        const text = value['text']
        if (typeof text !== 'string' || text === '') return
        let state = this.blocks.get(index)
        if (state === undefined || state.kind !== 'reasoning') {
          state = blank('reasoning')
          this.blocks.set(index, state)
        }
        state.text += text
        return
      }
      case 'tool-call-delta': {
        let state = this.blocks.get(index)
        if (state === undefined || state.kind !== 'tool') {
          state = blank('tool')
          this.blocks.set(index, state)
        }
        if (typeof value['id'] === 'string') state.id = value['id']
        if (typeof value['name'] === 'string') state.name = value['name']
        if (typeof value['argumentsDelta'] === 'string') state.arguments += value['argumentsDelta']
        return
      }
      case 'block-end': {
        const block = value['block']
        if (typeof block !== 'object' || block === null || Array.isArray(block)) return
        const finished = block as Record<string, unknown>
        if (finished['type'] === 'text' && typeof finished['text'] === 'string') {
          this.blocks.set(index, { ...blank('text'), text: finished['text'] })
          return
        }
        if (finished['type'] === 'reasoning' && typeof finished['text'] === 'string') {
          this.blocks.set(index, { ...blank('reasoning'), text: finished['text'] })
          return
        }
        if (finished['type'] === 'tool-call') {
          this.blocks.set(index, {
            kind: 'tool',
            text: '',
            id: typeof finished['id'] === 'string' ? finished['id'] : '',
            name: typeof finished['name'] === 'string' ? finished['name'] : '',
            arguments: typeof finished['arguments'] === 'string' ? finished['arguments'] : '',
          })
          return
        }
        this.blocks.set(index, blank('other'))
        return
      }
      default:
        // usage/finish/unknown: no reader-visible block content.
        return
    }
  }
}
