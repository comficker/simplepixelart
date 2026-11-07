// Preview modes for the editor's preview panel. "flat" is the plain picture;
// every other mode says which canvases it suits, and the settings offer it
// only there. A board keeps its choice and options in meta.preview, so a base
// can open its copies straight in the right mode. To add a mode: list it
// here, give its options defaults, render it in the preview widget and add
// its controls to EditorPreviewSettings.
import type {SkinArms, SkinPose} from './mc-skin'

export interface PreviewMeta {
  mode: string
  // Behind every mode.
  bg: 'checker' | 'color' | 'none'
  bgColor: string
  // flat
  pixelPerfect: boolean
  // tiled
  repeat: number
  // mc-skin
  arms: SkinArms
  outer: boolean
  pose: SkinPose
  spin: boolean
  speed: number      // turns per minute
  pitch: number      // camera angle in degrees
  shade: boolean
  framing: 'body' | 'head'
}

export const PREVIEW_DEFAULTS: PreviewMeta = {
  mode: 'flat', bg: 'none', bgColor: '#FFFFFF',
  pixelPerfect: false, repeat: 3,
  arms: 'classic', outer: true, pose: 'stand', spin: true, speed: 6, pitch: 18, shade: true, framing: 'body',
}

export interface PreviewMode {
  id: string
  fits: (ed: { width: number, height: number }) => boolean
}

export const PREVIEW_MODES: PreviewMode[] = [
  {id: 'flat', fits: () => true},
  {id: 'tiled', fits: () => true},
  {id: 'mc-skin', fits: ed => ed.width === 64 && ed.height === 64},
]

export function previewModesFor(ed: { width: number, height: number }): PreviewMode[] {
  return PREVIEW_MODES.filter(m => m.fits(ed))
}

/** The board's preview options, defaults filled in; a mode that no longer
 *  fits the canvas falls back to flat. */
export function previewOf(ed: { width: number, height: number, meta?: any }): PreviewMeta {
  const p: PreviewMeta = {...PREVIEW_DEFAULTS, ...(ed?.meta?.preview || {})}
  const m = PREVIEW_MODES.find(x => x.id === p.mode)
  if (!m || !m.fits(ed)) p.mode = 'flat'
  return p
}
