/**
 * Refuse the one durable event the shipped conversation assembler cannot take.
 *
 * The assembler keys a trajectory step by turn and step. Its first event for a
 * step must be the `step/start` match; a start that arrives after any other event
 * for the same step throws `received an update before its start Match`, and that
 * throw is not local — it fails the whole session-controller event-feed
 * subscriber, so the pane stops updating until it is reopened.
 *
 * Two ordinary roads reach that state here, and neither is corruption:
 *
 *  - a **retried step** writes a second `step/start` for a step that already has
 *    matches;
 *  - the **live** stream can reach the pane before the durable batch that carries
 *    the step's start, so the chunks have already made the step active when the
 *    start arrives.
 *
 * A mirror cannot reset the assembler's context, so the duplicate start is
 * dropped. The step still renders from the matches it has; what is avoided is a
 * dead feed, which is the whole pane.
 */

/** One step's identity in the assembler's own vocabulary. */
export interface StepIdentity {
  readonly turn: number
  readonly step: number
}

/** The key the assembler uses for a trajectory step context. */
export function stepKeyOf(identity: StepIdentity): string {
  return `${String(identity.turn)}:${String(identity.step)}`
}

/**
 * Whether one event is a step's start match.
 * @param type - the Session event type.
 * @returns true for `step/start`.
 */
export function isStepStart(type: string): boolean {
  return type === 'step/start'
}

/**
 * Tracks which steps have been started and which have already been touched.
 *
 * Both marks matter: a start is legal only when neither exists, and the second
 * start is exactly the one the assembler refuses.
 */
export class StepStartGuard {
  private currentTurn = -1
  private readonly started = new Set<string>()
  private readonly active = new Set<string>()

  /** Forget every mark, for a window that replaces the whole conversation. */
  reset(): void {
    this.currentTurn = -1
    this.started.clear()
    this.active.clear()
  }

  /**
   * Read one event's step identity.
   *
   * `step/start` may carry only `step`; the turn is then the one the preceding
   * `turn/start` established. An event whose step and turn are both unknown names
   * no identity, and the guard stays out of its way.
   * @param data - the event's data payload.
   * @returns the identity, or undefined when it cannot be named.
   */
  identityOf(data: unknown): StepIdentity | undefined {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
    const record = data as Record<string, unknown>
    const step = record['step']
    if (typeof step !== 'number' || !Number.isSafeInteger(step)) return undefined
    const turn = typeof record['turn'] === 'number' && Number.isSafeInteger(record['turn'])
      ? record['turn']
      : this.currentTurn
    if (turn < 0) return undefined
    return { turn, step }
  }

  /**
   * Whether this event is the start the assembler would refuse.
   *
   * Called before the event is filed, so a duplicate start can be dropped without
   * advancing the window: the next batch must not retry it, and the window must
   * not claim to hold an event it never fed.
   * @param type - the Session event type.
   * @param data - the event's data payload.
   * @returns true when the event must not reach the source.
   */
  refuses(type: string, data: unknown): boolean {
    if (!isStepStart(type)) return false
    const identity = this.identityOf(data)
    if (identity === undefined) return false
    const key = stepKeyOf(identity)
    return this.started.has(key) || this.active.has(key)
  }

  /**
   * Record what one accepted event says about its step.
   * @param type - the Session event type.
   * @param data - the event's data payload.
   */
  note(type: string, data: unknown): void {
    if (type === 'turn/start' && typeof data === 'object' && data !== null) {
      const turn = (data as Record<string, unknown>)['turn']
      if (typeof turn === 'number' && Number.isSafeInteger(turn)) this.currentTurn = turn
    }
    if (type === 'turn/start' || type === 'turn/end') return
    const identity = this.identityOf(data)
    if (identity === undefined) return
    const key = stepKeyOf(identity)
    if (isStepStart(type)) this.started.add(key)
    else this.active.add(key)
  }

  /**
   * Mark one step active from the live stream, before any durable event for it.
   *
   * A live attempt reaches the pane through its own queue; the durable start may
   * arrive a batch later. Marking the step here is what makes that late start a
   * duplicate instead of a refusal.
   * @param turn - the live attempt's turn.
   * @param step - the live attempt's step.
   */
  noteLive(turn: number, step: number): void {
    if (!Number.isSafeInteger(turn) || !Number.isSafeInteger(step) || turn < 0 || step < 0) return
    this.active.add(stepKeyOf({ turn, step }))
  }
}

/** Narrow an unknown value to a plain record. */
export function recordOf(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}
