/**
 * The icon the sidebar renders for this plugin's global panel row.
 *
 * The row is the entry that survives the collapsed rail, where the browsing
 * region's section renders nothing at all, so it exists as its own component
 * rather than as an inline JSX expression: the registration lives in `index.ts`,
 * which is a `.ts` module.
 */
import * as React from 'react'
import { IconGlobeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

/** Props the sidebar's panel-list owner share supplies. */
export interface PanelIconProps {
  /** Requested square edge in pixels (16 wide, 18 in the rail). */
  size: number
  /** Whether this panel is the one selected in the centre column. */
  active: boolean
}

/**
 * Render the panel row's glyph.
 * @param props - the requested icon size.
 * @returns the icon; selection is the row's own styling, not the glyph's.
 */
export function PanelIcon(props: PanelIconProps): React.ReactElement {
  return <IconGlobeOutlineRegular size={props.size} />
}
