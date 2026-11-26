import type {InjectionKey, Ref} from 'vue'

/* K3 "pixel windows": the editor's panels float on a desk (the canvas area)
   and can be dragged by their title bar and folded to a small chip. Ported
   from the mobile app's K3 editor (editor_screen.dart: _Place, _lift, _drag,
   _fold):
   - each window has a pin (top-left on the desk) and a z; the one touched
     last sits on top. No snapping, windows may overlap.
   - dragging keeps at least 64px of the window and its whole title band on
     the desk.
   - folding/opening keeps the top-left corner, then pushes the whole window
     inside the desk, with a 140ms scale-and-fade from the top-left.
   - a window resizes from the grip in its bottom-right corner (the web has
     room for it; the app has no window resize yet).
   - a dragged window snaps (within SNAP px) to the desk's margins and to the
     other windows' edges, lined up or side by side; the lines it snapped to
     show while dragging (guides).
   - the layout is remembered per browser (localStorage), one for wide and
     one for narrow screens; resetLayout() forgets it and puts every window
     back on the default layout (editor settings menu).
   Web addition: the desk resizes far more than a tablet screen (window size,
   the docs rail), so a window the visitor hasn't dragged yet follows the
   default layout on every resize; once dragged, it keeps its pin. */

export interface K3Place {
  x: number
  y: number
  z: number
  folded: boolean
  placed: boolean
  moved: boolean // dragged by the visitor: no longer follows the default layout
  foldSet: boolean // folded/opened by the visitor: the default no longer decides
  w: number | null // set width (layout default or the visitor's); null = its own
  h: number | null
  sized: boolean // resized by the visitor: the default width no longer applies
}

export interface K3Default {
  x: number
  y: number
  folded?: boolean
  w?: number // a default size (until the visitor resizes the window)
  h?: number
}

export type K3Layout = (
  desk: { w: number, h: number },
  sizes: Record<string, { w: number, h: number }>,
) => Record<string, K3Default>

/* Resize stops for a window: width and height move in steps of x / y px from
   where the drag started (one tool cell, one swatch, one layer row), so the
   content inside always lands on a whole cell. `square` keeps the body
   square (the preview). Asked at the start of each resize, so it can measure. */
export interface K3Snap {
  x: number
  y: number
  square?: boolean
  minW?: number // the window's own smallest useful width (default MIN_W)
  autoH?: boolean // height follows the content (it wraps to the width)
}

export type K3SnapFor = (id: string, el: HTMLElement) => K3Snap | null | undefined

export interface K3Guide {
  axis: 'x' | 'y'
  at: number // desk px
}

export interface K3Desk {
  places: Record<string, K3Place>
  guides: Ref<K3Guide[]>
  register: (id: string, el: HTMLElement) => void
  unregister: (id: string) => void
  lift: (id: string) => void
  startDrag: (id: string, e: PointerEvent, onTap?: () => void) => void
  startResize: (id: string, e: PointerEvent) => void
  toggleFold: (id: string) => void
  resetLayout: () => void
}

export const K3_DESK: InjectionKey<K3Desk> = Symbol('k3-desk')

const KEEP = 64 // px of a window that must stay on the desk while dragging
const BAND = 24 // its title band, kept whole
const TAP = 4 // px of travel below which a press on a chip is a tap
const MIN_W = 120
const MIN_H = 64
const SNAP = 8 // px within which a dragged edge snaps to a line
const GAP = 8 // the desk margin, and the gap between windows set side by side
const STORE_KEY = 'k3_windows'
const SAVED_FIELDS = ['x', 'y', 'folded', 'moved', 'foldSet', 'w', 'h', 'sized'] as const

export function provideK3Desk(desk: Ref<HTMLElement | null>, layout: K3Layout, snapFor?: K3SnapFor): K3Desk {
  const places = reactive<Record<string, K3Place>>({})
  const els = new Map<string, HTMLElement>()
  const guides = ref<K3Guide[]>([])
  let top = 1
  let queued = false

  // Remembered layout: one per screen class, so a phone and a desktop
  // don't fight over the same pins.
  const storeKey = () => `${STORE_KEY}_${typeof window !== 'undefined' && window.innerWidth >= 840 ? 'wide' : 'narrow'}`
  function loadSaved(): Record<string, Partial<K3Place>> {
    try {
      const v = JSON.parse(localStorage.getItem(storeKey()) || '{}')
      return v && typeof v === 'object' ? v : {}
    } catch { return {} }
  }
  const saved = typeof window !== 'undefined' ? loadSaved() : {}
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function persist() {
    if (typeof window === 'undefined') return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const out: Record<string, Partial<K3Place>> = {}
      for (const [id, p] of Object.entries(places)) {
        if (!p.placed || !(p.moved || p.sized || p.foldSet)) continue
        const e: Record<string, unknown> = {}
        for (const f of SAVED_FIELDS) e[f] = p[f]
        out[id] = e as Partial<K3Place>
      }
      try { localStorage.setItem(storeKey(), JSON.stringify(out)) } catch { /* private mode */ }
    }, 300)
  }

  const deskSize = () => ({w: desk.value?.clientWidth || 0, h: desk.value?.clientHeight || 0})
  const sizeOf = (id: string) => ({w: els.get(id)?.offsetWidth || 0, h: els.get(id)?.offsetHeight || 0})

  // Placement waits a task so every window has registered and has a size.
  // A task, not a frame: a page opened in a background tab gets no frames
  // and its windows would stay hidden until it is shown. Windows coming or
  // going (the art-brush window follows the stamp tool) reflow the ones the
  // visitor hasn't moved, so they make room / close the gap.
  function schedule() {
    if (queued || typeof window === 'undefined') return
    queued = true
    setTimeout(() => {
      queued = false
      placeNew(true)
    }, 0)
  }

  // Unmoved windows follow the default pin; windows the visitor hasn't
  // folded or opened follow the default fold too. A fold that changes a
  // window's size takes a second pass so the others stack on its new size.
  function placeNew(reflow = false, again = true) {
    const d = deskSize()
    const todo = [...els.keys()].filter(id => !places[id]?.placed || (reflow && !places[id].moved))
    // A desk with no size yet (hidden, not laid out) waits for the
    // ResizeObserver below rather than polling.
    if (!todo.length || !d.w || !d.h) return
    const sizes: Record<string, { w: number, h: number }> = {}
    for (const id of els.keys()) sizes[id] = sizeOf(id)
    const res = layout(d, sizes)
    let refold = false
    for (const id of todo) {
      const r = res[id] || {x: 8, y: 8}
      const p = places[id]
      if (!p.foldSet && p.folded !== !!r.folded) {
        p.folded = !!r.folded
        refold = true
      }
      if (!p.sized && r.w != null && p.w !== Math.round(r.w)) {
        p.w = Math.round(r.w)
        refold = true // its height may follow the width: lay out again
      }
      if (!p.sized && r.h != null && p.h !== Math.round(r.h)) {
        p.h = Math.round(r.h)
        refold = true
      }
      p.x = Math.round(r.x)
      p.y = Math.round(r.y)
      p.placed = true
      clampTight(id)
    }
    if (refold && again) nextTick(() => placeNew(true, false))
  }

  // While dragging: keep KEEP px across and the whole title band.
  function clampLoose(id: string) {
    const p = places[id]
    const d = deskSize()
    const s = sizeOf(id)
    p.x = Math.round(Math.min(Math.max(p.x, KEEP - s.w), d.w - KEEP))
    p.y = Math.round(Math.min(Math.max(p.y, 0), Math.max(0, d.h - BAND)))
  }

  // After a fold/open: the whole window inside the desk.
  function clampTight(id: string) {
    const p = places[id]
    const d = deskSize()
    const s = sizeOf(id)
    p.x = Math.round(Math.max(0, Math.min(p.x, d.w - s.w)))
    p.y = Math.round(Math.max(0, Math.min(p.y, d.h - s.h)))
  }

  function register(id: string, el: HTMLElement) {
    els.set(id, el)
    if (!places[id]) {
      places[id] = {x: 0, y: 0, z: top++, folded: false, placed: false, moved: false, foldSet: false, w: null, h: null, sized: false}
      // A remembered window comes back where the visitor left it (the
      // default layout still decides whatever they never touched).
      const s = saved[id]
      if (s) {
        const p = places[id]
        for (const f of SAVED_FIELDS) if (s[f] !== undefined) (p as any)[f] = s[f]
        if (p.moved) p.placed = true
      }
    }
    schedule()
  }

  function unregister(id: string) {
    els.delete(id)
    schedule()
  }

  function lift(id: string) {
    const p = places[id]
    if (p && p.z !== top - 1) p.z = top++
  }

  function startDrag(id: string, e: PointerEvent, onTap?: () => void) {
    const p = places[id]
    if (!p || e.button > 0) return
    const target = e.target as HTMLElement
    // Controls in a title band keep their own click.
    if (!onTap && target.closest('button, a, input, select, textarea, .dropdown')) return
    e.preventDefault()
    lift(id)
    const sx = e.clientX
    const sy = e.clientY
    const ox = p.x
    const oy = p.y
    // Sizes are read once: reading them on every move, right after writing
    // the pin, forced a layout per pointer event.
    const d = deskSize()
    const s = sizeOf(id)
    // Lines to snap to, from the desk margins and every other open window:
    // for each axis, where this window's near edge may sit (a) and where its
    // far edge may sit (b), each with the line to draw when it snaps there.
    const xs: { at: number, line: number }[] = [{at: GAP, line: GAP}, {at: d.w - GAP - s.w, line: d.w - GAP}]
    const ys: { at: number, line: number }[] = [{at: GAP, line: GAP}, {at: d.h - GAP - s.h, line: d.h - GAP}]
    for (const [oid, q] of Object.entries(places)) {
      if (oid === id || !q.placed || !els.has(oid)) continue
      const o = sizeOf(oid)
      if (!o.w || !o.h) continue
      xs.push(
        {at: q.x, line: q.x}, // left edges lined up
        {at: q.x + o.w - s.w, line: q.x + o.w}, // right edges lined up
        {at: q.x + o.w + GAP, line: q.x + o.w + GAP}, // to its right
        {at: q.x - GAP - s.w, line: q.x - GAP}, // to its left
      )
      ys.push(
        {at: q.y, line: q.y},
        {at: q.y + o.h - s.h, line: q.y + o.h},
        {at: q.y + o.h + GAP, line: q.y + o.h + GAP},
        {at: q.y - GAP - s.h, line: q.y - GAP},
      )
    }
    const snap = (v: number, opts: { at: number, line: number }[]) => {
      let best: { at: number, line: number } | null = null
      for (const o of opts) if (Math.abs(o.at - v) <= SNAP && (!best || Math.abs(o.at - v) < Math.abs(best.at - v))) best = o
      return best
    }
    let moved = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (!moved && Math.hypot(dx, dy) < TAP) return
      moved = true
      p.moved = true
      let nx = ox + dx
      let ny = oy + dy
      const g: K3Guide[] = []
      // Alt drags freely, no snapping.
      if (!ev.altKey) {
        const bx = snap(nx, xs)
        const by = snap(ny, ys)
        if (bx) { nx = bx.at; g.push({axis: 'x', at: bx.line}) }
        if (by) { ny = by.at; g.push({axis: 'y', at: by.line}) }
      }
      guides.value = g
      p.x = Math.round(Math.min(Math.max(nx, KEEP - s.w), d.w - KEEP))
      p.y = Math.round(Math.min(Math.max(ny, 0), Math.max(0, d.h - BAND)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      guides.value = []
      if (moved) persist()
      if (!moved && onTap) onTap()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // Drag the corner grip: width and height follow the pointer in the
  // window's steps, never below a usable minimum and never past the desk's
  // right or bottom edge.
  function startResize(id: string, e: PointerEvent) {
    const p = places[id]
    const el = els.get(id)
    if (!p || !el || e.button > 0) return
    e.preventDefault()
    e.stopPropagation()
    lift(id)
    p.sized = true
    const sx = e.clientX
    const sy = e.clientY
    const ow = el.offsetWidth
    const oh = el.offsetHeight
    const snap = snapFor?.(id, el) || {x: 1, y: 1}
    const sxs = Math.max(1, snap.x)
    const sys = Math.max(1, snap.y)
    // Whole steps from the start size, kept inside [lo, hi].
    const fit = (o: number, delta: number, step: number, lo: number, hi: number) => {
      let n = Math.round(delta / step)
      while (o + n * step < lo) n++
      while (n > 0 && o + n * step > hi) n--
      return o + n * step
    }
    const d = deskSize()
    const move = (ev: PointerEvent) => {
      p.w = Math.round(fit(ow, ev.clientX - sx, sxs, snap.minW ?? MIN_W, d.w - p.x))
      p.h = snap.autoH
        ? null
        : snap.square
        ? Math.round(p.w + (oh - ow))
        : Math.round(fit(oh, ev.clientY - sy, sys, MIN_H, d.h - p.y))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      persist()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // Forget every drag, resize and fold: back to the default layout.
  function resetLayout() {
    for (const id of els.keys()) {
      Object.assign(places[id], {moved: false, sized: false, foldSet: false, w: null, h: null})
    }
    try { localStorage.removeItem(storeKey()) } catch { /* private mode */ }
    nextTick(() => placeNew(true))
  }

  function toggleFold(id: string) {
    const p = places[id]
    if (!p) return
    p.folded = !p.folded
    p.foldSet = true
    lift(id)
    persist()
    nextTick(() => {
      clampTight(id)
      els.get(id)?.animate?.(
        [{transform: 'scale(0.85)', opacity: 0}, {transform: 'scale(1)', opacity: 1}],
        {duration: 140, easing: 'ease-out'},
      )
    })
  }

  // The desk shrinking (window resize, docs rail dragged wider) never strands
  // a window off its edge.
  let ro: ResizeObserver | null = null
  onMounted(() => {
    if (typeof ResizeObserver === 'undefined' || !desk.value) return
    ro = new ResizeObserver(() => {
      placeNew(true)
      for (const id of els.keys()) if (places[id]?.moved) clampLoose(id)
    })
    ro.observe(desk.value)
  })
  onBeforeUnmount(() => ro?.disconnect())

  const api: K3Desk = {places, guides, register, unregister, lift, startDrag, startResize, toggleFold, resetLayout}
  provide(K3_DESK, api)
  return api
}
