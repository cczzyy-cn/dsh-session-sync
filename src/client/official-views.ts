/**
 * Which shipped conversation page the console can ask for.
 *
 * The shipped shell draws one `conversation.view` entry per tab, chosen from the
 * owner prop the pane hands down (`ui-conversation`'s `DefaultConversationViews`:
 * `const viewId = view ?? active?.id`, then
 * `renderSlot('conversation.view', …, { only: viewId })`). `conversation.session`
 * belongs to the shipped content Factory, so the local Factory position this
 * plugin supplies is the only place the choice can come from — which is exactly
 * how the pane already pinned the chat page.
 *
 * The two ids are named here, once, because both the request and the fallback
 * decision key off them. The *existence* question is asked of the registry rather
 * than assumed: `conversation.view` is a list slot, so a build whose `ui-trajectory`
 * is absent — or disabled — simply has no such entry, and `entries()` answers an
 * undeclared key with an empty list on purpose, so a renderer may probe ahead of
 * plugin load order.
 */

/** The `conversation.view` entry id of the shipped chat page. */
export const CHAT_VIEW = 'chat'

/** The `conversation.view` entry id of the shipped trajectory page. */
export const TRAJECTORY_VIEW = 'trajectory'

/**
 * Whether one registry listing carries an entry with this id.
 *
 * Total by construction: an entry without options, or without an id, is simply not
 * the one being looked for — the question is "may the console hand this page to the
 * shipped view", and every answer other than a found id is no.
 * @param entries - one `slots.entries(key)` listing.
 * @param id - the entry id to look for.
 * @returns true when the shipped view for that page is registered here.
 */
export function hasViewEntry(
  entries: readonly { options?: { id?: string } }[],
  id: string,
): boolean {
  return entries.some(entry => entry.options?.id === id)
}
