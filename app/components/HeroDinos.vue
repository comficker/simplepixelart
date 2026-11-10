<script setup lang="ts">
/* Four dinosaurs wandering along the bottom of a page hero. They walk,
   sneak and stop on their own, and duck under the hero's buttons when they
   pass beneath them; a touch (or hover) makes one stand idle for a moment. Sprites: "Dino Characters" by Arks (@ArksDigital), CC BY 4.0,
   one 24x24 strip per dino in /images/dinos/. Client-only, no requests
   beyond the four small sheets. */

const FRAME = 24
const SCALE = 2
const FPS = 10
const SIZE = FRAME * SCALE

// Frame ranges in each strip.
const ANIM = {
  idle: [0, 4],
  move: [4, 10],
  crouch: [17, 18],
  sneak: [18, 24],
} as const
type Anim = keyof typeof ANIM
type State = 'idle' | 'move' | 'sneak'
// Blank rows under the feet in each 24px frame: the lane sits this much
// below the hero's edge so they walk on it.
const FEET_GAP = 3 * SCALE

interface Dino {
  name: string
  x: number
  dir: 1 | -1
  state: State
  frame: number
  until: number // when the current state ends (ms)
  held: boolean // touched: idle until let go
  shown: Anim // what is drawn: the state, or ducked under the buttons
}

const NAMES = ['doux', 'mort', 'tard', 'vita']
const SPEED: Record<State, number> = {idle: 0, move: 34, sneak: 16} // px/s

const lane = ref<HTMLElement | null>(null)
let buttons: HTMLElement | null = null
const dinos = ref<Dino[]>([])

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}

function pick(d: Dino, now: number) {
  const r = Math.random()
  d.state = r < 0.55 ? 'move' : r < 0.75 ? 'sneak' : 'idle'
  d.frame = 0
  d.until = now + (d.state === 'idle' ? rand(1500, 3500) : rand(2500, 6000))
  if (d.state !== 'idle' && Math.random() < 0.3) d.dir = (d.dir * -1) as 1 | -1
}

function style(d: Dino) {
  const i = ANIM[d.shown][0] + d.frame
  return {
    transform: `translateX(${Math.round(d.x)}px) scaleX(${d.dir})`,
    backgroundImage: `url(/images/dinos/${d.name}.png)`,
    backgroundPosition: `${-i * SIZE}px 0`,
  }
}

function hold(d: Dino, on: boolean) {
  d.held = on
  d.frame = 0
  if (!on) d.until = performance.now() + rand(800, 1600)
}

// A tap holds it for a moment; there is no "leave" on a touch screen.
function tap(d: Dino) {
  hold(d, true)
  setTimeout(() => hold(d, false), 2000)
}

let raf = 0
let last = 0
let tick = 0

// The buttons' span across the lane, when they come down low enough to
// meet a standing dino; null when they are clear of it.
function buttonSpan(): [number, number] | null {
  const l = lane.value?.getBoundingClientRect()
  const b = buttons?.getBoundingClientRect()
  if (!l || !b || b.bottom <= l.bottom - SIZE + FEET_GAP) return null
  return [b.left - l.left, b.right - l.left]
}

function loop(now: number) {
  const w = lane.value?.clientWidth || 0
  const span = buttonSpan()
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  tick += dt
  const step = tick >= 1 / FPS
  if (step) tick = 0
  for (const d of dinos.value) {
    const st: State = d.held ? 'idle' : d.state
    const under = !!span && d.x + SIZE > span[0] && d.x < span[1]
    const shown: Anim = under ? (st === 'idle' ? 'crouch' : 'sneak') : st
    if (shown !== d.shown) { d.shown = shown; d.frame = 0 }
    if (step) {
      const [a, b] = ANIM[shown]
      d.frame = (d.frame + 1) % (b - a)
    }
    if (d.held) continue
    d.x += SPEED[shown === 'sneak' ? 'sneak' : st] * dt * d.dir
    if (d.x < 0) { d.x = 0; d.dir = 1 }
    if (d.x > w - SIZE) { d.x = Math.max(0, w - SIZE); d.dir = -1 }
    if (now > d.until) pick(d, now)
  }
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  const w = lane.value?.clientWidth || 600
  const now = performance.now()
  buttons = lane.value?.parentElement?.querySelector('.page-hero-cta') || null
  dinos.value = NAMES.map((name, i) => {
    const d: Dino = {name, x: ((i + 0.5) / NAMES.length) * (w - SIZE), dir: i % 2 ? -1 : 1, state: 'idle', frame: 0, until: 0, held: false, shown: 'idle'}
    pick(d, now)
    return d
  })
  // Reduced motion: they stand still, nothing animates.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const d of dinos.value) d.state = 'idle'
    return
  }
  last = now
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div ref="lane" class="hero-dinos" aria-hidden="true">
    <span
        v-for="d in dinos"
        :key="d.name"
        class="hero-dino"
        :style="style(d)"
        @pointerenter="hold(d, true)"
        @pointerleave="hold(d, false)"
        @touchstart.passive="tap(d)"
    />
    <NuxtLinkLocale to="/collections/arks-dino-characters" class="hero-dinos-credit" tabindex="-1">
      Dinos by Arks · CC BY 4.0
    </NuxtLinkLocale>
  </div>
</template>

<style scoped>
/* A lane along the hero's bottom edge, over the copy: the dinos walk in
   front of the buttons. Only the dinos and the credit take the pointer. */
.hero-dinos {
  position: absolute;
  right: 0;
  bottom: -6px; /* FEET_GAP: feet on the hero's edge */
  left: 0;
  height: 48px;
  pointer-events: none;
  z-index: 2;
}

.hero-dino {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 48px;
  height: 48px;
  background-repeat: no-repeat;
  background-size: auto 48px;
  image-rendering: pixelated;
  pointer-events: auto;
  cursor: pointer;
  will-change: transform;
}

.hero-dinos-credit {
  position: absolute;
  right: var(--space-2);
  bottom: var(--space-1);
  font-size: var(--text-2xs);
  color: var(--muted);
  pointer-events: auto;
}
</style>
