/**
 * `dsh-session-sync` — browser half.
 *
 * Three additive contributions, none of which replaces a shipped cell:
 *
 *  - `plugins.row.config` — this bundle's configuration, registered under the
 *    row's key (`dsh-session-sync#session-sync`): machine name, server address,
 *    the server switch, the password, and the per-Session publish list. It is
 *    the Plugins page's own slot for a bundle's row, so the page gains a
 *    configure control on this row; the registration is declared against the
 *    slot, which is what makes an older build — one that declares no such slot —
 *    keep working with no contribution rather than a broken one.
 *  - `sidebar.panellist` — the panel row that opens the console. It needs no
 *    host patch and renders in both column widths, which is what makes the panel
 *    reachable in the collapsed rail.
 *  - `main` — the console: a machine → directory → Session tree beside the
 *    opened Session's conversation and the takeover composer.
 *
 * The conversation itself is the shipped renderer where the build supports it:
 * when the client context offers `ctx.sessions.retainAgentScope`, the open
 * remote Session is retained under a synthetic identity and drawn by the
 * product's own `conversation.content` factory (`official-session.tsx`). A build
 * without that seam keeps the console's own hand-drawn pane.
 *
 * Cross-plugin collaboration is through Cordis services only: `slots` and
 * `locale` are the two this half requires, `sessions` is read optionally for the
 * retention seam, and `ui-primitives` supplies every control it renders.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigPatch, RelayedAnswerItem, RelayedApprovalDecision } from '../shared/protocol.ts'
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

  // The shipped-renderer mirror, feature-detected: the bridge takes the one
  // route a released build offers — a Session retained through
  // `ctx.sessions.retainAgentScope` and driven through the window that hands
  // back — and reports `supported === false` only when the build has no such
  // seam, where the console keeps its own hand-drawn conversation untouched. The
  // observer rides this plugin's own effect lifetime, so unloading the half
  // releases whatever Session it held.
  const official = new OfficialSessions(ctx, () => t('composerBlocked'))
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

  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
    name: 'plugins.row.config',
    // `<package name>#<row id>` — the row this bundle's patch inserts. The
    // Plugins page draws a configure control on that row only when this key is
    // registered (`config-ledger.ts` collects exactly these keys), so without it
    // the package's page shows a description and no way to configure it. The
    // declared slot also caps what the page will look for: `plugins.item` is the
    // official settings pages' slot and is occupied.
    key: 'dsh-session-sync#session-sync',
    locale: NS,
    inject: () => ({
      hooks: { sync: client.snapshot },
      configure: (patch: ConfigPatch) => client.configure(patch),
      setSessionSync: (sessionId: string, synced: boolean) => client.setSessionSync(sessionId, synced),
      setSessionApprovals: (sessionId: string, approved: boolean) =>
        client.setSessionApprovals(sessionId, approved),
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

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    // The session-scoped child is where the shipped Conversation lives. It
    // declares nothing on a build without the retention seam to render into it,
    // and declaring it is what hands the panel its `SessionProvider` and
    // `renderSlot` seats — the exact shape ui-subagent's chat tab uses.
    children: { [OFFICIAL_SLOT]: { kind: 'single', scope: 'session' } },
    inject: () => ({
      hooks: { sync: client.snapshot },
      openSession: (machineName: string, sessionId: string) => client.openSession(machineName, sessionId),
      closeSession: () => { client.closeSession() },
      loadOlder: () => client.loadOlder(),
      loadAllOlder: () => client.loadAllOlder(),
      sendPrompt: (text: string) => client.sendPrompt(text),
      answerQuestion: (machineName: string, questionId: string, answers: RelayedAnswerItem[]) =>
        client.answerQuestion(machineName, questionId, answers),
      decideApproval: (machineName: string, approvalId: string, decision: RelayedApprovalDecision) =>
        client.decideApproval(machineName, approvalId, decision),
      official,
    }),
  }, SyncPanel))

  // The pane body itself: the shipped conversation.content Factory occurrence,
  // registered against the child slot the panel declares.
  ctx.slots.inject(OFFICIAL_SLOT, () => ctx.slots.register({
    name: OFFICIAL_SLOT,
  }, OfficialConversation))
}
