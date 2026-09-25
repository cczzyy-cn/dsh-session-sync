/**
 * `dsh-session-sync` — browser half.
 *
 * Three additive contributions, none of which replaces a shipped cell:
 *
 *  - `settings.section` — the configuration page (machine name, server
 *    address, the server switch, the password, and the per-Session publish
 *    list).
 *  - `sidebar.panellist` — the panel row that opens the console. It needs no
 *    host patch and renders in both column widths, which is what makes the panel
 *    reachable in the collapsed rail.
 *  - `main` — the console: a machine → directory → Session tree beside the
 *    opened Session's conversation and the takeover composer.
 *
 * The conversation itself is the shipped renderer where the build supports it:
 * when the client context offers `ctx.sessions.adopt`, the open remote Session
 * is adopted and drawn by the product's own `conversation.content` factory
 * (`official-session.tsx`). Every other build — including every build that
 * exists today — keeps the console's own hand-drawn pane.
 *
 * Cross-plugin collaboration is through Cordis services only: `slots` and
 * `locale` are the two this half requires, `sessions` is read optionally when
 * the build offers the adoption API, and `ui-primitives` supplies every control
 * it renders.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigPatch } from '../shared/protocol.ts'
import { ConfigSection } from './ConfigSection.tsx'
import { OFFICIAL_SLOT, OfficialConversation, OfficialSessions } from './official-session.tsx'
import { PanelIcon } from './PanelIcon.tsx'
import { SyncPanel } from './SyncPanel.tsx'
import { SyncClient } from './api.ts'
import { NS, en, zh } from './locales.ts'

export const name = 'dsh-session-sync'

/** Services this half requires: slot registration and dictionaries. */
export const inject = ['slots', 'locale']

/**
 * One id for this plugin's centre panel and for its sidebar panel row.
 *
 * `ctx.layout.selectPanel(id)` validates the id against the registered `main`
 * keys, so the panel key and this constant are one contract.
 */
const PANEL_ID = 'session-sync'

/**
 * Mount the settings page, the sidebar panel row, and the console.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const client = new SyncClient()

  // The shipped-renderer mirror, feature-detected: the bridge picks whichever
  // route this build offers — a patched `ctx.sessions.adopt`, or a Session
  // retained and driven through released seams — and reports
  // `supported === false` only when it has none, where the console keeps its own
  // hand-drawn conversation untouched. The observer rides this plugin's own
  // effect lifetime, so unloading the half releases whatever Session it held.
  const official = new OfficialSessions(ctx, client, () => t('composerBlocked'))
  ctx.effect(() => {
    const detach = client.observe(official)
    return () => {
      detach()
      official.release()
    }
  }, 'dsh-session-sync: shipped-renderer mirror')

  // One stream and one poll for both surfaces: the settings page and the
  // console read the same snapshot, so a switch flipped on one is already
  // visible on the other.
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

  // The row the sidebar draws above the browsing region. It is the console's
  // only entry point, and it is a shipped slot: no host patch is involved.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    // After the shipped panel rows: the console is an addition to the column,
    // not a new primary destination.
    order: 40,
    label: () => t('panelTitle'),
  }, PanelIcon))

  const ctxSlots = ctx
  /**
   * Ask the shell to re-read its Session list.
   *
   * Feature-detected like every other optional client capability this half reads:
   * `sessions` is deliberately not in `inject`, because the console has to load
   * on builds whose Session service has no `refresh`. Without this, a Session the
   * Host wrote into its own storage stays invisible in the shell's own browser
   * until the page is reloaded — the client list is pulled, never pushed, for a
   * raw storage write.
   * @param sessionIds - the Sessions that just became real on this Host.
   */
  const announceWritten = (sessionIds: readonly string[]): void => {
    if (sessionIds.length === 0) return
    const service = ctxSlots.get?.('sessions')
    if (typeof service !== 'object' || service === null) return
    const refresh = (service as { refresh?: unknown }).refresh
    if (typeof refresh !== 'function') return
    void (refresh as () => Promise<void>).call(service).catch(() => undefined)
  }

  /**
   * Open one written Session in DSH's own conversation page.
   *
   * `uiWorkspace.openSession` is the shipped "select this Session and show its
   * Conversation as one navigation action": it retains the Session with the
   * `mainView` source and selects the conversation panel. That is the whole
   * point of writing the mirror into this Host — the official page, not a copy
   * of it.
   *
   * The retain inside it resolves against the *client's* Session catalog and
   * throws on an unknown id, and a session written straight through Host storage
   * is only in that catalog after a refresh. So the refresh comes first, and the
   * open is attempted after it; a build without either service leaves the click
   * doing what it did before.
   * @param sessionId - the Session to open.
   */
  const openAsSession = (sessionId: string): void => {
    const workspace = ctxSlots.get?.('uiWorkspace')
    if (typeof workspace !== 'object' || workspace === null) return
    const open = (workspace as { openSession?: unknown }).openSession
    if (typeof open !== 'function') return
    const call = open as (target: string) => void
    const sessions = ctxSlots.get?.('sessions')
    const refresh = typeof sessions === 'object' && sessions !== null
      ? (sessions as { refresh?: unknown }).refresh
      : undefined
    if (typeof refresh !== 'function') {
      call.call(workspace, sessionId)
      return
    }
    void (refresh as () => Promise<void>).call(sessions)
      .then(() => { call.call(workspace, sessionId) })
      .catch(() => undefined)
  }

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    // The session-scoped child is where the shipped Conversation lives. It
    // declares nothing on a build without the adoption API to render into it,
    // and declaring it is what hands the panel its `SessionProvider` and
    // `renderSlot` seats — the exact shape ui-subagent's chat tab uses.
    children: { [OFFICIAL_SLOT]: { kind: 'single', scope: 'session' } },
    inject: () => ({
      hooks: { sync: client.snapshot },
      openSession: (machineName: string, sessionId: string) => client.openSession(machineName, sessionId),
      closeSession: () => { client.closeSession() },
      loadOlder: () => client.loadOlder(),
      sendPrompt: (text: string) => client.sendPrompt(text),
      sessionsWritten: announceWritten,
      openAsSession,
      official,
    }),
  }, SyncPanel))

  // The pane body itself: the shipped conversation.content Factory occurrence,
  // registered against the child slot the panel declares.
  ctx.slots.inject(OFFICIAL_SLOT, () => ctx.slots.register({
    name: OFFICIAL_SLOT,
  }, OfficialConversation))
}
