/**
 * `dsh-session-sync` — browser half.
 *
 * Four additive contributions, none of which replaces a shipped cell:
 *
 *  - `settings.section` — the configuration page (machine name, server
 *    address, the server switch, the password, and the per-Session publish
 *    list).
 *  - `sidebar.panellist` — the panel row that opens the console. It is what
 *    makes the panel reachable in the collapsed rail, where a grouped list has
 *    no room and the sidebar section below renders nothing.
 *  - `sidebar.region.section` — **服务器同步工作区**, a glance at the connected
 *    machines beside the workspace browser, whose header row is the second way
 *    into the console.
 *  - `main` — the console itself: machines, their Sessions, and one opened
 *    Session with the takeover composer.
 *
 * Cross-plugin collaboration is through Cordis services only: `slots`,
 * `locale`, and `layout` are the three this half needs, and `ui-primitives`
 * supplies every control it renders.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigPatch } from '../shared/protocol.ts'
import { ConfigSection } from './ConfigSection.tsx'
import { PanelIcon } from './PanelIcon.tsx'
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

  // The row the sidebar draws above the browsing region. Without it the panel
  // would only be reachable from the section below, which is a wide-column
  // surface: the rail would have no way in at all.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    // After the shipped panel rows and this plugin's own settings section: the
    // console is an addition to the column, not a new primary destination.
    order: 40,
    label: () => t('panelTitle'),
  }, PanelIcon))

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
