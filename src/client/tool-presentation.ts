/**
 * What a wire tool name looks like in the console's conversation.
 *
 * The shipped client resolves this through `ui-tool`'s keyed
 * `tool.call.toolview` registrations: each tool family brings its own glyph and
 * its own localized title ("读取", "搜索", "终端"). A plugin cannot import
 * another plugin's components, so this is a copy of that vocabulary rather than
 * a call into it — which is also why an unrecognised name keeps the plain
 * status dot and its raw wire name: inventing a glyph for a tool this map has
 * never seen would be a guess presented as a fact.
 */
import type { SessionSyncKey } from './locales.ts'

/** The leading glyph family a tool row renders. */
export type ToolGlyph =
  | 'file' | 'edit' | 'search' | 'code' | 'web' | 'subagent' | 'plan' | 'ask' | 'generic'

/** One tool's presentation. */
export interface ToolPresentation {
  glyph: ToolGlyph
  /** Dictionary key for the row's title; absent means "show the wire name". */
  labelKey?: SessionSyncKey
  /** The path a file-family glyph should be classified from, when there is one. */
  path?: string
  /** The wire name, for a generic row that shows it in its summary instead. */
  wire?: string
}

/** Wire names whose row reads as one family, checked in order. */
const FAMILIES: readonly { glyph: ToolGlyph; labelKey: SessionSyncKey; match: RegExp }[] = [
  { glyph: 'file', labelKey: 'toolLabelRead', match: /^(read|view|cat|notebook_read|read_image|read_family)/ },
  { glyph: 'edit', labelKey: 'toolLabelEdit', match: /^(write|edit|str_replace|apply_patch|file_mutation|patch|create_file)/ },
  { glyph: 'search', labelKey: 'toolLabelSearch', match: /^(grep|glob|search|find|list_dir|ls)/ },
  { glyph: 'web', labelKey: 'toolLabelWeb', match: /^(web_search|web_fetch|web|fetch|browse)/ },
  { glyph: 'subagent', labelKey: 'toolLabelSubagent', match: /^(subagent|workflow|task)/ },
  { glyph: 'plan', labelKey: 'toolLabelPlan', match: /^(todo|plan|update_plan|checklist)/ },
  { glyph: 'ask', labelKey: 'toolLabelAsk', match: /^(ask_user_question|ask_question|question|elicit)/ },
  { glyph: 'code', labelKey: 'toolLabelTerminal', match: /^(pwsh|powershell|bash|sh|shell|zsh|cmd|term|terminal|exec|process)/ },
  { glyph: 'code', labelKey: 'toolLabelCode', match: /^(run_code|code|python|node|eval|workflow_run)/ },
]

/**
 * Present one tool call.
 * @param name - the wire tool name, as the origin logged it.
 * @param request - the row's one-line request preview, which for a file-family
 *   tool is its path and therefore what the glyph is classified from.
 * @returns the glyph, the title key, and the path when the glyph wants one.
 */
export function toolPresentation(name: string, request: string | undefined): ToolPresentation {
  const wire = name.trim().toLowerCase()
  for (const family of FAMILIES) {
    if (!family.match.test(wire)) continue
    const wantsPath = family.glyph === 'file' || family.glyph === 'edit'
    return {
      glyph: family.glyph,
      labelKey: family.labelKey,
      ...(wantsPath && request !== undefined && request !== '' ? { path: request } : {}),
    }
  }
  // No family claims it: the shipped client's own fallback is a generic card —
  // one neutral glyph, the word 工具调用, and the wire name moved into the
  // summary line. Matching that keeps one track of rows reading the same way
  // instead of a mix of titled and bare rows.
  return wire === ''
    ? { glyph: 'generic' }
    : { glyph: 'generic', labelKey: 'toolLabelGeneric', wire: name }
}
