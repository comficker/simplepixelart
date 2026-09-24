<script setup lang="ts">
const props = defineProps<{
  width: number
  height: number
  mapNumbers: { [key: string]: number }
  colors: string[]
  /** Side of one pixel on screen. Everything else is derived from it. */
  cell: number
  /** Draw each pixel as a ring with a hole, the way a fuse bead looks. */
  bead?: boolean
  /** Write "x,y" inside every cell of the board, empty ones included. */
  coords?: boolean
}>()

const canvas = ref<HTMLCanvasElement | null>(null)

/** Hex to the luminance of its colour, so a label can pick a side to contrast with. */
function isDark(hex: string): boolean {
  const h = hex.replace('#', '')
  const n = h.length === 3
      ? [h[0]! + h[0], h[1]! + h[1], h[2]! + h[2]]
      : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)]
  const [r, g, b] = n.map(v => parseInt(v, 16) || 0)
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) < 140
}

function draw() {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx) return

  const {width, height, cell, colors, mapNumbers} = props
  // Cap the ratio: a 64x64 board at 48px a cell is already 3072px, and doubling
  // that again buys nothing a phone can show.
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = width * cell, h = height * cell
  el.width = Math.round(w * dpr)
  el.height = Math.round(h * dpr)
  el.style.width = `${w}px`
  el.style.height = `${h}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  // The widest label on a board is its bottom-right corner, so that is what has
  // to fit: "9,9" on a tiny one, "127,127" on a big one. Sizing off a fixed
  // ratio instead left the long ones spilling over their cell.
  const longest = `${width - 1},${height - 1}`.length
  const font = Math.min(
      Math.floor(cell * 0.86 / (longest * 0.6)),
      Math.floor(cell * 0.4),
  )
  const labels = !!props.coords && font >= 6

  if (props.coords) {
    ctx.strokeStyle = 'rgba(128,128,128,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= width; x++) { ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, h) }
    for (let y = 0; y <= height; y++) { ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(w, y * cell + 0.5) }
    ctx.stroke()
  }

  const r = cell / 2 * 0.94
  const hole = r * 0.32

  for (const [key, index] of Object.entries(mapNumbers)) {
    const sep = key.indexOf('_')
    const x = +key.slice(0, sep)
    const y = +key.slice(sep + 1)
    const color = colors[index] ?? '#000000'
    ctx.fillStyle = color
    if (props.bead) {
      const cx = x * cell + cell / 2, cy = y * cell + cell / 2
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      // The hole and the label want the same middle of the cell, and the label
      // wins: read over a hole showing the page behind it, the digits were
      // unreadable. With labels off the bead keeps its hole.
      if (!labels) ctx.arc(cx, cy, hole, 0, Math.PI * 2, true)
      ctx.fill()
    } else {
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }

  if (!labels) return
  ctx.font = `${font}px ui-monospace, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let y = 0; y < props.height; y++) {
    for (let x = 0; x < props.width; x++) {
      const index = mapNumbers[`${x}_${y}`]
      const filled = index !== undefined && index !== -1
      ctx.fillStyle = filled && isDark(colors[index!] ?? '#000000')
          ? 'rgba(255,255,255,0.92)'
          : filled ? 'rgba(0,0,0,0.75)' : 'rgba(128,128,128,0.8)'
      ctx.fillText(`${x},${y}`, x * cell + cell / 2, y * cell + cell / 2)
    }
  }
}

watch(() => [props.width, props.height, props.cell, props.bead, props.coords, props.mapNumbers, props.colors],
    () => nextTick(draw), {deep: false})
onMounted(draw)
</script>

<template>
  <canvas ref="canvas" class="art-pixel-canvas"/>
</template>

<style scoped>
.art-pixel-canvas {
  display: block;
  flex: none;
  image-rendering: pixelated;
}
</style>
