<script setup lang="ts">
// Terrain set up the way Godot and Tiled do it: on each tile, click the
// sides where it joins the same terrain. The tile's place in the terrain
// (its wang/blob mask) follows from what is marked, so there is no grid of
// numbered slots to match tiles against.
import {
  MASK_E, MASK_N, MASK_NE, MASK_NW, MASK_S, MASK_SE, MASK_SW, MASK_W,
  canonicalBlobMask, type TerrainType,
} from '~/helper/autotile'

const props = defineProps<{
  tiles: { id: number, src: string }[]
  map: Record<string, number>
  type: TerrainType
  iso: boolean
  /** cell height / width: the shape of the tile's top face. */
  ratio: number
}>()
const emit = defineEmits<{ apply: [map: Record<string, number>], close: [] }>()

const blob = computed(() => props.type === 'blob47')

// Tile id -> its mask in this terrain, or null when it is not part of it.
// A tile can stand in more than one slot (a set short of pieces reuses the
// nearest one); it is marked as the slot it was drawn for -- the one with
// the most joined sides, the others being stand-ins.
const masks = ref<Record<number, number | null>>({})
const bits = (m: number) => { let n = 0; for (let x = m; x; x &= x - 1) n++; return n }
for (const [m, id] of Object.entries(props.map || {})) {
  const cur = masks.value[Number(id)]
  if (cur == null || bits(Number(m)) > bits(cur)) masks.value[Number(id)] = Number(m)
}

const onlyTerrain = ref(Object.keys(props.map || {}).length > 0)
const shown = computed(() => {
  const inT = props.tiles.filter(t => masks.value[t.id] != null)
  const rest = props.tiles.filter(t => masks.value[t.id] == null)
  return onlyTerrain.value ? inT : [...inT, ...rest]
})

// Where the tile's face sits in its picture: the drawn part, found once from
// its pixels, so the marks land on the tile and not on its empty margin.
const boxes = ref<Record<number, { iw: number, ih: number, x: number, y: number, w: number, h: number }>>({})
function measure(id: number, e: Event) {
  const img = e.target as HTMLImageElement
  const iw = img.naturalWidth, ih = img.naturalHeight
  let box = {iw, ih, x: 0, y: 0, w: iw, h: ih}
  try {
    // Read at most 64px a side: a big tile's every pixel is not needed to
    // find where it is drawn, and a large set measured them all.
    const k = Math.min(1, 64 / Math.max(iw, ih))
    const w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k))
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d', {willReadFrequently: true})!
    g.drawImage(img, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data
    let x0 = w, y0 = h, x1 = -1, y1 = -1
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3]! < 128) continue
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
    if (x1 >= x0) box = {iw, ih, x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k}
  } catch { /* a picture we may not read: mark over the whole of it */ }
  boxes.value[id] = box
}

type P = [number, number]
interface Shape { c: P, a: P, b: P, d: P, l: P }   // centre, top-ish, right, bottom, left
function shapeOf(id: number): Shape | null {
  const b = boxes.value[id]
  if (!b) return null
  if (props.iso) {
    // The top face: a diamond as wide as the tile, at the cell's slope.
    const hw = b.w / 2, hh = (b.w * props.ratio) / 2
    const cx = b.x + hw, top = b.y
    return {c: [cx, top + hh], a: [cx, top], b: [cx + hw, top + hh], d: [cx, top + hh * 2], l: [cx - hw, top + hh]}
  }
  return {c: [b.x + b.w / 2, b.y + b.h / 2], a: [b.x, b.y], b: [b.x + b.w, b.y], d: [b.x + b.w, b.y + b.h], l: [b.x, b.y + b.h]}
}

const pts = (...p: P[]) => p.map(q => q.join(',')).join(' ')
const mid = (p: P, q: P, k = 0.5): P => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]

/** The four side regions of a tile, each a triangle from its centre. On an
 *  iso tile the shape's points are the diamond's, so N is its top-right
 *  edge, E bottom-right, S bottom-left, W top-left. */
function sides(s: Shape) {
  return [
    {bit: MASK_N, poly: pts(s.c, s.a, s.b)},
    {bit: MASK_E, poly: pts(s.c, s.b, s.d)},
    {bit: MASK_S, poly: pts(s.c, s.d, s.l)},
    {bit: MASK_W, poly: pts(s.c, s.l, s.a)},
  ]
}

/** Blob sets also mark corners: the points where two sides meet. */
function corners(s: Shape) {
  const r = Math.max(1.2, Math.abs(s.b[0] - s.l[0]) * 0.07)
  const at = [{bit: MASK_NE, p: s.b}, {bit: MASK_SE, p: s.d}, {bit: MASK_SW, p: s.l}, {bit: MASK_NW, p: s.a}]
  return at.map(x => ({...x, p: mid(x.p, s.c, 0.18), r}))
}

function core(s: Shape) {
  return pts(mid(s.c, s.a, 0.35), mid(s.c, s.b, 0.35), mid(s.c, s.d, 0.35), mid(s.c, s.l, 0.35))
}

function toggleBit(id: number, bit: number) {
  const m = masks.value[id]
  masks.value[id] = m == null ? bit : (m ^ bit)
}

function toggleIn(id: number) {
  masks.value[id] = masks.value[id] == null ? 0 : null
}

const has = (id: number, bit: number) => ((masks.value[id] ?? 0) & bit) !== 0
const slotOf = (id: number) => {
  const m = masks.value[id]
  return m == null ? null : blob.value ? canonicalBlobMask(m) : (m & 15)
}

// Two tiles marked the same way want one slot: say so on both.
const clash = computed(() => {
  const seen = new Map<number, number>()
  for (const t of props.tiles) {
    const s = slotOf(t.id)
    if (s != null) seen.set(s, (seen.get(s) || 0) + 1)
  }
  return seen
})
const slotCount = computed(() => {
  const n = new Set(clash.value.keys())
  for (const [m, id] of Object.entries(props.map || {})) if (masks.value[Number(id)] != null) n.add(Number(m))
  return n.size
})

function apply() {
  const out: Record<string, number> = {}
  for (const t of props.tiles) {
    const s = slotOf(t.id)
    if (s != null) out[String(s)] = t.id
  }
  // Stand-ins stay: a slot no marked tile claims keeps the tile it had, as
  // long as that tile is still in the terrain.
  for (const [m, id] of Object.entries(props.map || {})) {
    if (out[m] == null && masks.value[Number(id)] != null) out[m] = Number(id)
  }
  emit('apply', out)
}
</script>

<template>
  <div class="tp">
    <p class="tp-help text-xs text-muted">
      {{ $t('c_TerrainPainter.help') }}
    </p>
    <div class="tp-bar">
      <label class="tp-only">
        <input v-model="onlyTerrain" type="checkbox">
        <span>{{ $t('c_TerrainPainter.onlyTerrain') }}</span>
      </label>
      <span class="text-xs text-muted">{{ $t('c_TerrainPainter.slotsFilled', {n: slotCount, total: blob ? 47 : 16}) }}</span>
    </div>
    <div class="tp-grid">
      <div v-for="t in shown" :key="t.id" class="tp-card" :class="{in: masks[t.id] != null, clash: (clash.get(slotOf(t.id) ?? -1) || 0) > 1}">
        <img :src="t.src" alt="" crossorigin="anonymous" loading="lazy" @load="measure(t.id, $event)">
        <svg
            v-if="boxes[t.id] && shapeOf(t.id)"
            class="tp-over"
            :viewBox="`0 0 ${boxes[t.id]!.iw} ${boxes[t.id]!.ih}`"
            preserveAspectRatio="xMidYMid meet"
        >
          <polygon
              v-for="sd in sides(shapeOf(t.id)!)"
              :key="sd.bit"
              :points="sd.poly"
              class="tp-side"
              :class="{on: has(t.id, sd.bit)}"
              @click="toggleBit(t.id, sd.bit)"
          />
          <template v-if="blob">
            <circle
                v-for="cn in corners(shapeOf(t.id)!)"
                :key="cn.bit"
                :cx="cn.p[0]" :cy="cn.p[1]" :r="cn.r"
                class="tp-corner"
                :class="{on: has(t.id, cn.bit)}"
                @click="toggleBit(t.id, cn.bit)"
            />
          </template>
          <polygon :points="core(shapeOf(t.id)!)" class="tp-core" :class="{on: masks[t.id] != null}" @click="toggleIn(t.id)"/>
        </svg>
      </div>
    </div>
    <div class="publish-actions">
      <button type="button" class="btn block" @click="emit('close')">{{ $t('common.cancel') }}</button>
      <button type="button" class="btn primary block" @click="apply">{{ $t('c_TerrainPainter.apply') }}</button>
    </div>
  </div>
</template>

<style scoped>
.tp {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tp-help {
  margin: 0;
}

.tp-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.tp-only {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
}

.tp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-6) * 6), 1fr));
  gap: var(--space-2);
  max-height: 60vh;
  overflow-y: auto;
}

.tp-card {
  position: relative;
  aspect-ratio: 1;
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.tp-card.in {
  border-color: color-mix(in oklab, var(--primary) 50%, var(--border));
}

.tp-card.clash {
  border-color: var(--danger);
}

.tp-card img,
.tp-over {
  position: absolute;
  inset: var(--space-2);
  width: calc(100% - var(--space-2) * 2);
  height: calc(100% - var(--space-2) * 2);
}

.tp-card img {
  object-fit: contain;
  image-rendering: pixelated;
}

.tp-side {
  fill: transparent;
  stroke: color-mix(in oklab, var(--foreground) 35%, transparent);
  stroke-width: 0.4;
  cursor: pointer;
}

.tp-side.on {
  fill: color-mix(in oklab, var(--primary) 40%, transparent);
}

.tp-corner {
  fill: color-mix(in oklab, var(--foreground) 25%, transparent);
  cursor: pointer;
}

.tp-corner.on {
  fill: var(--primary);
}

.tp-core {
  fill: color-mix(in oklab, var(--foreground) 15%, transparent);
  stroke: color-mix(in oklab, var(--foreground) 50%, transparent);
  stroke-width: 0.4;
  cursor: pointer;
}

.tp-core.on {
  fill: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .tp-side:hover { fill: color-mix(in oklab, var(--primary) 30%, transparent); }
  .tp-side.on:hover { fill: color-mix(in oklab, var(--primary) 70%, transparent); }
}
</style>
