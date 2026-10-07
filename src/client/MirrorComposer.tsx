/**
 * The console's takeover composer, as one component drawn by two seats.
 *
 * The card is the console's own — the shipped composer cannot be used, because
 * its prompt would be carried to a Host that has never heard of the mirrored
 * Session — but *where* it is drawn follows what the pane is showing:
 *
 *  - on the chat tab of a build that can render a retained Session, it is the
 *    `conversation.input.dock` occurrence inside the shipped composer stack, so
 *    the shipped input capsule can be hidden and the shipped statistics row and
 *    context meter below it become the footer (see `official-session.tsx` and
 *    `footer-projections.ts`);
 *  - on the trajectory tab, and on a build with no shipped conversation at all,
 *    it is the console's own footer, drawn beside its own transcript.
 *
 * Both seats render *this*, and both read their draft from the shared
 * {@link ComposerDrafts} store, so switching between them keeps what the reader
 * typed.
 */
import * as React from 'react'
import type { CommandDelivery, SyncClientSnapshot } from './api.ts'
import { draftKey, type ComposerDrafts, type ComposerDraftState } from './composer-draft.ts'
import type { SessionSyncKey, SessionSyncTranslate } from './locales.ts'
import type { OfficialBridgeFace } from './official-session.tsx'
import { IconRightUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './sync.module.css'

/**
 * The delivery state of the last prompt, as the composer renders it.
 * @param delivery - the last takeover prompt's progress.
 * @param t - the localized copy lookup.
 * @returns the line the card prints beside its target.
 */
export function deliveryLine(delivery: CommandDelivery, t: (key: SessionSyncKey) => string): string {
  if (delivery.state === 'queued') return t('deliveryQueued')
  if (delivery.state === 'delivered') return t('deliveryDelivered')
  if (delivery.state === 'accepted') return t('deliveryAccepted')
  if (delivery.state === 'expired') return t('deliveryExpired')
  return delivery.error === undefined
    ? t('deliveryFailed')
    : `${t('deliveryFailed')}: ${delivery.error}`
}

/**
 * One Session's draft, as a seat renders it: read once on mount, then re-read on
 * every change any seat makes.
 *
 * A plain subscription rather than `useSyncExternalStore`: the store hands out a
 * frozen object per Session, so a re-read that changed nothing is one reference
 * comparison, and React bails out of the re-render on the same identity.
 * @param drafts - the shared store.
 * @param key - the Session this seat is addressed to.
 * @returns the state to render.
 */
export function useDraft(drafts: ComposerDrafts, key: string): ComposerDraftState {
  const [state, setState] = React.useState(() => drafts.read(key))
  React.useEffect(() => {
    // Re-read on the way in: the draft may have been typed into the other seat
    // while this one was unmounted, and it is the same prompt either way.
    setState(drafts.read(key))
    return drafts.subscribe(() => { setState(drafts.read(key)) })
  }, [drafts, key])
  return state
}

/** What one composer seat hands the card. */
export interface MirrorComposerProps {
  t: SessionSyncTranslate
  /** The shared draft store both seats read and write. */
  drafts: ComposerDrafts
  /** The Session this seat addresses: where its draft is filed. */
  draftKey: string
  /** The machine the prompt will be relayed to. */
  machineName: string
  /** The last prompt's progress, when this console has sent one. */
  delivery?: CommandDelivery
  /** Whether that machine's server is connected. */
  online: boolean
  /** Hand one prompt to the sync link. Resolves true once the machine's server took it. */
  send: (text: string) => Promise<boolean>
  /**
   * Whether this card stands in for the shipped input capsule inside the shipped
   * composer stack.
   *
   * Its own class because the geometry differs: in the stack the card takes the
   * stack's slot and has to cancel the gap that the capsule it replaces did not
   * have, while the console's own footer already owns its spacing.
   */
  inShippedStack?: boolean
}

/**
 * Render the takeover composer card.
 * @param props - copy, the shared draft store, and the action that sends.
 * @returns the card.
 */
export function MirrorComposer(props: MirrorComposerProps): React.ReactElement {
  const { t, drafts, draftKey, machineName, delivery, online, send } = props
  const draft = useDraft(drafts, draftKey)
  const submit = (): void => {
    const text = draft.text.trim()
    if (text === '' || draft.sending) return
    drafts.setSending(draftKey, true)
    void send(text).then((accepted) => {
      drafts.setSending(draftKey, false)
      // Only a prompt the server accepted is taken out of the box: a refused one
      // is still the reader's text, and losing it would be the worst possible
      // answer to a failure.
      if (accepted) drafts.clear(draftKey)
    })
  }
  return (
    <div
      className={props.inShippedStack === true ? css.dockComposer : css.composerRootInner}
      // The marker the console's own footer stands down for: see the `:has()` rule
      // on `.officialPane` in `sync.module.css`, which is what keeps exactly one of
      // the two cards on screen without either of them having to know the other
      // mounted — and what leaves the console's own card as the standing fallback
      // if the shipped stack ever stops rendering this seat.
      {...(props.inShippedStack === true ? { 'data-sync-composer': '' } : {})}
    >
      <form
        className={css.composerCard}
        onSubmit={(event) => { event.preventDefault(); submit() }}
      >
        <textarea
          className={css.composerText}
          value={draft.text}
          rows={2}
          placeholder={t('composerPlaceholder')}
          aria-label={t('composerPlaceholder')}
          onChange={(event) => { drafts.setText(draftKey, event.target.value) }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return
            event.preventDefault()
            submit()
          }}
        />
        <div className={css.composerBar}>
          <span className={css.composerTarget}>
            {t('composerTarget')}
            {' '}
            {machineName}
          </span>
          {delivery !== undefined && (
            <span className={css.composerDelivery}>{deliveryLine(delivery, t)}</span>
          )}
          {!online && <span className={css.composerOffline}>{t('offlineQueueHint')}</span>}
          <span className={css.composerSpacer} />
          <button
            type="submit"
            className={css.sendButton}
            disabled={draft.sending || draft.text.trim() === ''}
            aria-label={draft.sending ? t('sending') : t('send')}
          >
            <IconRightUpOutlineRegular />
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * What the shipped composer stack hands one dock occurrence.
 *
 * The standard kit of a session-scope slot (`sessionId`, and the hook the
 * registration's `hooks` compartment binds) plus this entry's own inject face.
 * Declared here rather than imported from `ui-slots`, the way every other
 * cross-plugin seat in this half is: the shipped types are not resolvable in this
 * package's own program, and a declaration of what this component *calls* is
 * what the plugin actually depends on.
 */
export interface MirrorComposerDockProps {
  /** The locale seat, from the registration's `locale` namespace. */
  t: SessionSyncTranslate
  /** The Session this occurrence belongs to. */
  sessionId: string
  /** The bound snapshot hook, from the registration's `hooks` compartment. */
  useSync: <Value>(selector: (snapshot: SyncClientSnapshot) => Value) => Value
  /** The shared draft store, from this entry's inject face. */
  drafts: ComposerDrafts
  /** The feature-detected bridge to the shipped renderer. */
  official: OfficialBridgeFace
  /** Send one takeover prompt to the open Session's machine. */
  sendPrompt: (text: string) => Promise<boolean>
}

/**
 * The console's composer as an occurrence of the shipped `conversation.input.dock`.
 *
 * The seat is the shipped composer stack, one slot above the shipped input
 * capsule, and it exists for *every* Session the product draws — so this returns
 * nothing unless the Session in hand is the one the console has retained under a
 * synthetic identity. That check is also what makes the console's own footer the
 * fallback: when the shipped conversation is not being drawn (the trajectory tab,
 * or a build with no retention seam) this entry is not mounted at all.
 *
 * `open` is read through the snapshot hook rather than asked of the bridge,
 * because the bridge is a plain object and this component has to re-render when
 * the console opens, switches or closes a Session.
 * @param props - the standard kit and this entry's inject face.
 * @returns the card, or null for a Session the console does not own.
 */
export function MirrorComposerDock(props: MirrorComposerDockProps): React.ReactElement | null {
  const { t, useSync, drafts, official, sendPrompt, sessionId } = props
  // This occurrence is mounted in *every* Session's composer stack, not just the
  // console's pane — the product's own local sessions included — so nothing here
  // may assume a seat this build did not deliver: a missing hook would take the
  // whole product's composer down with it, a far worse failure than the one this
  // card exists to prevent. Everything else it needs arrives on this plugin's own
  // inject face. The console's own footer is still on the page for exactly this
  // case: the `:has()` rule in `sync.module.css` only stands it down while *this*
  // card actually rendered.
  if (typeof useSync !== 'function' || sessionId === undefined) return null
  const open = useSync(snapshot => snapshot.open)
  const machines = useSync(snapshot => snapshot.state.machines)
  const delivery = useSync(snapshot => snapshot.delivery)
  // Both halves matter: the bridge's `owns` says the mirror is really retained
  // (so a prompt has a road to the machine), and it is checked against the id
  // this occurrence was mounted for, not against the open Session — the two are
  // the same object only while the console is not mid-switch.
  if (open === undefined || !official.owns(sessionId)) return null
  return (
    <MirrorComposer
      t={t}
      drafts={drafts}
      draftKey={draftKey(open.machineName, open.sessionId)}
      machineName={open.machineName}
      delivery={delivery}
      online={machines.find(machine => machine.machineName === open.machineName)?.online === true}
      send={sendPrompt}
      inShippedStack
    />
  )
}
