<script setup lang="ts">
import type {SharedPage} from "~/types";
import {editorDataToJSON, editorDataToSVG} from "~/helper/canvas";
import {sharedPage2EditorData} from "~/helper/utils";
import {looksLikeProtectedIP} from "~/helper/ip-denylist";

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig()
const auth = useAuthStore()
const {data, pending, error} = await useAuthFetch<SharedPage>(`/coloring/shared-pages/${route.params.id_string}/`)

if (import.meta.server && !data.value) {
  setResponseStatus(useRequestEvent()!, 404)
}

const isOwner = computed(() =>
    !!auth.logged?.id && !!data.value?.user?.id && auth.logged.id === data.value.user.id
)

const isAdmin = computed(() => !!auth.logged?.is_staff)

function onAdminUpdate(updated: SharedPage) {
  data.value = updated
}

async function onAdminDelete() {
  await router.push('/arts')
}

const reportMailto = computed(() => {
  const subject = encodeURIComponent(`Report artwork: ${route.params.id_string}`)
  const body = encodeURIComponent(
      `Artwork URL: ${config.public.siteUrl}/art/${route.params.id_string}\n\nReason for report:\n`
  )
  return `mailto:comficker@gmail.com?subject=${subject}&body=${body}`
})

function artImg(variant: 'social' | 'preview' | 'original' | 'card' | 'square', idString: string) {
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
const imgCard = computed(() =>
    data.value?.id_string ? artImg('card', data.value.id_string) : ''
)
const imgSquare = computed(() =>
    data.value?.id_string ? artImg('square', data.value.id_string) : ''
)

const animation = computed(() => (data.value?.meta as any)?.animation || null)
const isAnimatedArt = computed(() => (animation.value?.frames?.length || 0) > 1)
const gifUrl = computed(() =>
    data.value?.id_string ? `${config.public.api}/coloring/files/art-anim/${data.value.id_string}.gif` : ''
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
  const name = data.value.name?.trim()
  const author = data.value.user?.username || 'Anonymous'
  const size = `${data.value.width}x${data.value.height}`
  const tagList = data.value.taxonomies?.map(t => t.title).filter(Boolean) || []

  const title = name
      ? `${name} — ${size} Pixel Art by ${author}`
      : tagList.length
          ? `${tagList.slice(0, 2).join(' ')} Pixel Art — ${size} by ${author}`
          : `${size} Pixel Art by ${author} — ${data.value.id_string}`
  const desc = data.value.desc?.trim() || ''
  const descFallback = `${name || 'A'} ${size} pixel art with ${pixelCount} pixels${tagList.length ? `, tagged ${tagList.slice(0, 3).join(', ')}` : ''}, by ${author}. Remix it in the free online editor on SimplePixelArt.`

  return {
    url,
    title,
    desc,
    descFallback,
    imgSrc,
    imgSrcOrigin,
    author: data.value.user?.username,
    width: data.value.width,
    height: data.value.height,
    pixels: pixelCount,
    tags: tagList.join(', ')
  }
})

const looksLikeIP = computed(() => looksLikeProtectedIP(
    data.value?.name,
    data.value?.desc,
    meta.value.tags,
))
const hasOriginalContent = computed(() =>
    data.value?.status === 'public'
    && !!meta.value.desc
    && !looksLikeIP.value
)

useCustomSeoMeta({
  title: meta.value.title,
  description: meta.value.desc || meta.value.descFallback,
  canonical: meta.value.url,
  ogImage: isAnimatedArt.value ? gifUrl.value : meta.value.imgSrc,
  ogType: 'article',
  author: meta.value.author,
  robots: hasOriginalContent.value ? 'index, follow' : 'noindex, follow',
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
        image: {
          "@type": "ImageObject",
          contentUrl: meta.value.imgSrc,
          url: meta.value.imgSrc,
          width: 1200,
          height: 630,
          caption: meta.value.title,
          creditText: "SimplePixelArt.com",
          creator: {
            "@type": "Person",
            name: meta.value.author || "Anonymous",
            ...(meta.value.author
                ? {url: `https://simplepixelart.com/creator/${meta.value.author}`}
                : {}),
          },
          copyrightNotice: meta.value.author
              ? `© ${meta.value.author} — SimplePixelArt.com`
              : "SimplePixelArt.com",
        },
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
    },
    {
      type: 'application/ld+json',
      innerHTML: () => data.value ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {"@type": "ListItem", position: 1, name: "Home", item: `${config.public.siteUrl}/`},
          {"@type": "ListItem", position: 2, name: "Gallery", item: `${config.public.siteUrl}/arts`},
          {"@type": "ListItem", position: 3, name: meta.value.title, item: meta.value.url}
        ]
      }) : ''
    }
  ]
})

const shareBtnMeta = computed(() => ({
  ...meta.value,
  imgSrcOrigin: imgCard.value || imgPreview.value,
  imgSquare: imgSquare.value || imgPreview.value,
}))

const artSlug = computed(() =>
    (data.value?.name || data.value?.id_string || 'pixel-art')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pixel-art')

const download = (type: string) => {
  let url: string | undefined = ''
  let ext: string = 'png'
  if (type === 'pdf') {
    url = `${config.public.api}/coloring/files/art-preview/${data.value!.id_string}.pdf`
    ext = 'pdf'
  } else if (type === 'preview') {
    url = imgPreview.value
  } else if (type === 'square') {
    url = imgSquare.value
  } else if (type === 'original') {
    url = imgOriginal.value
  } else if (type === 'gif') {
    url = gifUrl.value
    ext = 'gif'
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

const maxDim = computed(() => Math.max(data.value?.width || 1, data.value?.height || 1))

interface PngSize { scale: number; w: number; h: number; label: string }

const pngSizes = computed<PngSize[]>(() => {
  const w = data.value?.width || 0, h = data.value?.height || 0
  if (!w || !h) return []
  const seen = new Set<number>()
  const out: PngSize[] = []
  const push = (scale: number) => {
    scale = Math.max(1, Math.round(scale))
    if (seen.has(scale)) return
    seen.add(scale)
    const ow = w * scale, oh = h * scale
    out.push({scale, w: ow, h: oh, label: ow === oh ? `${ow}²` : `${ow}×${oh}`})
  }
  for (const target of [1024, 512, 256]) push(target / maxDim.value)
  push(1)
  return out.sort((a, b) => b.scale - a.scale)
})

const dlScale = ref<number | null>(null)

async function downloadPngSize(size: PngSize) {
  if (dlScale.value !== null || !imgOriginal.value) return
  dlScale.value = size.scale
  try {
    const srcUrl = URL.createObjectURL(await (await fetch(imgOriginal.value)).blob())
    const img = new Image()
    img.src = srcUrl
    await img.decode()
    const c = document.createElement('canvas')
    c.width = size.w
    c.height = size.h
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, size.w, size.h)
    URL.revokeObjectURL(srcUrl)
    const blob: Blob | null = await new Promise(res => c.toBlob(res, 'image/png'))
    if (!blob) throw new Error('toBlob failed')
    const outUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = outUrl
    a.download = `${artSlug.value}-${size.w}x${size.h}.png`
    a.click()
    URL.revokeObjectURL(outUrl)
  } catch {
    window.open(imgOriginal.value, '_blank')
  } finally {
    dlScale.value = null
  }
}

const PREVIEW_SIZES = ['original', 32, 64, 128, 256, 'full'] as const
type PreviewSize = 'full' | 'original' | number
const previewSize = ref<PreviewSize>(256)

const previewSizeLabel = (s: PreviewSize) =>
    s === 'full' ? 'Fit to view'
        : s === 'original' ? `Original · ${data.value?.width}×${data.value?.height}`
            : `${s}px`

const previewSizeShort = computed(() =>
    previewSize.value === 'full' ? 'Fit'
        : previewSize.value === 'original' ? '1:1'
            : `${previewSize.value}px`)

const previewStyle = computed(() => {
  const w = data.value?.width || 1, h = data.value?.height || 1
  const s = previewSize.value
  if (s === 'full') return {}
  if (s === 'original') return {width: `${w}px`, height: `${h}px`}
  const scale = (s as number) / Math.max(w, h)
  return {width: `${Math.round(w * scale)}px`, height: `${Math.round(h * scale)}px`}
})
</script>

<template>
  <div class="page art-page">

    <div v-if="pending" class="art-state">
      <div class="skeleton skeleton-square art-state-skeleton"/>
      <p class="art-state-caption">Loading pixel art…</p>
    </div>

    <div v-else-if="error || !data" class="empty-state">
      <span class="empty-state-icon icon icon-search" aria-hidden="true"/>
      <div class="empty-state-title">Artwork not found</div>
      <p class="empty-state-body">This pixel art couldn’t be found or may have been removed.</p>
      <nuxt-link to="/arts" class="btn primary empty-state-action">Browse gallery</nuxt-link>
    </div>

    <template v-else>

      <div class="editor art-editor">
        <div class="editor-toolbar">
          <div class="toolbar-start">
            <h1 class="art-tb-title" :title="data.name || `${data.width}×${data.height} Pixel Art`">
              {{ data.name || `${data.width}×${data.height} Pixel Art` }}
            </h1>
          </div>
          <div class="toolbar-end">
            <SocialSharing :meta="shareBtnMeta" position="right" class="art-tb-share"/>
          </div>
        </div>

        <div class="editor-body">
          <div class="canvas-col">
            <div class="tm-stage art-stage">
              <ClientOnly v-if="isAnimatedArt">
                <AnimatedArt
                    :frames="animation.frames"
                    :shared="animation.shared"
                    :width="data.width"
                    :height="data.height"
                    :colors="data.colors"
                    :fps="animation.fps"
                    :loop="animation.loop"
                    class="art-img"
                    :style="previewStyle"
                />
                <template #fallback>
                  <img :src="imgOriginal" :alt="data.name" class="art-img" :style="previewStyle" :width="data.width" :height="data.height">
                </template>
              </ClientOnly>
              <img
                  v-else
                  id="mainImg"
                  :src="imgOriginal"
                  :alt="data.name || `${data.width}x${data.height} Pixel Art`"
                  class="art-img"
                  :style="previewStyle"
                  loading="eager"
                  fetchpriority="high"
                  :width="data.width"
                  :height="data.height"
              >
              <div v-if="isAnimatedArt" class="art-anim-badge" title="Animated artwork">
                <span class="art-anim-dot" aria-hidden="true"/>
                <span>Animated · {{ animation.frames.length }}f</span>
              </div>
              <div v-if="data.template" class="art-remix-badge" title="Remixed from another artwork">
                <span class="icon icon-pen"/>
                <span>Remix</span>
              </div>

              <div class="art-preview-ctl">
                <ui-dropdown-menu position="right">
                  <button class="art-size-pill" title="Preview size">
                    <span class="icon icon-search"/>
                    <span>{{ previewSizeShort }}</span>
                    <span class="icon icon-expand-down" aria-hidden="true"/>
                  </button>
                  <template #menu>
                    <div class="file-menu">
                      <button
                          v-for="opt in PREVIEW_SIZES"
                          :key="String(opt)"
                          class="file-menu-item"
                          @click="previewSize = opt"
                      >
                        <span class="file-menu-label">
                          <span>{{ previewSizeLabel(opt) }}</span>
                          <span v-if="previewSize === opt" class="icon icon-check"/>
                        </span>
                      </button>
                    </div>
                  </template>
                </ui-dropdown-menu>
              </div>
            </div>
          </div>

          <aside class="editor-sidebar">
            <div class="art-sidebar-inner">
            <Widget title="Meta">
              <dl class="art-meta-side">
                <div v-if="data.user" class="art-meta-row">
                  <dt>Creator</dt>
                  <dd><nuxt-link :to="`/creator/${data.user.username}`" class="art-meta-link">@{{ data.user.username }}</nuxt-link></dd>
                </div>
                <div class="art-meta-row">
                  <dt>Size</dt>
                  <dd><nuxt-link :to="`/arts/size-${data.width}x${data.height}`" class="art-meta-link">{{ data.width }}×{{ data.height }}</nuxt-link></dd>
                </div>
                <div class="art-meta-row">
                  <dt>Pixels</dt>
                  <dd>{{ Object.keys(data.map_numbers).length }}</dd>
                </div>
                <div v-if="data.colors?.length" class="art-meta-row">
                  <dt>Colors</dt>
                  <dd>{{ data.colors.length }}</dd>
                </div>
                <div v-if="formattedDate" class="art-meta-row">
                  <dt>Updated</dt>
                  <dd>{{ formattedDate }}</dd>
                </div>
                <div v-if="data?.taxonomies && data.taxonomies.length" class="art-meta-row art-meta-row-tags">
                  <dt>Tags</dt>
                  <dd class="art-meta-tags">
                    <nuxt-link
                        v-for="t in data.taxonomies"
                        :key="t.id_string"
                        :to="`/arts/${t.id_string}`"
                        class="art-meta-link"
                    >{{ t.title }}</nuxt-link>
                  </dd>
                </div>
              </dl>
            </Widget>
            <Widget>
              <div class="art-actions">
                <nuxt-link
                    :to="`/editor?id=${route.params.id_string}`"
                    class="btn"
                    :title="isOwner ? 'Edit this pixel art' : 'Remix this pixel art'"
                >
                  <span class="icon icon-pen"/>
                  <span>{{ isOwner ? 'Edit this' : 'Remix this' }}</span>
                </nuxt-link>
              </div>
            </Widget>
            <Widget title="Download" class="art-dl-widget">
              <div class="download-menu art-dl-list">
                <button
                    v-for="s in pngSizes"
                    :key="s.scale"
                    class="drop-item btn-split"
                    :disabled="dlScale !== null"
                    @click="downloadPngSize(s)"
                >
                  <span>PNG · {{ s.label }}</span>
                  <span class="text-muted">{{ dlScale === s.scale ? '…' : `${s.w}×${s.h}` }}</span>
                </button>
                <div class="file-menu-sep"/>
                <button class="drop-item btn-split" @click="download('square')">
                  <span>PNG · square</span><span class="text-muted">1080×1080 · social</span>
                </button>
                <button v-if="isAnimatedArt" class="drop-item btn-split" @click="download('gif')">
                  <span>Animated GIF</span><span class="text-muted">{{ animation.frames.length }} frames</span>
                </button>
                <button class="drop-item btn-split" @click="download('svg')">
                  <span>SVG</span><span class="text-muted">vector</span>
                </button>
                <button class="drop-item btn-split" @click="download('pdf')">
                  <span>PDF</span><span class="text-muted">print</span>
                </button>
                <button class="drop-item btn-split" @click="download('json')">
                  <span>JSON</span><span class="text-muted">source</span>
                </button>
              </div>
            </Widget>
            </div>
          </aside>
        </div>

        <div v-if="data?.colors && data.colors.length" class="art-footer">
          <Widget title="Palette">
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
            <p class="art-palette-links">
              <nuxt-link v-if="data?.palette_slug" :to="`/palettes/${data.palette_slug}`">
                View this palette
              </nuxt-link>
              <span v-if="data?.palette_slug" aria-hidden="true"> · </span>
              <nuxt-link to="/palettes">Browse color palettes</nuxt-link>
            </p>
          </Widget>
        </div>
      </div>

      <p v-if="data.desc" class="art-desc">{{ data.desc }}</p>

      <ClientOnly v-if="hasOriginalContent">
        <div class="art-ad">
          <AdSlot slot="6499761093" size="medium"/>
        </div>
      </ClientOnly>

      <section class="art-section">
        <header class="section-head">
          <h2 class="section-title">Related artworks</h2>
          <nuxt-link to="/arts" class="section-link">Browse all →</nuxt-link>
        </header>
        <item-list :limit="6"/>
      </section>

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

      <ClientOnly>
        <AdminArtPanel v-if="isAdmin" :data="data" @updated="onAdminUpdate" @deleted="onAdminDelete"/>
      </ClientOnly>
    </template>
  </div>
</template>

<style scoped>

.art-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
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
  border-radius: var(--radius-pill);
}

.art-remix-badge .icon {
  width: 11px;
  height: 11px;
}

.art-anim-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 9px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  border-radius: var(--radius-pill);
}

.art-anim-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-pill);
  background: #4ade80;
  animation: artAnimPulse 1.2s ease-in-out infinite;
}

@keyframes artAnimPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.art-desc {
  color: var(--muted);
  font-size: var(--text-base);
  line-height: 1.6;
  max-width: 56ch;
}

.art-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}

.art-section .section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--border);
}

.art-section .section-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  margin-bottom: -1px;                 
  border-bottom: 2px solid #fd8c73;
  font-size: var(--text-xs);
  font-weight: 800;
  color: var(--foreground);
}

.art-section > :not(.section-head) {
  margin: var(--space-4);
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
  gap: var(--space-5);
}

.download-menu .text-muted {
  color: var(--muted);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}

.art-dl-list { min-width: 0; }
.art-dl-list .drop-item { padding: 6px 0; font-size: var(--text-xs); }
.art-dl-list .btn-split { gap: var(--space-2); }

@media (hover: hover) and (pointer: fine) {
  .art-dl-list .drop-item:not(:disabled):hover { color: var(--primary); }
}

.art-palette {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: var(--space-1);
}

.art-palette-links {
  margin-top: var(--space-2);
  font-size: var(--text-2xs);
  color: var(--muted);
}

.art-swatch {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.art-swatch-color {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  background: var(--swatch);
  border-radius: calc(var(--radius-sm) - 2px);
  border: 1px solid var(--border);
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

.art-report {
  display: flex;
  align-items: center;
  gap: 10px;
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
  }
}

.art-editor { margin-bottom: var(--space-4); }

.art-editor .toolbar-start { flex: 1; min-width: 0; }

.art-tb-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 var(--space-2);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--foreground);
}

.art-editor .toolbar-end { border-left: 0; padding-left: 0; width: 100px; }

@media (min-width: 768px) {
  .art-editor .toolbar-end { width: calc(24% - 8px); max-width: 190px; }
}

.art-editor .toolbar-end :deep(.dropdown),
.art-editor .toolbar-end :deep(.dropdown-trigger-wrap) { width: 100%; }

.art-editor .toolbar-end :deep(.share-trigger) {
  width: 100%;
  height: 2.25rem;
  min-height: 0;
  padding: 0;
  gap: var(--space-1);
  justify-content: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--primary-foreground);
}

.art-editor .toolbar-end :deep(.share-trigger .icon) { width: 14px; height: 14px; }

@media (hover: hover) and (pointer: fine) {
  .art-editor .toolbar-end :deep(.share-trigger:hover) {
    background: color-mix(in oklab, var(--primary) 88%, #000);
  }
}

.art-editor .editor-sidebar { min-height: 0; }
.art-sidebar-inner { display: flex; flex-direction: column; min-height: 0; }
.art-sidebar-inner > .widget + .widget { border-top: 1px solid var(--border); }

@media (min-width: 768px) {
  .art-editor .editor-sidebar { position: relative; }
  .art-sidebar-inner { position: absolute; inset: 0; overflow: hidden; }
}

.art-dl-widget { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.art-dl-widget :deep(.widget-body) { flex: 1; min-height: 0; overflow-y: auto; }

.art-actions { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-2); }
.art-actions .btn { width: 100%; justify-content: center; }
.art-actions :deep(.dropdown),
.art-actions :deep(.dropdown-trigger-wrap),
.art-actions :deep(.share-trigger) { width: 100%; }
.art-actions :deep(.share-trigger) { justify-content: center; }

.art-stage { max-height: 72vh; }

.art-preview-ctl {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  z-index: 3;
}

.art-preview-ctl :deep(.dropdown-menu) {
  top: auto;
  bottom: calc(100% + 6px);
  transform-origin: bottom center;
}

.art-size-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 30px;
  padding: 0 0.6rem;
  border-radius: var(--radius-pill);
  background: color-mix(in oklab, var(--surface) 92%, transparent);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  border: 1px solid var(--border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  color: var(--foreground);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}

.art-size-pill .icon { width: 13px; height: 13px; }

@media (hover: hover) and (pointer: fine) {
  .art-size-pill:hover { color: var(--primary); }
}

.art-ad { display: flex; justify-content: center; }

.art-meta-side { margin: 0; display: flex; flex-direction: column; }

.art-meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 6px 0;
  font-size: var(--text-xs);
}

.art-meta-row + .art-meta-row {
  border-top: 1px solid var(--border);
}

.art-meta-row dt {
  margin: 0;
  color: var(--muted);
  flex-shrink: 0;
}

.art-meta-row dd {
  margin: 0;
  min-width: 0;
  text-align: right;
  color: var(--foreground);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.art-meta-link { color: var(--foreground); }

.art-meta-row-tags { align-items: flex-start; }

.art-meta-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 3px 8px;
}

.art-meta-tags .art-meta-link { color: var(--primary); font-weight: 600; }

@media (hover: hover) and (pointer: fine) {
  .art-meta-link:hover { color: var(--primary); }
}

.art-footer { border-top: 1px solid var(--border); }

.art-desc { margin-top: var(--space-3); }
</style>
