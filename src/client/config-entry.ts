/**
 * The configuration entry's one-liner, as a pure function of the configuration.
 *
 * It lives apart from the component that renders it because the test runner
 * cannot load a `.tsx` module (no bundler in the test path), and this is the one
 * part of the entry with a decision in it: the Plugins page asks the entry for a
 * summary *and* for the form, and the summary is a fallback the page drops into
 * a paragraph when the row declares no description. A summary that answered with
 * the form would be a whole page inside that paragraph.
 */
import type { SyncConfig } from '../shared/protocol.ts'
import type { SessionSyncKey } from './locales.ts'

/**
 * The line the Plugins page shows under this row's title.
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
