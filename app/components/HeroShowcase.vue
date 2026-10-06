<script setup lang="ts">
import {tileImageUrl} from "~/helper/tilemap";

/* Community pieces staff picked, shown in a page hero one at a time with
   their maker. Renders nothing until something is picked, and the hero
   keeps its own scene. `preview` shows one piece, unfetched and inert --
   the admin's framing editor. */
interface Featured {
  id_string: string
  name: string
  width: number
  height: number
  username: string | null
  avatar: string | null
  // Height against the hero's (1 = full), and x/y as background-position
  // percentages (100/100 = flush right and bottom).
  view?: { scale: number, x: number, y: number }
}

const props = defineProps<{ preview?: Featured | null }>()

const apiBase = useRuntimeConfig().public.api as string
const fetched = props.preview ? null : await useAuthFetch<Featured[]>('/coloring/featured/', {
  key: 'hero-featured',
  transform: (s: any) => s?.results || [],
  default: () => [],
})
const items = computed<Featured[]>(() => props.preview ? [props.preview] : fetched?.data.value || [])

const INTERVAL = 7000

// Opens on a different piece each day. The day comes from the server (via
// the payload), so a page rendered just before midnight UTC and hydrated
// just after still opens on the same piece.
const day = useState('hero-featured-day', () => Math.floor(Date.now() / 86400000))
const index = ref(items.value.length ? day.value % items.value.length : 0)
const current = computed(() => items.value[index.value] || null)
const paused = ref(false)

const src = (a: Featured) => tileImageUrl(apiBase, a.id_string)

function frame(a: Featured) {
  const v = a.view
  return {'--s': v?.scale ?? 1, '--x': `${v?.x ?? 100}%`, '--y': `${v?.y ?? 100}%`}
}

function preloadNext() {
  const next = items.value[(index.value + 1) % items.value.length]
  if (next) new Image().src = src(next)
}

let timer: ReturnType<typeof setInterval> | undefined
let autoplay = false

function start() {
  clearInterval(timer)
  if (!autoplay) return
  timer = setInterval(() => {
    if (paused.value || document.hidden) return
    index.value = (index.value + 1) % items.value.length
    preloadNext()
  }, INTERVAL)
}

// A dot jumps there and gives that piece a full turn before moving on.
function go(i: number) {
  index.value = i
  preloadNext()
  start()
}

onMounted(() => {
  if (items.value.length < 2) return
  // Reduced motion: the dots still work, nothing moves on its own.
  autoplay = !matchMedia('(prefers-reduced-motion: reduce)').matches
  preloadNext()
  start()
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <!-- Layers over the whole hero, bottom to top: the piece blurred to a
       wash of its own colours, the piece itself in its frame (full height,
       flush right unless staff framed it otherwise), the hero's wash over
       the copy, then the maker and the dots. -->
  <div
      v-if="current"
      class="hero-show"
      :class="{'is-preview': preview}"
      @mouseenter="paused = true"
      @mouseleave="paused = false"
      @focusin="paused = true"
      @focusout="paused = false"
  >
    <div class="hero-show-blur" aria-hidden="true">
      <Transition name="hero-fade">
        <img :key="current.id_string" :src="src(current)" alt="">
      </Transition>
    </div>

    <div class="hero-show-frame">
      <Transition name="hero-fade">
        <NuxtLinkLocale :key="current.id_string" :to="`/art/${current.id_string}`" class="hero-show-art" :style="frame(current)">
          <img :src="src(current)" :alt="current.name" :width="current.width" :height="current.height">
        </NuxtLinkLocale>
      </Transition>
    </div>

    <div class="hero-show-wash" aria-hidden="true"/>

    <Transition name="hero-fade">
      <NuxtLinkLocale
          v-if="current.username"
          :key="current.id_string"
          :to="`/creator/${current.username}`"
          class="rank-avatar hero-show-by"
          :aria-label="`@${current.username}`"
      >
        <img v-if="current.avatar" :src="current.avatar" alt="" loading="lazy">
        <span v-else>{{ current.username.slice(0, 1).toUpperCase() }}</span>
      </NuxtLinkLocale>
    </Transition>

    <div v-if="items.length > 1" class="hero-show-dots">
      <button
          v-for="(a, i) in items"
          :key="a.id_string"
          type="button"
          class="hero-show-dot"
          :aria-label="a.name"
          :aria-current="i === index"
          @click="go(i)"
      />
    </div>
  </div>
</template>

<style scoped>
/* Covers the hero (the positioned box) under its copy. Clicks pass
   through except on the piece, the avatar and the dots. --hero-art-h is the
   frame a piece is placed in: the band below the buttons in one column, the
   hero's full height beside the copy. */
.hero-show {
  --hero-avatar: calc(var(--space-6) + var(--space-2));
  --hero-art-h: calc(var(--space-6) * 9);
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.hero-show-blur {
  position: absolute;
  inset: calc(var(--space-6) * -2);
  opacity: 0.5;
}

.hero-show-blur img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(calc(var(--space-6) * 1.5)) saturate(1.3);
}

/* The same framing reads the same in both layouts because it is relative
   to this box, not to the hero: scale 1 fills its height, and x/y place the
   piece the way background-position places an image (x% across, minus x%
   of the piece). Not clipped itself; the hero clips. */
.hero-show-frame {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: var(--hero-art-h);
}

/* Default frame: flush right and bottom, like the scene it replaces. */
.hero-show-art {
  position: absolute;
  left: var(--x);
  top: var(--y);
  height: calc(100% * var(--s));
  transform: translate(calc(var(--x) * -1), calc(var(--y) * -1));
  pointer-events: auto;
}

.is-preview .hero-show-art,
.is-preview .hero-show-by {
  pointer-events: none;
}

.hero-show-art img {
  display: block;
  width: auto;
  max-width: none;
  height: 100%;
  image-rendering: pixelated;
}

@media (min-width: 1100px) {
  .hero-show {
    --hero-art-h: 100%;
  }
}

.hero-show-wash {
  position: absolute;
  inset: 0;
  background: var(--hero-wash);
}

/* The maker's avatar alone, in the bottom-right corner. No hover state:
   this outranks the site-wide a:hover colour, which would sink the initial
   into the fill. */
.hero-show-by {
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-4);
  width: var(--hero-avatar);
  height: var(--hero-avatar);
  font-size: var(--text-xs);
  color: var(--primary-foreground);
  pointer-events: auto;
}

/* Beside the avatar, on its centre line, on a light pill so they read over
   any piece. Each dot is a small mark in a larger hit area. */
.hero-show-dots {
  position: absolute;
  right: calc(var(--space-4) + var(--hero-avatar) + var(--space-2));
  bottom: calc(var(--space-4) + (var(--hero-avatar) - var(--space-5)) / 2);
  display: flex;
  padding: 0 var(--space-1);
  background: color-mix(in oklab, var(--surface) 75%, transparent);
  border-radius: var(--radius-pill);
  pointer-events: auto;
}

.hero-show-dot {
  display: grid;
  place-items: center;
  width: var(--space-5);
  height: var(--space-5);
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.hero-show-dot::before {
  content: "";
  width: var(--space-2);
  height: var(--space-2);
  border-radius: var(--radius-pill);
  background: color-mix(in oklab, var(--foreground) 35%, transparent);
  transition: background var(--transition);
}

.hero-show-dot[aria-current="true"]::before {
  background: var(--foreground);
}

@media (hover: hover) and (pointer: fine) {
  .hero-show-dot:hover::before {
    background: color-mix(in oklab, var(--foreground) 70%, transparent);
  }
}

.hero-fade-enter-active,
.hero-fade-leave-active {
  transition: opacity 900ms ease;
}

.hero-fade-enter-from,
.hero-fade-leave-to {
  opacity: 0;
}
</style>
