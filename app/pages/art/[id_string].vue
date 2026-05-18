<script setup lang="ts">
import type {SharedPage} from "~/types";
import {editorDataToJSON, editorDataToSVG} from "~/helper/canvas";
import {sharedPage2EditorData} from "~/helper/utils";

const route = useRoute();
const config = useRuntimeConfig()
const auth = useAuthStore()
const {data, pending, error} = await useAuthFetch<SharedPage>(`/coloring/shared-pages/${route.params.id_string}/`)

const isOwner = computed(() =>
    !!auth.logged?.id && !!data.value?.user?.id && auth.logged.id === data.value.user.id
)

const reportMailto = computed(() => {
  const subject = encodeURIComponent(`Report artwork: ${route.params.id_string}`)
  const body = encodeURIComponent(
      `Artwork URL: ${config.public.siteUrl}/art/${route.params.id_string}\n\nReason for report:\n`
  )
  return `mailto:comficker@gmail.com?subject=${subject}&body=${body}`
})

// Art image URL helpers — 3 variants served by backend:
//   art-social   → OG/Twitter web preview thumbnail (1200x630-ish)
//   art-preview  → higher-res image attached to social shares
//   art-original → true pixel resolution, used for display + download
function artImg(variant: 'social' | 'preview' | 'original', idString: string) {
  return `${config.public.api}/coloring/files/art-${variant}/${idString}.png`
}

const imgSocial = computed(() =>
    data.value?.id_string ? artImg('social', data.value.id_string) : '/screenshot/default.png'
)
const imgPreview = computed(() =>
    data.value?.id_string ? artImg('preview', data.value.id_string) : ''
)
const imgOriginal = computed(() =>
    data.value?.id_string ? artImg('original', data.value.id_string) : ''
)

const meta = computed(() => {
  if (!data.value) {
    return {
      url: `${config.public.siteUrl}/art/${route.params.id_string}`,
      title: 'Loading...',
      desc: 'Loading pixel art...',
      imgSrc: imgSocial.value,
    }
  }

  const url = `${config.public.siteUrl}/art/${data.value.id_string}`
  const imgSrc = imgSocial.value
  const imgSrcOrigin = imgPreview.value
  const pixelCount = data.value.map_numbers ? Object.keys(data.value.map_numbers).length : 0
  const title = data.value.name
      ? `${data.value.name} - ${data.value.width}x${data.value.height} Pixel Art`
      : `${data.value.width}x${data.value.height} Pixel Art - Created by ${data.value.user?.username || 'Anonymous'}`
  const desc = data.value.desc
      ? `${data.value.desc} Explore this ${data.value.width}x${data.value.height} pixel art creation with ${pixelCount} pixels. Created by ${data.value.user?.username || 'Anonymous'} on SimplePixelArt.`
      : `Discover this amazing ${data.value.width}x${data.value.height} pixel art created by ${data.value.user?.username || 'Anonymous'}. Featuring ${pixelCount} carefully placed pixels in a unique design.`

  return {
    url,
    title,
    desc,
    imgSrc,
    imgSrcOrigin,
    author: data.value.user?.username,
    width: data.value.width,
    height: data.value.height,
    pixels: pixelCount,
    tags: data.value.taxonomies?.map(t => t.title).join(', ') || ''
  }
})

useCustomSeoMeta({
  title: meta.value.title,
  description: meta.value.desc,
  keywords: `${meta.value.author ? `${meta.value.author}, ` : ''}pixel art, ${meta.value.width}x${meta.value.height}, art creation, digital art, pixel design, ${meta.value.tags}`,
  canonical: meta.value.url,
  ogImage: meta.value.imgSrc,
  ogType: 'article',
  author: meta.value.author,
  robots: data.value?.status === 'pending' ? 'noindex, follow' : 'index, follow',
  publishedTime: data.value?.updated ? new Date(data.value.updated).toISOString() : undefined,
  modifiedTime: data.value?.updated ? new Date(data.value.updated).toISOString() : undefined,
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => data.value ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: meta.value.title,
        description: meta.value.desc,
        image: meta.value.imgSrc,
        url: meta.value.url,
        datePublished: data.value.updated,
        dateModified: data.value.updated,
        author: {
          "@type": "Person",
          name: meta.value.author || "Anonymous",
          url: meta.value.author ? `https://simplepixelart.com/creator/${meta.value.author}` : undefined
        },
        publisher: {
          "@type": "Organization",
          name: "SimplePixelArt.com",
          url: "https://simplepixelart.com/"
        },
        mainEntityOfPage: {
          "@type": "CreativeWork",
          name: `${meta.value.width}x${meta.value.height} Pixel Art`,
          description: `Pixel art creation with ${meta.value.pixels} pixels`,
          width: meta.value.width,
          height: meta.value.height,
          keywords: meta.value.tags
        }
      }) : ''
    }
  ]
})

const canShareImage = ref(false)
const sharing = ref(false)

onMounted(() => {
  // Detect Web Share API level 2 (file share support)
  const nav = typeof navigator !== 'undefined' ? navigator : null
  if (nav && typeof nav.canShare === 'function') {
    try {
      const probe = new File([new Blob()], 'probe.png', {type: 'image/png'})
      canShareImage.value = nav.canShare({files: [probe]})
    } catch {
      canShareImage.value = false
    }
  }
})

async function shareImage() {
  if (!data.value?.id_string || sharing.value) return
  sharing.value = true
  try {
    const res = await fetch(imgPreview.value)
    const blob = await res.blob()
    const file = new File([blob], `${data.value.id_string}.png`, {type: 'image/png'})
    await navigator.share({
      files: [file],
      title: meta.value.title,
      text: meta.value.desc,
      url: meta.value.url,
    })
  } catch (e: any) {
    if (e?.name !== 'AbortError') console.warn('Share failed:', e)
  } finally {
    sharing.value = false
  }
}

const socialUrls = computed(() => {
  const url = encodeURIComponent(meta.value.url || '')
  const title = encodeURIComponent(meta.value.title || '')
  // Social shares get art-preview (higher res than the OG thumbnail)
  const img = encodeURIComponent(imgPreview.value || '')
  return {
    twitter: `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
    reddit: `https://www.reddit.com/submit?url=${url}&title=${title}`,
    pinterest: `https://www.pinterest.com/pin/create/button/?url=${url}&media=${img}&description=${title}`,
  }
})

const download = (type: string) => {
  let url: string | undefined = ''
  let ext: string = 'png'
  if (type === 'pdf') {
    url = `${config.public.api}/coloring/files/art-preview/${data.value!.id_string}.pdf`
    ext = 'pdf'
  } else if (type === 'preview') {
    url = imgPreview.value
  } else if (type === 'original') {
    url = imgOriginal.value
  } else {
    const editorData = sharedPage2EditorData(data.value!)
    if (type === 'json') {
      url = editorDataToJSON(editorData)
      ext = 'json'
    } else if (type === 'svg') {
      url = editorDataToSVG(editorData)
      ext = 'svg'
    }
  }
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = `[simplepixelart.com]${data.value!.id_string}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

const formattedDate = computed(() =>
    data.value?.updated ? new Date(data.value.updated).toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'}) : ''
)
</script>

<template>
  <div class="page art-page">
    <!-- Loading state -->
    <div v-if="pending" class="art-state">
      <div class="skeleton skeleton-square art-state-skeleton"/>
      <p class="art-state-caption">Loading pixel art…</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error || !data" class="empty-state">
      <span class="empty-state-icon icon icon-search" aria-hidden="true"/>
      <div class="empty-state-title">Artwork not found</div>
      <p class="empty-state-body">This pixel art couldn’t be found or may have been removed.</p>
      <nuxt-link to="/arts" class="btn primary empty-state-action">Browse gallery</nuxt-link>
    </div>

    <!-- Main content -->
    <template v-else>
      <!-- HERO: image card + headline -->
      <section class="art-hero">
        <div class="art-canvas-wrap">
          <div class="art-canvas">
            <img
                id="mainImg"
                :src="imgOriginal"
                :alt="data.name || `${data.width}x${data.height} Pixel Art`"
                class="art-img"
                loading="eager"
                fetchpriority="high"
                :width="data.width"
                :height="data.height"
            >
          </div>
          <div v-if="data.template" class="art-remix-badge" title="Remixed from another artwork">
            <span class="icon icon-brush"/>
            <span>Remix</span>
          </div>
        </div>

        <div class="art-headline">
          <span class="art-eyebrow">
            <span class="art-eyebrow-dot" aria-hidden="true"/>
            {{ data.status === 'pending' ? 'Pending review' : 'Pixel art' }}
          </span>
          <h1 class="art-title">{{ data.name || `${data.width}×${data.height} Pixel Art` }}</h1>
          <p v-if="data.desc" class="art-desc">{{ data.desc }}</p>

          <div v-if="data.user" class="art-author">
            <nuxt-link :to="`/creator/${data.user.username}`" class="art-author-link">
              <span class="art-author-avatar" aria-hidden="true">
                {{ data.user.username?.charAt(0).toUpperCase() }}
              </span>
              <span class="art-author-text">
                <span class="art-author-label">Created by</span>
                <span class="art-author-name">@{{ data.user.username }}</span>
              </span>
            </nuxt-link>
          </div>

          <div class="art-meta-pills">
            <span class="art-pill">
              <span class="icon icon-ruler"/>
              <span><strong>{{ data.width }}×{{ data.height }}</strong></span>
            </span>
            <span class="art-pill">
              <span class="icon icon-square"/>
              <span><strong>{{ Object.keys(data.map_numbers).length }}</strong> pixels</span>
            </span>
            <span v-if="data.colors?.length" class="art-pill">
              <span class="icon icon-adjust"/>
              <span><strong>{{ data.colors.length }}</strong> colors</span>
            </span>
            <span v-if="formattedDate" class="art-pill">
              <span class="icon icon-calender"/>
              <span>{{ formattedDate }}</span>
            </span>
          </div>

          <div class="art-cta-row">
            <nuxt-link
                :to="`/editor?id=${route.params.id_string}`"
                class="btn primary art-cta-primary"
                :title="isOwner ? 'Edit this pixel art in the editor' : 'Remix this pixel art in the editor'"
            >
              <span class="icon icon-brush"/>
              <span>{{ isOwner ? 'Edit this' : 'Remix this' }}</span>
            </nuxt-link>
            <nuxt-link to="/editor" class="btn art-cta-secondary">
              <span class="icon icon-plus"/>
              <span>Create new</span>
            </nuxt-link>
          </div>
        </div>
      </section>

      <!-- AD: after hero (high-engagement zone) -->
      <ClientOnly>
        <AdSlot slot="TODO_AFTER_HERO_SLOT_ID" size="medium"/>
      </ClientOnly>

      <!-- Share + download strip -->
      <section class="art-section">
        <header class="section-head">
          <h2 class="section-title">Share &amp; download</h2>
        </header>
        <div class="art-share-grid" :class="{'has-native': canShareImage}">
          <button
              v-if="canShareImage"
              class="art-share-btn"
              :disabled="sharing"
              @click="shareImage"
          >
            <span class="icon icon-social"/>
            <span>{{ sharing ? '…' : 'Share' }}</span>
          </button>
          <a :href="socialUrls.twitter" target="_blank" rel="noopener noreferrer" class="art-share-btn">
            <span class="icon icon-x"/>
            <span>Twitter</span>
          </a>
          <a :href="socialUrls.reddit" target="_blank" rel="noopener noreferrer" class="art-share-btn">
            <span class="icon icon-reddit"/>
            <span>Reddit</span>
          </a>
          <a :href="socialUrls.pinterest" target="_blank" rel="noopener noreferrer" class="art-share-btn">
            <span class="icon icon-pinterest"/>
            <span>Pinterest</span>
          </a>
          <ui-dropdown-menu>
            <div class="art-share-btn art-share-btn-primary">
              <span class="icon icon-download"/>
              <span>Download</span>
            </div>
            <template #menu>
              <div class="download-menu">
                <button class="drop-item btn-split" @click="download('original')">
                  <span>Original PNG</span>
                  <span class="text-muted">{{ data.width }}×{{ data.height }}</span>
                </button>
                <button class="drop-item btn-split" @click="download('preview')">
                  <span>Preview PNG</span>
                  <span class="text-muted">600×{{ Math.round(600 * data.height / data.width) }}</span>
                </button>
                <button class="drop-item btn-split" @click="download('svg')">
                  <span>SVG</span>
                  <span class="text-muted">vector</span>
                </button>
                <button class="drop-item btn-split" @click="download('pdf')">
                  <span>PDF</span>
                  <span class="text-muted">print</span>
                </button>
                <button class="drop-item btn-split" @click="download('json')">
                  <span>JSON</span>
                  <span class="text-muted">source</span>
                </button>
              </div>
            </template>
          </ui-dropdown-menu>
        </div>
      </section>

      <!-- Tags -->
      <section v-if="data?.taxonomies && data.taxonomies.length > 0" class="art-section">
        <header class="section-head">
          <h2 class="section-title">Tags</h2>
        </header>
        <div class="art-tag-row">
          <nuxt-link
              v-for="item in data.taxonomies" :key="item.id"
              :to="`/arts/${item.id_string}`"
              class="art-tag"
          >
            <span>#</span>{{ item.title }}
          </nuxt-link>
        </div>
      </section>

      <!-- Color palette -->
      <section v-if="data?.colors && data.colors.length > 0" class="art-section">
        <header class="section-head">
          <h2 class="section-title">Palette</h2>
          <span class="section-link">{{ data.colors.length }} colors · tap to find more</span>
        </header>
        <div class="art-palette">
          <nuxt-link
              v-for="item in data.colors" :key="item"
              class="art-swatch"
              :to="`/arts/color-${item.toUpperCase().replace('#', '')}`"
              :style="{'--swatch': item}"
              :title="`Color ${item.toUpperCase()} — find similar artworks`"
          >
            <span class="art-swatch-color"/>
            <span class="art-swatch-hex">{{ item.toUpperCase() }}</span>
          </nuxt-link>
        </div>
      </section>

      <!-- AD: mid-content (between palette and related) -->
      <ClientOnly>
        <AdSlot slot="6499761093" size="medium"/>
      </ClientOnly>

      <!-- Related -->
      <section class="art-section">
        <header class="section-head">
          <h2 class="section-title">Related artworks</h2>
          <nuxt-link to="/arts" class="section-link">Browse all →</nuxt-link>
        </header>
        <item-list :limit="6"/>
      </section>

      <!-- AD: after related (bottom funnel) -->
      <ClientOnly>
        <AdSlot slot="TODO_AFTER_RELATED_SLOT_ID" size="small"/>
      </ClientOnly>

      <!-- Report footer -->
      <section class="art-report">
        <span class="art-report-icon icon icon-flag" aria-hidden="true"/>
        <p>
          Something off about this artwork?
          <a :href="reportMailto" class="art-report-link">Report</a>
          ·
          <nuxt-link to="/dmca">DMCA</nuxt-link>
          ·
          <nuxt-link to="/guidelines">Guidelines</nuxt-link>
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.art-page > * + * {
  margin-top: 1.75rem;
}

@media (min-width: 768px) {
  .art-page > * + * {
    margin-top: 2.5rem;
  }
}

/* ===== Loading / error states ===== */
.art-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem 1rem;
}

.art-state-skeleton {
  width: 100%;
  max-width: 360px;
}

.art-state-caption {
  color: var(--muted);
  font-size: var(--text-sm);
}

/* ===== HERO ===== */
.art-hero {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  align-items: start;
}

@media (min-width: 900px) {
  .art-hero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2rem;
  }
}

.art-canvas-wrap {
  position: relative;
  isolation: isolate;
}

.art-canvas-wrap::before {
  content: "";
  position: absolute;
  inset: 12px;
  z-index: -1;
  border-radius: var(--radius);
  background-image:
      radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--foreground) 14%, transparent) 1px, transparent 1px);
  background-size: 14px 14px;
  transform: translate(8px, 8px);
  opacity: 0.6;
}

.art-canvas {
  position: relative;
  aspect-ratio: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  padding: 1.25rem;
  box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.05),
      0 12px 32px -12px rgba(0, 0, 0, 0.18);
}

.art-canvas::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
      linear-gradient(135deg, color-mix(in oklab, var(--primary) 4%, transparent) 0%, transparent 50%);
}

.art-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.art-remix-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px 4px 8px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--primary-foreground);
  background: var(--primary);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

.art-remix-badge .icon {
  width: 11px;
  height: 11px;
}

/* ===== Headline ===== */
.art-headline {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  min-width: 0;
}

@media (min-width: 900px) {
  .art-headline {
    padding-top: 0.5rem;
  }
}

.art-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 11px 4px 10px;
  border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
  background: color-mix(in oklab, var(--surface-2) 60%, transparent);
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--muted);
  align-self: flex-start;
}

.art-eyebrow-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 25%, transparent);
}

.art-title {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  line-height: 1.05;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.03em;
  color: var(--foreground);
}

.art-desc {
  color: var(--muted);
  font-size: var(--text-base);
  line-height: 1.6;
  max-width: 56ch;
}

.art-author-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 6px 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
  align-self: flex-start;
}

@media (hover: hover) and (pointer: fine) {
  .art-author-link:hover {
    border-color: color-mix(in oklab, var(--primary) 50%, var(--border));
    transform: translateY(-1px);
  }
}

.art-author-avatar {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}

.art-author-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.art-author-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}

.art-author-name {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--foreground);
}

/* ===== Meta pills ===== */
.art-meta-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.art-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  background: color-mix(in oklab, var(--surface-2) 50%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  border-radius: 999px;
  font-size: var(--text-xs);
  color: var(--muted);
}

.art-pill .icon {
  width: 0.9em;
  height: 0.9em;
  color: var(--primary);
}

.art-pill strong {
  color: var(--foreground);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ===== Primary CTAs ===== */
.art-cta-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.art-cta-primary,
.art-cta-secondary {
  flex: 1;
  justify-content: center;
}

@media (max-width: 520px) {
  .art-cta-row {
    flex-direction: column;
  }
}

/* ===== Sections (shared head pattern) ===== */
.art-section .section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.art-section .section-title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-lg);
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.015em;
  color: var(--foreground);
}

.art-section .section-title::before {
  content: "";
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: var(--primary);
}

.art-section .section-link {
  font-size: var(--text-xs);
  color: var(--muted);
}

@media (hover: hover) and (pointer: fine) {
  .art-section .section-link:hover {
    color: var(--primary);
  }
}

/* ===== Share grid ===== */
.art-share-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

@media (min-width: 640px) {
  .art-share-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .art-share-grid.has-native {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.art-share-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0.6rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--foreground);
  font-size: var(--text-sm);
  font-weight: 600;
  border-radius: var(--radius);
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, color 160ms ease, background 160ms ease;
}

.art-share-btn .icon {
  width: 1em;
  height: 1em;
  color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .art-share-btn:hover {
    transform: translateY(-1px);
    border-color: color-mix(in oklab, var(--primary) 55%, var(--border));
    color: var(--primary);
  }
}

.art-share-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.art-share-btn-primary {
  background: color-mix(in oklab, var(--primary) 10%, transparent);
  border-color: color-mix(in oklab, var(--primary) 35%, var(--border));
  color: var(--primary);
  cursor: pointer;
}

/* Download menu */
.download-menu {
  display: flex;
  flex-direction: column;
  min-width: 220px;
}

.download-menu .drop-item {
  padding: 10px 12px;
  font-size: var(--text-sm);
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
}

.download-menu .btn-split {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.download-menu .text-muted {
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ===== Tags ===== */
.art-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.art-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 5px 12px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground);
  background: color-mix(in oklab, var(--surface-2) 60%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  border-radius: 999px;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.art-tag > span:first-child {
  color: var(--primary);
  font-weight: 800;
  margin-right: 1px;
}

@media (hover: hover) and (pointer: fine) {
  .art-tag:hover {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
    transform: translateY(-1px);
  }
  .art-tag:hover > span:first-child {
    color: var(--primary-foreground);
  }
}

/* ===== Palette ===== */
.art-palette {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
}

.art-swatch {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: transform 200ms cubic-bezier(.34,1.56,.64,1), border-color 160ms ease, box-shadow 160ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .art-swatch:hover {
    transform: translateY(-2px);
    border-color: color-mix(in oklab, var(--primary) 55%, var(--border));
    box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.2);
  }
}

.art-swatch-color {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  background: var(--swatch);
  border-radius: calc(var(--radius) - 2px);
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
}

.art-swatch-hex {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  color: var(--muted);
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

@media (hover: hover) and (pointer: fine) {
  .art-swatch:hover .art-swatch-hex {
    color: var(--foreground);
  }
}

/* ===== Report footer ===== */
.art-report {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-top: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
  color: var(--muted);
  font-size: var(--text-xs);
}

.art-report-icon {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 14px;
}

.art-report p {
  margin: 0;
  flex: 1;
  line-height: 1.5;
}

.art-report a {
  color: var(--foreground);
  border-bottom: 1px dotted color-mix(in oklab, var(--muted) 60%, transparent);
}

.art-report .art-report-link {
  color: var(--secondary);
}

@media (hover: hover) and (pointer: fine) {
  .art-report a:hover {
    color: var(--primary);
    border-color: var(--primary);
  }
}
</style>
