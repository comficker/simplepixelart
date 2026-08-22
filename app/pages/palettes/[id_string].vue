<script setup lang="ts">
import {toast} from "vue-sonner";
import {hexToRgb, rgbToHsl} from "~/helper/color";
import type {Palette, ResponseSharedPage} from "~/types";

const route = useRoute()
const config = useRuntimeConfig()
const idString = computed(() => route.params.id_string?.toString())

const {data: palette} = await useAuthFetch<Palette>(
    `/coloring/palettes/${idString.value}/`,
    {key: computed(() => `palette-${idString.value}`)},
)

if (!palette.value) {
  throw createError({statusCode: 404, statusMessage: 'Palette not found', fatal: true})
}

const pid = palette.value.id
const {data: extra} = await useAsyncData(`palette-extra-${pid}`, () => Promise.all([
  useNativeFetch<ResponseSharedPage>(`/coloring/shared-pages/`, {
    query: {palette: pid, status: 'public', template__isnull: true, page_size: 12},
  }).catch(() => null),
  useNativeFetch<Palette[]>(`/coloring/palettes/${pid}/related/`).catch(() => []),
]))

const colors = computed(() => palette.value?.colors || [])
const usedResults = computed(() => extra.value?.[0]?.results || [])
const usedCount = computed(() => extra.value?.[0]?.count || 0)
const relatedList = computed(() => extra.value?.[1] || [])

const liked = ref(!!palette.value?.is_liked)
const likeCount = ref(palette.value?.like_count || 0)
const liking = ref(false)

async function toggleLike() {
  if (liking.value || liked.value) return
  liking.value = true
  try {
    const res = await useNativeFetch<{ liked: boolean; counted: boolean; like_count: number }>(
        `/coloring/palettes/${palette.value!.id}/like/`, {method: 'POST'})
    liked.value = res.liked
    likeCount.value = res.like_count
    if (res.counted) toast.success('Thanks for the love!')
  } catch {
    toast.error('Could not heart this palette')
  } finally {
    liking.value = false
  }
}

const DL_FORMATS = [
  {ext: 'hex', label: 'Hex (.hex)'},
  {ext: 'gpl', label: 'GIMP (.gpl)'},
  {ext: 'png', label: 'PNG strip'},
  {ext: 'json', label: 'JSON'},
] as const

function dl(ext: string) {
  return `${config.public.api}/coloring/palettes/${palette.value!.id}/download/?ext=${ext}`
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${label}`)
  } catch {
    toast.error('Copy failed')
  }
}

const copyAll = () => copy(colors.value.join('\n'), `${colors.value.length} colors`)

const insights = computed(() => {
  const cs = colors.value
  if (cs.length < 2) return null
  let r = 0, g = 0, b = 0, sSum = 0, warm = 0, cool = 0
  let dom = {score: -2, hex: cs[0]!}
  let dark = {lum: 1e9, hex: cs[0]!}, light = {lum: -1, hex: cs[0]!}
  for (const hex of cs) {
    const [R, G, B] = hexToRgb(hex)
    r += R; g += G; b += B
    const {h, s, l} = rgbToHsl(R, G, B)
    sSum += s
    if (s > 0.12) {
      if (h < 75 || h >= 300) warm++
      else if (h >= 140 && h <= 270) cool++
    }
    const score = s - Math.abs(l - 0.5) * 0.5
    if (score > dom.score) dom = {score, hex}
    const lum = 0.299 * R + 0.587 * G + 0.114 * B
    if (lum < dark.lum) dark = {lum, hex}
    if (lum > light.lum) light = {lum, hex}
  }
  const n = cs.length
  const avgLum = (0.299 * r + 0.587 * g + 0.114 * b) / n
  const avgS = sSum / n
  const tone = warm > cool * 1.25 ? 'Warm' : cool > warm * 1.25 ? 'Cool' : 'Neutral'
  const brightness = avgLum < 90 ? 'Dark' : avgLum > 175 ? 'Light' : 'Balanced'
  const saturation = avgS < 0.12 ? 'Grayscale'
      : avgS > 0.55 ? 'Vivid'
      : (avgS > 0.3 && avgLum > 150 ? 'Pastel' : 'Muted')
  return {
    dominant: dom.hex.toUpperCase(),
    tone, brightness, saturation,
    darkest: dark.hex.toUpperCase(),
    lightest: light.hex.toUpperCase(),
  }
})

const creator = computed(() => palette.value?.user?.username || '')

useCustomSeoMeta({
  title: computed(() => {
    const by = creator.value ? ` by ${creator.value}` : ''
    return `${palette.value?.name || 'Pixel Art'} Color Palette${by} — ${palette.value?.color_count} Colors & Hex Codes`
  }),
  description: computed(() => {
    const by = creator.value ? ` by ${creator.value}` : ''
    const tone = insights.value ? `${insights.value.tone.toLowerCase()} ` : ''
    return `${palette.value?.name} is a ${tone}${palette.value?.color_count}-color pixel art palette${by}. Copy the hex codes or open it directly in the editor.`
  }),
  canonical: computed(() => `https://simplepixelart.com/palettes/${idString.value}`),
  ogImage: computed(() => `${config.public.api}/coloring/palettes/${idString.value}/og/`),
  robots: "index, follow",
  script: computed(() => palette.value ? [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: `${palette.value.name} color palette`,
      description: `A ${palette.value.color_count}-color pixel art palette${creator.value ? ` by ${creator.value}` : ''}: ${colors.value.join(', ')}.`,
      url: `https://simplepixelart.com/palettes/${idString.value}`,
      image: `${config.public.api}/coloring/palettes/${idString.value}/og/`,
      genre: 'Color palette',
      keywords: `pixel art palette, color palette, hex codes, ${palette.value.name}`,
      text: colors.value.join(', '),
      isAccessibleForFree: true,
      inLanguage: 'en',
      ...(palette.value.updated ? {dateModified: palette.value.updated} : {}),
      ...(palette.value.created ? {dateCreated: palette.value.created} : {}),
      ...(creator.value ? {creator: {'@type': 'Person', name: creator.value, url: `https://simplepixelart.com/creator/${creator.value}`}} : {}),
      publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
    }),
  }] : []),
})
</script>

<template>
  <div v-if="palette" class="page pal-detail">
    <div class="pd-head">
      <div>
        <h1 class="pd-title">{{ palette.name || palette.id_string }}</h1>
        <div class="pd-meta">
          <span>{{ palette.color_count }} colors</span>
          <span v-if="usedCount" class="pd-dot">·</span>
          <span v-if="usedCount">{{ usedCount }} {{ usedCount === 1 ? 'artwork' : 'artworks' }}</span>
          <template v-if="palette.user">
            <span class="pd-dot">·</span>
            <span>by <nuxt-link class="pd-creator" :to="`/creator/${palette.user.username}`">{{ palette.user.username }}</nuxt-link></span>
          </template>
        </div>
      </div>
      <div class="pd-actions">
        <nuxt-link :to="`/editor?palette=${palette.id_string}`" class="btn primary">
          <span class="icon icon-pen"/>
          <span>Open in editor</span>
        </nuxt-link>
        <button class="btn pd-like" :class="{ liked }" :disabled="liking || liked" @click="toggleLike" :title="liked ? 'You hearted this today' : 'Heart this palette'">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M12 21s-7.5-4.9-10-9.3C.5 8.6 2 5 5.5 5c2 0 3.4 1.1 4.5 2.6C11.1 6.1 12.5 5 14.5 5 18 5 19.5 8.6 22 11.7 19.5 16.1 12 21 12 21z"
                  :fill="liked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6"/>
          </svg>
          <span>{{ likeCount }}</span>
        </button>
        <ui-dropdown-menu>
          <button class="btn">
            <span class="icon icon-download"/>
            <span>Download</span>
          </button>
          <template #menu>
            <div class="pd-dl-menu">
              <a v-for="f in DL_FORMATS" :key="f.ext" class="drop-item" :href="dl(f.ext)" target="_blank" rel="noopener">
                <span>{{ f.label }}</span>
              </a>
              <button class="drop-item" @click="copyAll">
                <span>Copy hex</span>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>
      </div>
    </div>

    <div class="pd-swatches">
      <button
          v-for="(c, i) in colors"
          :key="i"
          class="pd-sw"
          :title="`Copy ${c}`"
          @click="copy(c, c)"
      >
        <span class="pd-sw-color" :style="{ backgroundColor: c }"/>
        <span class="pd-sw-hex">{{ c }}</span>
      </button>
    </div>

    <section v-if="insights" class="pd-insights">
      <h2 class="pd-insights-title">Insights</h2>
      <div class="pd-insights-panel">
        <div class="pd-dom">
          <span class="pd-dom-sw" :style="{ backgroundColor: insights.dominant }"/>
          <div class="pd-dom-meta">
            <span class="pd-dom-cap">Dominant</span>
            <span class="pd-dom-hex">{{ insights.dominant }}</span>
          </div>
        </div>
        <div class="pd-insights-right">
          <div class="pd-pills">
            <span class="pd-pill">{{ insights.tone }}</span>
            <span class="pd-pill">{{ insights.brightness }}</span>
            <span class="pd-pill">{{ insights.saturation }}</span>
          </div>
          <div class="pd-range">
            <span class="pd-range-cap">Dark</span>
            <span class="pd-range-bar" :style="{ background: `linear-gradient(90deg, ${insights.darkest}, ${insights.lightest})` }"/>
            <span class="pd-range-cap">Light</span>
          </div>
        </div>
      </div>
    </section>

    <TagList
        v-if="palette.taxonomies?.length"
        class="pd-tags"
        :items="palette.taxonomies.map(t => ({ label: t.name, to: `/palettes/tag/${t.id_string}` }))"
    />

    <section v-if="usedResults.length" class="pd-used">
      <h2 class="pd-used-title">Artworks using this palette</h2>
      <div class="pd-used-grid">
        <ItemCard v-for="(item, i) in usedResults" :key="item.id" :value="item" :priority="i < 3"/>
      </div>
    </section>

    <section v-if="relatedList.length" class="pd-related">
      <h2 class="pd-related-title">Related palettes</h2>
      <div class="pd-related-grid">
        <ItemPaletteCard v-for="p in relatedList" :key="p.id" :value="p"/>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pd-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: 1rem;
}

.pd-title {
  font-size: var(--text-2xl);
  line-height: var(--text-2xl-lh);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.pd-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 0.25rem;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.pd-dot { opacity: 0.6; }

.pd-creator { color: var(--primary); font-weight: 700; }
.pd-creator:hover { text-decoration: underline; }

.pd-actions {
  display: flex;
  gap: var(--space-3);
}

.pd-actions .btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.pd-like.liked {
  color: #e0245e;
  border-color: color-mix(in oklab, #e0245e 40%, var(--border));
}

.pd-dl-menu {
  display: flex;
  flex-direction: column;
  min-width: 160px;
  padding: var(--space-1);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-hover);
}

.pd-dl-menu .drop-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0.375rem 0.625rem;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground);
  border-radius: var(--radius-sm);
}

.pd-dl-menu .drop-item:hover {
  background: var(--surface-2);
  color: var(--primary);
}

.pd-swatches {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-3);
}

.pd-sw {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-1);
  padding: var(--space-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font: inherit;
  transition: transform 200ms cubic-bezier(.34, 1.56, .64, 1), border-color 160ms ease, box-shadow 160ms ease;
}

.pd-sw-color {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: calc(var(--radius-sm) - 2px);
  border: 1px solid var(--border);
}

.pd-sw-hex {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  color: var(--muted);
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

@media (hover: hover) and (pointer: fine) {
  .pd-sw:hover .pd-sw-hex {
    color: var(--foreground);
  }
}

.pd-insights {
  margin-top: 1.25rem;
}

.pd-insights-title {
  font-size: var(--text-lg);
  line-height: var(--text-lg-lh);
  font-weight: 700;
  margin-bottom: 0.75rem;
}

.pd-insights-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.25rem;
  padding: 0.875rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.pd-dom {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.pd-dom-sw {
  flex: none;
  width: 52px;
  height: 52px;
  border-radius: 10px;
  border: 1px solid var(--border);
}

.pd-dom-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pd-dom-cap {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.pd-dom-hex {
  font-size: var(--text-sm);
  font-weight: 700;
  font-family: ui-monospace, monospace;
}

.pd-insights-right {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  flex: 1;
  min-width: 180px;
}

.pd-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.pd-pill {
  font-size: 12px;
  font-weight: 700;
  padding: 0.25rem 0.7rem;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--foreground);
}

.pd-range {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.pd-range-cap {
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
}

.pd-range-bar {
  flex: 1;
  height: 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
}

.pd-tags {
  margin-top: 0.75rem;
}

.pd-used { margin-top: 2rem; }

.pd-used-title {
  font-size: var(--text-lg);
  line-height: var(--text-lg-lh);
  font-weight: 700;
  margin-bottom: 0.75rem;
}

.pd-used-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-4);
}

.pd-related {
  margin-top: 2rem;
}

.pd-related-title {
  font-size: var(--text-lg);
  line-height: var(--text-lg-lh);
  font-weight: 700;
  margin-bottom: 0.75rem;
}

.pd-related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-4);
}

@media (max-width: 520px) {
  .pd-related-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}
</style>
