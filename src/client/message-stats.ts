/**
 * The shipped message chrome's figures: a date-aware clock, a run duration, and
 * the token/usage formatting the turn pills carry.
 *
 * Ported from `ui-chat`'s `message-chrome.ts` and `token-format.ts`, which a
 * plugin cannot import; the arithmetic is theirs so a reading matches the
 * product's rather than approximating it.
 */
import type { SessionSyncTranslate } from './locales.ts'
import type { TurnUsage } from './transcript.ts'

/** Two-digit, zero-padded number. */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Compact local timestamp for a message's actions row: `HH:mm` on the same
 * calendar day, a month/day template earlier this year, a year template beyond.
 * @param time - Unix epoch ms from the source Session event.
 * @param t - translate seat supplying the date templates.
 * @param now - reference instant for the day/year cut.
 * @returns the date-aware clock string.
 */
export function formatMessageClock(time: number, t: SessionSyncTranslate, now: number = Date.now()): string {
  const date = new Date(time)
  const reference = new Date(now)
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  if (date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate()) {
    return clock
  }
  const params = { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
  const day = date.getFullYear() === reference.getFullYear() ? t('clockMd', params) : t('clockYmd', params)
  return `${day} ${clock}`
}

/**
 * Localized elapsed duration: whole seconds under a minute, then minutes.
 * @param ms - elapsed milliseconds; negatives clamp to zero.
 * @param t - translate seat supplying the duration templates.
 * @returns the display string.
 */
export function formatRunDuration(ms: number, t: SessionSyncTranslate): string {
  const total = Math.max(0, Math.floor(ms / 1_000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0
    ? t('durationMinutes', { minutes, seconds: pad2(seconds) })
    : t('durationSeconds', { seconds })
}

/**
 * Sub-turn latency figure: one decimal under ten seconds, whole seconds beyond.
 * Unit-less, so the locale template owns the second suffix.
 * @param ms - latency in milliseconds; negatives clamp to zero.
 * @returns the display number in seconds, without unit.
 */
export function formatLatencySeconds(ms: number): string {
  const seconds = Math.max(0, ms) / 1_000
  return seconds < 10 ? String(Math.round(seconds * 10) / 10) : String(Math.round(seconds))
}

/**
 * Decode-throughput figure: whole tokens from ten up, one decimal below.
 * @param tps - tokens per second.
 * @returns the display number, without unit.
 */
export function formatTokensPerSecond(tps: number): string {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}

/**
 * Compact token count: 517 / 12.2K / 517K / 1.2M.
 * @param value - a non-negative token count.
 * @param t - translate seat supplying the magnitude suffixes.
 * @returns the compact display string.
 */
export function formatTokens(value: number, t: SessionSyncTranslate): string {
  const scaled = (candidate: number): string =>
    candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return t('numberThousand', { value: scaled(value / 1_000) })
  return t('numberMillion', { value: scaled(value / 1_000_000) })
}

/**
 * Exact integer token count with the locale's digit grouping.
 * @param value - a non-negative safe integer.
 * @param t - translate seat supplying the group separator.
 * @returns the unrounded display string.
 */
export function formatExactTokens(value: number, t: SessionSyncTranslate): string {
  const digits = String(value)
  const groups: string[] = []
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end))
  }
  return groups.join(t('numberGroupSeparator'))
}

/** Round a cache-read ratio to exact percentage units, ties rounded up. */
function roundedPercentUnits(cacheReadTokens: number, denominator: number, decimalPlaces: 0 | 1): number {
  const unitsPerPercent = decimalPlaces === 0 ? 1 : 10
  const scale = unitsPerPercent * 100
  const doubledScale = scale * 2
  const quotient = Math.floor(denominator / doubledScale)
  const remainder = denominator % doubledScale
  let lower = 0
  let upper = scale
  while (lower < upper) {
    const candidate = Math.floor((lower + upper + 1) / 2)
    const factor = candidate * 2 - 1
    const threshold = factor * quotient + Math.ceil(factor * remainder / doubledScale)
    if (cacheReadTokens >= threshold) lower = candidate
    else upper = candidate - 1
  }
  return lower
}

/** Render percentage units at the requested precision. */
function displayPercentUnits(units: number, decimalPlaces: 0 | 1): string {
  if (decimalPlaces === 0) return String(units)
  const whole = Math.floor(units / 10)
  const tenths = units % 10
  return tenths === 0 ? String(whole) : `${whole}.${tenths}`
}

/**
 * Cache-hit share that never rounds a partial hit up to 100%.
 * @param cacheReadTokens - prompt tokens served from cache.
 * @param promptTokens - aggregate prompt tokens.
 * @param decimalPlaces - ordinary precision; a partial hit that would round to
 *   100 automatically takes enough extra precision to stay honest.
 * @returns the percentage text, or null when there was no prompt input.
 */
export function formatCacheHitPercent(
  cacheReadTokens: number,
  promptTokens: number,
  decimalPlaces: 0 | 1 = 0,
): string | null {
  if (promptTokens === 0) return null
  const missed = promptTokens - cacheReadTokens
  if (missed === 0) return '100'
  const units = roundedPercentUnits(cacheReadTokens, promptTokens, decimalPlaces)
  const full = decimalPlaces === 0 ? 100 : 1_000
  if (units < full) return displayPercentUnits(units, decimalPlaces)
  let places = 1
  let gap = missed * 200
  const tens = Math.floor(promptTokens / 10)
  while (gap <= tens) {
    gap *= 10
    places += 1
  }
  const ones = promptTokens % 10
  let loss = 5
  for (let candidate = 1; candidate < 5; candidate += 1) {
    const factor = candidate * 2 + 1
    if (gap <= factor * tens + Math.floor(factor * ones / 10)) {
      loss = candidate
      break
    }
  }
  return `99.${'9'.repeat(places - 1)}${10 - loss}`
}

/** The prompt-side buckets plus output, which is what a turn's total counts. */
export function billedInputTokens(usage: TurnUsage): number {
  return usage.input + usage.cacheRead + usage.cacheWrite
}

/** A turn's total tokens: every prompt-side bucket plus output. */
export function turnTotalTokens(usage: TurnUsage): number {
  return billedInputTokens(usage) + usage.output
}
