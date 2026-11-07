// Preview modes for the editor's preview panel. "flat" is the plain picture;
// every other mode says which canvases it suits, and the panel offers it only
// there. A board keeps its choice in meta.preview, so a base can open its
// copies straight in the right mode. To add one: list it here and render it in
// EditorPreview.
import type {SkinArms} from './mc-skin'

export interface PreviewMeta {
  mode?: string
  arms?: SkinArms
  outer?: boolean
}

export interface PreviewMode {
  id: string
  label: string
  fits: (ed: { width: number, height: number }) => boolean
}

export const PREVIEW_MODES: PreviewMode[] = [
  {id: 'flat', label: 'Flat', fits: () => true},
  {id: 'mc-skin', label: 'Skin', fits: ed => ed.width === 64 && ed.height === 64},
]

export function previewModesFor(ed: { width: number, height: number }): PreviewMode[] {
  return PREVIEW_MODES.filter(m => m.fits(ed))
}

/** The board's chosen mode, or flat when it has none or it no longer fits. */
export function previewModeOf(ed: { width: number, height: number, meta?: any }): string {
  const want = ed?.meta?.preview?.mode
  const m = PREVIEW_MODES.find(x => x.id === want)
  return m && m.fits(ed) ? m.id : 'flat'
}
