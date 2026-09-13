/**
 * `dsh-session-sync` — browser half.
 *
 * Three additive contributions, none of which replaces a shipped cell:
 *
 *  - `settings.section` — the configuration page (machine name, server
 *    address, the server switch, the password, and the per-Session publish
 *    list).
 *  - `sidebar.region.section` — **服务器同步工作区**, a section of the sidebar's
 *    browsing region, beside the workspace browser. It is a section rather than
 *    a global panel row because it is a grouped list to browse, and a row in
 *    the panel list would swap the whole centre column instead of expanding
 *    where it stands.
 *  - `main` — the centre column for one opened Session: its transcript and the
 *    takeover composer.
 *
 * Cross-plugin collaboration is through Cordis services only: `slots`,
 * `locale`, and `layout` are the three this half needs, and `ui-primitives`
 * supplies every control it renders.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigPatch } from '../shared/protocol.ts'
import { ConfigSection } from './ConfigSection.tsx'
import { SyncPanel } from './SyncPanel.tsx'
import { SyncSection } from './SyncSection.tsx'
import { SyncClient } from './api.ts'
import { NS, en, zh } from './locales.ts'

export const name = 'dsh-session-sync'

/** Services this half requires: slots, dictionaries, and panel selection. */
export const inject = ['slots', 'locale', 'layout']

/**
 * One id for this plugin's centre panel and for the section's overview
 * gesture.
 *
 * `ctx.layout.selectPanel(id)` validates the id against the registered `main`
 * keys, so the panel key and this constant are one contract.
 */
const PANEL_ID = 'session-sync'

/**
 * Mount the settings page, the sidebar section, and the centre panel.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const client = new SyncClient()

  // One stream and one poll for all three surfaces: the settings page, the
  // sidebar section, and the centre panel read the same snapshot, so a switch
  // flipped on one is already visible on the others.
  ctx.effect(() => {
    client.start()
    return () => { client.stop() }
  }, 'dsh-session-sync: live stream')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-session-sync: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: PANEL_ID,
    order: 30,
    label: () => t('sectionNav'),
    locale: NS,
    inject: () => ({
      hooks: { sync: client.snapshot },
      configure: (patch: ConfigPatch) => client.configure(patch),
      setSessionSync: (sessionId: string, synced: boolean) => client.setSessionSync(sessionId, synced),
    }),
  }, ConfigSection))

  ctx.slots.inject('sidebar.region.section', () => ctx.slots.register({
    name: 'sidebar.region.section',
    locale: NS,
    inject: () => ({
      hooks: { sync: client.snapshot },
      openSession: (machineName: string, sessionId: string) => {
        // Opening the Session also claims the centre column: selecting the row
        // and leaving the previous panel on screen would show the reader a
        // transcript they cannot see.
        ctx.layout.selectPanel(PANEL_ID)
        return client.openSession(machineName, sessionId)
      },
      openOverview: () => { ctx.layout.selectPanel(PANEL_ID) },
    }),
  }, SyncSection))

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({
      hooks: { sync: client.snapshot },
      openSession: (machineName: string, sessionId: string) => client.openSession(machineName, sessionId),
      closeSession: () => { client.closeSession() },
      sendPrompt: (text: string) => client.sendPrompt(text),
    }),
  }, SyncPanel))
}
