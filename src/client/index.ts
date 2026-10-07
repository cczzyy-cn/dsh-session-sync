/**
 * `dsh-session-sync` — browser half.
 *
 * Three additive contributions, none of which replaces a shipped cell:
 *
 *  - `plugins.detail.section` — this plugin's configuration, on its own pages of
 *    the Plugins page: machine name, server address, the server switch, the
 *    password, and the per-Session publish list. The section renders on every
 *    detail page, so the entry reads the open page's subject and answers `null`
 *    for a page that is not this bundle's.
 *  - `settings.section` is deliberately *not* registered any more: the
 *    configuration moved to the Plugins page, and one document should not have
 *    two forms.
 *  - `sidebar.panellist` — the panel row that opens the console. It needs no
 *    host patch and renders in both column widths, which is what makes the panel
 *    reachable in the collapsed rail.
 *  - `main` — the console: a machine → directory → Session tree beside the
 *    opened Session's conversation and the takeover composer.
 *  - `conversation.input.dock` — the takeover composer itself, on the route that
 *    draws the shipped conversation: the console hides the shipped input capsule
 *    so that the shipped statistics row and context meter beneath it become the
 *    footer, and its own card takes the seat directly above them. Null for every
 *    Session this console has not retained.
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
import * as React from 'react'
import type { ConfigPatch, RelayedAnswerItem, RelayedApprovalDecision } from '../shared/protocol.ts'
import { ConfigSection } from './ConfigSection.tsx'
import type { ConfigSectionProps } from './ConfigSection.tsx'
import { ComposerDrafts } from './composer-draft.ts'
import { ownsSubject, type PluginsSubjectLike } from './config-entry.ts'
import { MirrorComposerDock } from './MirrorComposer.tsx'
import { OFFICIAL_SLOT, OfficialConversation, OfficialSessions } from './official-session.tsx'
import { hasViewEntry, TRAJECTORY_VIEW } from './official-views.ts'
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
 * The configuration form, seated on the Plugins page's detail section.
 *
 * The section renders on every detail page, so this is where the subject is
 * read: the form is reached only for this bundle or its row, and every other
 * page gets `null` rather than another plugin's configuration.
 * @param props - the entry's props, with the open page's subject.
 * @returns the configuration, or null for a page that is not this plugin's.
 */
function ConfigSectionForDetail(props: ConfigSectionProps & { subject?: PluginsSubjectLike }): React.ReactElement | null {
  if (!ownsSubject(props.subject)) return null
  return ConfigSection(props)
}

/**
 * Mount the settings page, the sidebar panel row, and the console.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const client = new SyncClient()
  // The takeover prompt, held outside either of the two seats that can draw it:
  // switching tabs moves the card between the shipped composer stack and the
  // console's own footer, and the draft has to survive the move.
  const drafts = new ComposerDrafts()

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

  // This plugin's configuration, on its own pages of the Plugins page.
  //
  // The slot renders on *every* detail page, so the guard is what keeps the form
  // off other plugins' pages: it is reached only for this bundle or its row.
  //
  // `plugins.row.config` — the configure control the page's contract describes
  // for one row — was implemented first and produced no control on this
  // deployment: registering under every plausible key left the row without one,
  // on both the packaged desktop host and the deployed server. This section is
  // verified on both. See `config-entry.ts` for the full note.
  ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({
    name: 'plugins.detail.section',
    id: PANEL_ID,
    locale: NS,
    inject: () => ({
      hooks: { sync: client.snapshot },
      configure: (patch: ConfigPatch) => client.configure(patch),
      setSessionSync: (sessionId: string, synced: boolean) => client.setSessionSync(sessionId, synced),
      setSessionApprovals: (sessionId: string, approved: boolean) =>
        client.setSessionApprovals(sessionId, approved),
    }),
  }, ConfigSectionForDetail))

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
      drafts,
      // Asked on every render rather than answered once: `conversation.view` is a
      // list slot another plugin registers into, so whether the shipped trajectory
      // page exists depends on load order — and the console has to fall back to its
      // own ledger on a build whose ui-trajectory never arrives. `entries()` answers
      // an undeclared key with an empty list exactly so this probe is safe.
      hasTrajectoryView: () => hasViewEntry(ctx.slots.entries('conversation.view'), TRAJECTORY_VIEW),
    }),
  }, SyncPanel))

  // The pane body itself: the shipped conversation.content Factory occurrence,
  // registered against the child slot the panel declares.
  ctx.slots.inject(OFFICIAL_SLOT, () => ctx.slots.register({
    name: OFFICIAL_SLOT,
  }, OfficialConversation))

  // The takeover composer, as an occurrence of the shipped composer stack.
  //
  // Where the shipped conversation is drawn the console hides the shipped *input
  // capsule* and nothing else, so the shipped statistics row and context meter
  // below it render themselves and become the footer. That leaves the console's
  // own card needing a seat in that stack, directly above the capsule it stands
  // in for — and `conversation.input.dock` is exactly that seat: the shipped
  // stack's own list of cards, one slot above the composer bar.
  //
  // Registered rather than drawn by the panel because the panel cannot render a
  // slot another registration owns (one declarer per slot, and
  // `conversation.composer.bar` is the shipped content Factory's). The entry
  // answers null for every Session this console has not retained, which is what
  // keeps it out of the product's own sessions.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: PANEL_ID,
    // Last in the stack: the shipped goal bar is 10 and the queue dock 20, and
    // this card is the one nearest the capsule it replaces.
    order: 100,
    locale: NS,
    inject: () => ({
      hooks: { sync: client.snapshot },
      sendPrompt: (text: string) => client.sendPrompt(text),
      official,
      drafts,
    }),
  }, MirrorComposerDock))
}
