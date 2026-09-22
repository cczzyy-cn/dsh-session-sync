/**
 * What a wire tool name looks like in the console's conversation.
 *
 * The shipped client resolves this through `ui-tool`'s keyed
 * `tool.call.toolview` registrations: each tool family brings its own glyph and
 * its own localized title ("读取", "搜索", "终端"). A plugin cannot import
 * another plugin's components, so this is a copy of that vocabulary rather than
 * a call into it — and the glyphs are the exact ones those registrations use,
 * read off the toolviews themselves (read-family-row, file-mutation-row,
 * bash-sample, search-row, web-row, todo-row, ask-question-row, GenericToolCard).
 *
 * A tool no family claims falls back to the shipped generic card's own neutral
 * mark, with the wire name carried in the summary rather than invented into a
 * title.
 */
import type { SessionSyncKey } from './locales.ts'

/** The leading glyph family a tool row renders. */
export type ToolGlyph =
  | 'browse' | 'edit' | 'search' | 'terminal' | 'globe' | 'question' | 'plan' | 'share' | 'generic'

/** One tool's presentation. */
export interface ToolPresentation {
  glyph: ToolGlyph
  /** Dictionary key for the row's title; absent means "show the wire name". */
  labelKey?: SessionSyncKey
  /** The wire name, for a generic row that shows it in its summary instead. */
  wire?: string
}

/** Wire names whose row reads as one family, checked in order. */
const FAMILIES: readonly { glyph: ToolGlyph; labelKey: SessionSyncKey; match: RegExp }[] = [
  // read-family-row.tsx leads with IconBrowseOutlineRegular.
  { glyph: 'browse', labelKey: 'toolLabelRead', match: /^(read|view|cat|notebook_read|read_image|read_family)/ },
  // file-mutation-row.tsx leads with IconEditOutlineRegular.
  { glyph: 'edit', labelKey: 'toolLabelEdit', match: /^(write|edit|str_replace|apply_patch|file_mutation|patch|create_file)/ },
  // search-row.tsx leads with IconSearchOutlineRegular.
  { glyph: 'search', labelKey: 'toolLabelSearch', match: /^(grep|glob|find|list_dir|ls)/ },
  // web-row.tsx draws web_search with the browse mark and web_fetch with the globe.
  { glyph: 'browse', labelKey: 'toolLabelSearch', match: /^(web_search|search_web)/ },
  { glyph: 'globe', labelKey: 'toolLabelWeb', match: /^(web_fetch|fetch|browse|web)/ },
  // bash-sample.tsx leads with IconApiOutlineRegular.
  { glyph: 'terminal', labelKey: 'toolLabelTerminal', match: /^(pwsh|powershell|bash|sh|shell|zsh|cmd|term|terminal|exec|process)/ },
  { glyph: 'terminal', labelKey: 'toolLabelCode', match: /^(run_code|code|python|node|eval)/ },
  // ask-question-row.tsx leads with IconQuestionOutlineRegular.
  { glyph: 'question', labelKey: 'toolLabelAsk', match: /^(ask_user_question|ask_question|question|elicit)/ },
  // todo-row.tsx leads with IconChecklistOutlineRegular.
  { glyph: 'plan', labelKey: 'toolLabelPlan', match: /^(todo|plan|update_plan|checklist)/ },
  // No shipped row exists for these, so the share mark is this console's own.
  { glyph: 'share', labelKey: 'toolLabelSubagent', match: /^(subagent|workflow|task)/ },
]

/**
 * Present one tool call.
 * @param name - the wire tool name, as the origin logged it.
 * @returns the glyph and the title key, or the generic fallback.
 */
export function toolPresentation(name: string): ToolPresentation {
  const wire = name.trim().toLowerCase()
  for (const family of FAMILIES) {
    if (!family.match.test(wire)) continue
    return { glyph: family.glyph, labelKey: family.labelKey }
  }
  return wire === ''
    ? { glyph: 'generic' }
    : { glyph: 'generic', labelKey: 'toolLabelGeneric', wire: name }
}
