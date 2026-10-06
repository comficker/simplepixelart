<script setup lang="ts">
const localePath = useLocalePath()
import type {SharedPage} from "~/types";
import {editorDataToJSON, editorDataToSVG} from "~/helper/canvas";
import {sharedPage2EditorData} from "~/helper/utils";
import {licenseOf} from "~/helper/constants";
import {toast} from "vue-sonner";

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig()
const auth = useAuthStore()
const {t} = useI18n()
const {data, pending, error} = await useAuthFetch<SharedPage>(`/coloring/shared-pages/${route.params.id_string}/`)

if (import.meta.server && !data.value) {
  setResponseStatus(useRequestEvent()!, 404)
}

const license = computed(() => licenseOf((data.value?.meta as any)?.license))

// A like is also how a piece is kept: /arts?sort=liked lists them.
const liked = ref(!!data.value?.is_liked)
const likes = ref(data.value?.likes || 0)
const liking = ref(false)
const loginModal = useLoginModal()
async function toggleLike() {
  if (!auth.isLogged) {
    loginModal.show(toggleLike)
    return
  }
  if (liking.value || !data.value) return
  liking.value = true
  liked.value = !liked.value
  likes.value += liked.value ? 1 : -1
  try {
    const res = await useNativeFetch<{liked: boolean; likes: number}>(
        `/coloring/shared-pages/${data.value.id}/like/`, {method: 'POST'})
    liked.value = res.liked
    likes.value = res.likes
  } catch {
    liked.value = !liked.value
    likes.value += liked.value ? 1 : -1
  } finally {
    liking.value = false
  }
}

// The line someone using a CC piece is asked to carry.
const creditLine = computed(() => {
  const d = data.value
  if (!d || !license.value.url) return ''
  const by = d.user?.username ? ` by @${d.user.username}` : ''
  return `“${d.name || 'Untitled'}”${by}, https://simplepixelart.com/art/${d.id_string}, ${t(`p_upload.license_${license.value.key}`).split(' — ')[0]}`
})
async function copyCredit() {
  try {
    await navigator.clipboard.writeText(creditLine.value)
    toast.success(t('p_art_id_string.creditCopied'))
  } catch {
    toast.error(creditLine.value)
  }
}
const isOwner = computed(() =>
    !!auth.logged?.id && !!data.value?.user?.id && auth.logged.id === data.value.user.id
)

const isAdmin = computed(() => !!auth.logged?.is_staff)

function onAdminUpdate(updated: SharedPage) {
  data.value = updated
}

async function onAdminDelete() {
  await router.push(localePath('/arts'))
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
      title: 'Artwork not found',
      desc: 'This pixel art could not be found.',
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
      ? `${name} — ${size} Pixel Art`
      : tagList.length
          ? `${tagList.slice(0, 2).join(' ')} Pixel Art — ${size}`
          : `${size} Pixel Art by ${author}`
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

// The same answer sitemap-page.xml is built from, so the two cannot disagree
// the way they did for 190 pages. The local check stays as the fallback, for a
// backend that has not shipped the field yet.
const hasOriginalContent = computed(() =>
    data.value?.indexable ?? (
        data.value?.status === 'public' && !!meta.value.desc
    )
)

useCustomSeoMeta({
  untranslated: true,
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
          ...(license.value.url ? {license: license.value.url} : {}),
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
    // Revoking right after click() can cancel the download in Firefox/Safari.
    if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1000);
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

/** Bead and coordinate views both need real pixels rather than the server PNG,
 *  and both are sized by how big one cell is rather than by the whole image. */
const beadView = ref(false)
const coordView = ref(false)
const pixelView = computed(() => beadView.value || coordView.value)

const CELL_SIZES = [8, 12, 16, 24, 32, 48] as const
/** Below this "63,63" stops being readable at any font size that fits. */
const COORD_MIN_CELL = 24
const cellSize = ref(16)

const viewLabel = computed(() =>
    beadView.value && coordView.value ? 'Beads + xy'
        : beadView.value ? 'Beads'
            : coordView.value ? 'Coords'
                : 'Pixels')

watch(coordView, (on) => {
  // Turning labels on at 8px a cell would draw nothing legible, which reads as
  // a broken toggle. Zoom to where they can be read instead.
  if (on && cellSize.value < COORD_MIN_CELL) cellSize.value = COORD_MIN_CELL
})

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
  <div v-if="pending" class="page art-state">
    <div class="skeleton skeleton-square art-state-skeleton"/>
    <p class="art-state-caption">{{ $t('p_art_id_string.loadingPixelArt') }}</p>
  </div>

  <div v-else-if="error || !data" class="page empty-state">
    <span class="empty-state-icon icon icon-search" aria-hidden="true"/>
    <h1 class="empty-state-title art-not-found-title">{{ $t('p_art_id_string.artworkNotFound') }}</h1>
    <p class="empty-state-body" v-html="$t('p_art_id_string.thisPixelArtCouldnTBe')"/>
    <NuxtLinkLocale to="/arts" class="btn primary empty-state-action">{{ $t('common.browseGallery') }}</NuxtLinkLocale>
  </div>

  <ToolLayout
      v-else
        :title="data.name || $t('p_art_id_string.whPixelArt', {w: data.width, h: data.height})"
        title-tag="h1"
    >
      <template #head>
        <!-- Moderation sits with Share because it is the same kind of thing: an
             action on this artwork. In the #extra slot it became a direct child
             of the page grid and stretched into a full-width bar under the
             footer, which read as a piece of broken layout. -->
        <div class="art-head-actions">
        <ClientOnly>
          <AdminArtPanel
              v-if="isAdmin"
              :data="data"
              @updated="onAdminUpdate"
              @deleted="onAdminDelete"
          />
        </ClientOnly>
        <button
            type="button"
            class="btn secondary art-like"
            :class="{'is-liked': liked}"
            :aria-pressed="liked"
            :title="liked ? $t('p_art_id_string.unlike') : $t('p_art_id_string.like')"
            @click="toggleLike"
        >
          <span class="icon icon-heart"/>
          <span>{{ likes }}</span>
        </button>
        <SocialSharing :meta="shareBtnMeta" position="right" class="art-tb-share"/>
        </div>
      </template>

    <div class="flat-editor art-editor">
      <div class="tm-stage art-stage">
        <ClientOnly v-if="pixelView">
          <ArtPixelCanvas
              :width="data.width"
              :height="data.height"
              :map-numbers="data.map_numbers"
              :colors="data.colors"
              :cell="cellSize"
              :bead="beadView"
              :coords="coordView"
          />
        </ClientOnly>
        <ClientOnly v-else-if="isAnimatedArt">
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
            :alt="data.name || $t('p_art_id_string.whPixelArt', {w: data.width, h: data.height})"
            class="art-img"
            :style="previewStyle"
            loading="eager"
            fetchpriority="high"
            :width="data.width"
            :height="data.height"
        >
        <div v-if="isAnimatedArt" class="art-anim-badge" :title="$t('common.animatedArtwork')">
          <span class="art-anim-dot" aria-hidden="true"/>
          <span>Animated · {{ animation.frames.length }}f</span>
        </div>
        <NuxtLinkLocale
            v-if="data.template_info"
            :to="`/art/${data.template_info.id_string}`"
            class="art-remix-badge"
            :title="$t('p_art_id_string.remixedFromX', {x: data.template_info.name || ''})"
        >
          <span class="icon icon-pen"/>
          <span>{{ $t('p_art_id_string.remix') }}</span>
        </NuxtLinkLocale>
        <div v-else-if="data.template" class="art-remix-badge" :title="$t('p_art_id_string.remixedFromAnotherArtwork')">
          <span class="icon icon-pen"/>
          <span>{{ $t('p_art_id_string.remix') }}</span>
        </div>

        <div class="art-preview-ctl">
          <ui-dropdown-menu position="right">
            <button class="art-size-pill" :title="$t('p_art_id_string.view')">
              <span class="icon icon-grid"/>
              <span>{{ viewLabel }}</span>
              <span class="icon icon-expand-down" aria-hidden="true"/>
            </button>
            <template #menu>
              <div class="file-menu">
                <button class="file-menu-item" @click="beadView = !beadView">
                  <span class="file-menu-label">
                    <span>{{ $t('p_art_id_string.beads') }}</span>
                    <span v-if="beadView" class="icon icon-check"/>
                  </span>
                </button>
                <button class="file-menu-item" @click="coordView = !coordView">
                  <span class="file-menu-label">
                    <span>{{ $t('p_art_id_string.coordinates') }}</span>
                    <span v-if="coordView" class="icon icon-check"/>
                  </span>
                </button>
              </div>
            </template>
          </ui-dropdown-menu>

          <!-- In the bead and coordinate views the useful number is how big one
               cell is, not how wide the whole picture ends up. -->
          <ui-dropdown-menu v-if="pixelView" position="right">
            <button class="art-size-pill" :title="$t('common.cellSize')">
              <span class="icon icon-search"/>
              <span>{{ cellSize }}px</span>
              <span class="icon icon-expand-down" aria-hidden="true"/>
            </button>
            <template #menu>
              <div class="file-menu">
                <button
                    v-for="opt in CELL_SIZES"
                    :key="opt"
                    class="file-menu-item"
                    @click="cellSize = opt"
                >
                  <span class="file-menu-label">
                    <span>{{ opt }}px a cell</span>
                    <span v-if="cellSize === opt" class="icon icon-check"/>
                  </span>
                </button>
              </div>
            </template>
          </ui-dropdown-menu>

          <ui-dropdown-menu v-else position="right">
            <button class="art-size-pill" :title="$t('p_art_id_string.previewSize')">
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

    <template #status>
      <p class="editor-foot-hint text-xs text-muted">
        {{ data.width }}×{{ data.height }}px · {{ Object.keys(data.map_numbers).length }} pixels
        <template v-if="data.colors?.length"> · {{ data.colors.length }} colors</template>
        <template v-if="isAnimatedArt"> · {{ animation.frames.length }} frames</template>
      </p>
      <p v-if="formattedDate" class="text-xs text-muted">{{ formattedDate }}</p>
    </template>

    <template #aside>
    <Widget>
      <div class="art-actions">
        <NuxtLinkLocale
            :to="`/editor?id=${route.params.id_string}`"
            class="btn"
            :class="{primary: !isOwner}"
            :title="isOwner ? $t('p_art_id_string.editThisPixelArt') : $t('p_art_id_string.remixHint')"
        >
          <span class="icon icon-pen"/>
          <span>{{ isOwner ? $t('common.edit') : $t('p_art_id_string.makeYourOwnVersion') }}</span>
        </NuxtLinkLocale>
        <!-- Staff can change the piece itself, not a copy of it. Beside Remix
             rather than instead of it: a moderator fixing a stray pixel and a
             moderator making their own version are different jobs. -->
        <NuxtLinkLocale
            v-if="isAdmin && !isOwner"
            :to="`/editor?id=${route.params.id_string}&edit=1`"
            class="btn art-act-mod"
            title="Edit this artwork itself — it stays the author's"
            aria-label="Edit this artwork itself"
        >
          <span class="icon icon-pencil"/>
        </NuxtLinkLocale>
      </div>
    </Widget>
    <Widget :title="$t('common.download')">
      <div class="art-dl-list">
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
          <span>{{ $t('p_art_id_string.pngSquare') }}</span><span class="text-muted">1080×1080 · social</span>
        </button>
        <button v-if="isAnimatedArt" class="drop-item btn-split" @click="download('gif')">
          <span>{{ $t('p_art_id_string.animatedGif') }}</span><span class="text-muted">{{ animation.frames.length }} frames</span>
        </button>
        <button class="drop-item btn-split" @click="download('svg')">
          <span>{{ $t('p_art_id_string.svg') }}</span><span class="text-muted">vector</span>
        </button>
        <button class="drop-item btn-split" @click="download('pdf')">
          <span>{{ $t('p_art_id_string.pdf') }}</span><span class="text-muted">print</span>
        </button>
        <button class="drop-item btn-split" @click="download('json')">
          <span>{{ $t('p_art_id_string.json') }}</span><span class="text-muted">source</span>
        </button>
      </div>
    </Widget>
    <Widget :title="$t('p_art_id_string.meta')">
      <dl class="art-meta-side">
        <div v-if="data.user" class="art-meta-row">
          <dt>{{ $t('p_art_id_string.creator') }}</dt>
          <dd><NuxtLinkLocale :to="`/creator/${data.user.username}`" class="art-meta-link">@{{ data.user.username }}</NuxtLinkLocale></dd>
        </div>
        <div v-if="data.template_info" class="art-meta-row">
          <dt>{{ $t('p_art_id_string.remixedFrom') }}</dt>
          <dd>
            <NuxtLinkLocale :to="`/art/${data.template_info.id_string}`" class="art-meta-link">{{ data.template_info.name || $t('common.untitled') }}</NuxtLinkLocale>
            <template v-if="data.template_info.username">
              · <NuxtLinkLocale :to="`/creator/${data.template_info.username}`" class="art-meta-link">@{{ data.template_info.username }}</NuxtLinkLocale>
            </template>
          </dd>
        </div>
        <div class="art-meta-row">
          <dt>{{ $t('common.size') }}</dt>
          <dd><NuxtLinkLocale :to="`/arts/size-${data.width}x${data.height}`" class="art-meta-link">{{ data.width }}×{{ data.height }}</NuxtLinkLocale></dd>
        </div>
        <div class="art-meta-row">
          <dt>{{ $t('common.pixels') }}</dt>
          <dd>{{ Object.keys(data.map_numbers).length }}</dd>
        </div>
        <div v-if="data.colors?.length" class="art-meta-row">
          <dt>{{ $t('common.colors') }}</dt>
          <dd>{{ data.colors.length }}</dd>
        </div>
        <div class="art-meta-row">
          <dt>{{ $t('p_upload.license') }}</dt>
          <dd>
            <a v-if="license.url" :href="license.url" target="_blank" rel="license noopener" class="art-meta-link">{{ $t(`p_upload.license_${license.key}`) }}</a>
            <template v-else>{{ $t(`p_upload.license_${license.key}`) }}</template>
          </dd>
        </div>
        <div v-if="creditLine" class="art-meta-row">
          <dt>{{ $t('p_art_id_string.credit') }}</dt>
          <dd><button type="button" class="art-meta-link art-credit-btn" @click="copyCredit">{{ $t('p_art_id_string.copyCredit') }}</button></dd>
        </div>
        <div v-if="data.remixes" class="art-meta-row">
          <dt>{{ $t('p_art_id_string.remixes') }}</dt>
          <dd>{{ data.remixes }}</dd>
        </div>
        <div v-if="formattedDate" class="art-meta-row">
          <dt>{{ $t('p_art_id_string.updated') }}</dt>
          <dd>{{ formattedDate }}</dd>
        </div>
        <div v-if="data?.taxonomies && data.taxonomies.length" class="art-meta-row art-meta-row-tags">
          <dt>{{ $t('common.tags') }}</dt>
          <dd class="art-meta-tags">
            <NuxtLinkLocale
                v-for="t in data.taxonomies"
                :key="t.id_string"
                :to="`/arts/${t.id_string}`"
                class="art-meta-link"
            >{{ t.title }}</NuxtLinkLocale>
          </dd>
        </div>
      </dl>
    </Widget>
    <Widget :title="$t('common.palette')">
      <div class="art-palette">
        <NuxtLinkLocale
            v-for="item in data.colors" :key="item"
            class="art-swatch"
            :to="`/arts/color-${item.toUpperCase().replace('#', '')}`"
            :style="{'--swatch': item}"
            :title="$t('p_art_id_string.colorXFindSimilar', {x: item.toUpperCase()})"
        >
          <span class="art-swatch-color"/>
          <span class="art-swatch-hex">{{ item.toUpperCase() }}</span>
        </NuxtLinkLocale>
      </div>
      <p class="art-palette-links">
        <NuxtLinkLocale v-if="data?.palette_slug" :to="`/palettes/${data.palette_slug}`">
          {{ $t('p_art_id_string.viewThisPalette') }}
        </NuxtLinkLocale>
        <span v-if="data?.palette_slug" aria-hidden="true"> · </span>
        <NuxtLinkLocale to="/palettes">{{ $t('p_art_id_string.browseColorPalettes') }}</NuxtLinkLocale>
      </p>
    </Widget>
      <Widget v-if="data.desc" :title="$t('common.description')">
        <p class="art-desc">{{ data.desc }}</p>
      </Widget>

      <Widget :title="$t('p_art_id_string.relatedArtworks')">
        <template #ctl>
          <NuxtLinkLocale to="/arts" class="widget-ctl-btn">
            <span class="widget-ctl-name">{{ $t('p_art_id_string.browseAll') }}</span><span class="icon icon-angle-right"/>
          </NuxtLinkLocale>
        </template>
        <item-list :limit="6" exact-limit/>
      </Widget>

      <Widget>
        <p class="art-report">
          {{ $t('p_art_id_string.somethingOffAboutThisArtwork') }}
          <a :href="reportMailto" class="art-report-link">{{ $t('p_art_id_string.report') }}</a> ·
          <NuxtLinkLocale to="/dmca">{{ $t('common.dmca') }}</NuxtLinkLocale> ·
          <NuxtLinkLocale to="/guidelines">{{ $t('common.guidelines') }}</NuxtLinkLocale>
        </p>
      </Widget>

    </template>

  </ToolLayout>
</template>

<style scoped>
/* An h1 for the outline, still drawn like every other empty-state title. */
.art-not-found-title {
  font-family: inherit;
  font-variation-settings: normal;
}

.art-head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.art-like {
  font-variant-numeric: tabular-nums;
}

.art-like.is-liked {
  color: var(--danger);
  border-color: color-mix(in oklab, var(--danger) 45%, var(--border));
}

.art-credit-btn {
  padding: 0;
  background: none;
  border: 0;
  font: inherit;
  cursor: pointer;
}


.art-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
  padding: 3rem var(--space-4);
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

/* Reads as the moderator action it is, next to the button everyone gets. */
.art-act-mod {
  border-color: var(--primary);
  color: var(--primary);
}

/* Icon only, so it takes its own width and leaves the row to the main
   action beside it. */
.art-actions .art-act-mod {
  flex: 0 0 auto;
  padding-left: var(--space-3);
  padding-right: var(--space-3);
}

.art-remix-badge {
  position: absolute;
  top: var(--space-3);
  left: var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: var(--space-1) 9px var(--space-1) var(--space-2);
  font-size: var(--text-2xs);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--primary-foreground);
  background: var(--primary-fill);
  border-radius: var(--radius-pill);
}

.art-remix-badge .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.art-anim-badge {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 9px;
  font-size: var(--text-2xs);
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
  margin-top: var(--space-3);
  color: var(--muted);
  font-size: var(--text-base);
  max-width: 56ch;
}

.art-dl-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.art-dl-list .drop-item {
  padding: 6px 0;
  font-size: var(--text-xs);
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
}

.art-dl-list .btn-split {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.art-dl-list .text-muted {
  color: var(--muted);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}

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
  font-size: var(--text-2xs);
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
  font-size: var(--text-xs);
  color: var(--muted);
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

.art-meta-row-tags { align-items: flex-start; }

.art-meta-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 3px var(--space-2);
}

.art-meta-tags .art-meta-link { color: var(--primary); font-weight: 600; }

</style>
