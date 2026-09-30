/**
 * Where this plugin's configuration is offered, and to whom.
 *
 * The Plugins page gives a bundle two ways to carry configuration: a configure
 * control on one of its rows (`plugins.row.config`, keyed `<package>#<row id>`)
 * and a section under a detail page's own content (`plugins.detail.section`).
 * The row control is the one the page's own contract describes for a bundle like
 * this, and it was implemented first — but the build this deployment runs does
 * not turn a registration into that control: registering under every plausible
 * key (`dsh-session-sync#session-sync`, the bare package name, the bare row id)
 * still left the row without one, on both the packaged desktop host and the
 * deployed server. The detail section is verified to work on both, so the form is
 * offered there instead, and the guard below is what keeps it off every other
 * plugin's page.
 *
 * This module stays pure (no React, no JSX) because the test runner cannot load
 * a `.tsx` module: the predicate is the part with a decision in it, and that
 * decision is testable.
 */
import type { SyncConfig } from '../shared/protocol.ts'
import type { SessionSyncKey } from './locales.ts'

/** This plugin's npm package name, as the Plugins page reports it. */
export const PACKAGE_NAME = 'dsh-session-sync'

/** The row id this bundle's patch inserts. */
export const ROW_ID = 'session-sync'

/** The shape of a detail page's subject, to the depth this plugin reads. */
export interface PluginsSubjectLike {
  readonly kind: 'bundle' | 'row' | 'item'
  readonly pkg?: { readonly name: string } | undefined
  readonly row?: { readonly rowId: string } | undefined
  readonly id?: string | undefined
}

/**
 * Whether the open detail page is this plugin's.
 *
 * `plugins.detail.section` renders on *every* detail page — the contribution
 * decides from the subject whether it has anything to say — so without this the
 * form would appear under every installed plugin's page.
 * @param subject - the open page's subject.
 * @returns true when the page is about this plugin's bundle or its row.
 */
export function ownsSubject(subject: PluginsSubjectLike | undefined): boolean {
  if (subject === undefined) return false
  if (subject.kind === 'bundle') return subject.pkg?.name === PACKAGE_NAME
  if (subject.kind === 'row') return subject.pkg?.name === PACKAGE_NAME && subject.row?.rowId === ROW_ID
  return false
}

/**
 * Split an option's shipped "recommended" marker off its label.
 *
 * The asker marks a suggestion by suffixing its label — `(recommended)` or
 * `（推荐）` — and the shipped composer renders that marker as its own badge rather
 * than as part of the text. This console reads the same convention out of the
 * relayed option, so an option the asking machine flagged looks flagged here too.
 * @param label - the option's label as the asker wrote it.
 * @returns the label without the marker, and whether the marker was there.
 */
export function parseRecommendedLabel(label: string): { label: string; recommended: boolean } {
  const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i
  return suffix.test(label)
    ? { label: label.replace(suffix, ''), recommended: true }
    : { label, recommended: false }
}

/**
 * One line reading the configuration in force, for a header or a fallback.
 * @param t - localized copy.
 * @param config - the configuration in force.
 * @returns the summary text.
 */
export function summaryOf(t: (key: SessionSyncKey) => string, config: SyncConfig): string {
  const role = config.isServer ? t('roleServer') : t('roleClient')
  // A server is read by the address it listens on, never by `serverUrl`: that
  // field says where a machine publishes to, which is not a fact about the
  // machine that serves.
  const where = config.isServer ? config.listenHost + ':' + String(config.listenPort) : config.serverUrl
  return [config.machineName, role, where].filter(part => part !== '').join(' · ')
}
