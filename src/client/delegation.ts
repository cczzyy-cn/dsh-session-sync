/**
 * Which wire tool names are *delegations*, defined once for everyone who asks.
 *
 * This set used to live in two places and mean two different things: the ledger's
 * presentation knew three families (`subagent`, `workflow`, `task` — the regex
 * below), while the session chrome's subagent counter knew only two names
 * (`subagent`, `subagent_fork`). So a Session that delegated through `workflow` —
 * the tool that fans out to many subagents at once — drew its delegation rows in the
 * ledger and reported `子代理 0` in the header, which is what a reader noticed.
 *
 * Prefix matching is deliberate and inherited from the presentation layer: it keeps
 * future variants (`subagent_*`, `task_*`) counted without another edit here. The
 * cost is that a hypothetical non-delegating `tasks`-style tool would be counted
 * too, which is the cheaper mistake of the two.
 */

/** The one pattern that decides what a delegation is. */
export const DELEGATION_TOOL_MATCH = /^(subagent|workflow|task)/

/**
 * Whether one wire tool name is a delegation.
 * @param name - the tool name as the log reports it.
 * @returns true when this call delegates work to subagents.
 */
export function isDelegationTool(name: string): boolean {
  return DELEGATION_TOOL_MATCH.test(name)
}