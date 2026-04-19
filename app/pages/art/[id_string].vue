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
</script>

<template>
  <div class="page">
    <!-- Loading state -->
    <div v-if="pending" class="h-center v-center" style="min-height: 400px;">
      <div class="text-center">
        <div class="loading-spinner"></div>
        <p class="mt-4">Loading pixel art...</p>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error || !data" class="h-center v-center" style="min-height: 400px;">
      <div class="text-center">
        <h2>Artwork Not Found</h2>
        <p>This pixel art couldn't be found or may have been removed.</p>
        <nuxt-link to="/arts" class="btn primary mt-4">
          Browse Other Artworks
        </nuxt-link>
      </div>
    </div>
    <!-- Main content -->
    <template v-else>
      <section class="h-center v-center flex-col bg-gray-100 p-4 gap-4 border">
        <div class="w-full md:w-1/3">
          <div class="square">
            <div class="inside">
              <img
                  id="mainImg"
                  :src="imgOriginal"
                  :alt="data.name || `${data.width}x${data.height} Pixel Art`"
                  class="object-contain w-full mx-auto h-full pixelated"
                  loading="eager"
                  :width="data.width"
                  :height="data.height"
              >
            </div>
          </div>
          <!-- Artwork stats -->
        </div>
        <div class="text-center text-sm text-gray-600 w-full">
          <h1 class="text-2xl">{{ data.name || `${data.width}x${data.height} Pixel Art` }}</h1>
          <p class="text-xs">{{ data.desc || 'A beautiful pixel art creation.' }}</p>
          <div class="flex justify-center gap-4 mb-2">
            <span><strong>{{ Object.keys(data.map_numbers).length }}</strong> pixels</span>
          </div>
          <div v-if="data.user" class="h-center v-center text-xs gap-2">
            <span>Created by</span>
            <nuxt-link :to="`/creator/${data.user.username}`">
              {{ data.user.username }}
            </nuxt-link>
          </div>
        </div>
      </section>
      <!-- Remix chain -->
      <div v-if="data.template" class="remix-chain">
        <span class="icon icon-brush"/>
        <span class="text-xs">Remixed from another artwork</span>
      </div>

      <!-- Primary action: Remix / Edit -->
      <div class="viewer-actions">
        <nuxt-link
            :to="`/editor?id=${route.params.id_string}`"
            class="btn primary flex-1 justify-center"
            :title="isOwner ? 'Edit this pixel art in the editor' : 'Remix this pixel art in the editor'"
        >
          <span class="icon icon-brush"/>
          <span>{{ isOwner ? 'Edit This' : 'Remix This' }}</span>
        </nuxt-link>
        <nuxt-link to="/editor" class="btn flex-1 justify-center">
          <span class="icon icon-plus"/>
          <span>Create New</span>
        </nuxt-link>
      </div>

      <!-- Share & Download -->
      <div class="viewer-share-grid" :class="{'has-native': canShareImage}">
        <button
            v-if="canShareImage"
            class="social-btn"
            :disabled="sharing"
            @click="shareImage"
        >
          <span class="icon icon-social"/>
          <span>{{ sharing ? '…' : 'Share' }}</span>
        </button>
        <a :href="socialUrls.twitter" target="_blank" rel="noopener noreferrer" class="social-btn">
          <span class="icon icon-x"/>
          <span>Twitter</span>
        </a>
        <a :href="socialUrls.reddit" target="_blank" rel="noopener noreferrer" class="social-btn">
          <span class="icon icon-reddit"/>
          <span>Reddit</span>
        </a>
        <a :href="socialUrls.pinterest" target="_blank" rel="noopener noreferrer" class="social-btn">
          <span class="icon icon-pinterest"/>
          <span>Pinterest</span>
        </a>
        <ui-dropdown-menu>
          <div class="social-btn">
            <span class="icon icon-download"/>
            <span>Download</span>
          </div>
          <template #menu>
            <div class="flex flex-col divide-y">
              <button class="btn justify-between" @click="download('original')">
                <span>Original</span>
                <span class="text-gray-500">[{{ data.width }}×{{ data.height }}]</span>
              </button>
              <button class="btn justify-between" @click="download('preview')">
                <span>Preview</span>
                <span class="text-gray-500">[600×{{ Math.round(600 * data.height / data.width) }}]</span>
              </button>
              <button class="btn" @click="download('svg')">SVG</button>
              <button class="btn" @click="download('pdf')">PDF</button>
              <button class="btn" @click="download('json')">JSON</button>
            </div>
          </template>
        </ui-dropdown-menu>
      </div>

      <section>
        <h2>
          <span class="icon icon-angle-right"/>
          <span>Artwork Details</span>
        </h2>
        <dl v-if="data" class="details-grid">
          <div class="details-row">
            <dt><span class="icon icon-ruler"/> Pixels</dt>
            <dd>{{ Object.keys(data.map_numbers).length }}</dd>
          </div>
          <div class="details-row">
            <dt><span class="icon icon-ruler"/> Size</dt>
            <dd>
              <nuxt-link :to="`/arts/size-${data.width}x${data.height}`">
                {{ data.width }}×{{ data.height }}
              </nuxt-link>
            </dd>
          </div>
          <div class="details-row">
            <dt><span class="icon icon-calender"/> Updated</dt>
            <dd>{{ new Date(data.updated).toLocaleDateString() }}</dd>
          </div>
        </dl>
      </section>
      <section v-if="data?.taxonomies && data.taxonomies.length > 0">
        <h2>
          <span class="icon icon-angle-right"/>
          <span>Tags & Categories</span>
        </h2>
        <div class="tags">
          <div class="item" v-for="item in data.taxonomies" :key="item.id">
            <nuxt-link :to="`/arts/${item.id_string}`" class="transition-colors">
              {{ item.title }}
            </nuxt-link>
          </div>
        </div>
      </section>
      <section v-if="data?.colors && data.colors.length > 0">
        <h2>
          <span class="icon icon-angle-right"/>
          <span>Color Palette ({{ data.colors.length }} colors)</span>
        </h2>
        <div class="h-center gap-1 flex-wrap">
          <nuxt-link
              v-for="item in data.colors" :key="item"
              class="size-8 group"
              :to="`/arts/color-${item.toUpperCase().replace('#', '')}`"
              :style="{background: item}"
              :title="`Color: ${item} - Find similar artworks`"
          >
            <span class="opacity-0">{{ item }}</span>
          </nuxt-link>
        </div>
      </section>
      <section>
        <h2>
          <span class="icon icon-angle-right"/>
          <span>Related:</span>
        </h2>
        <item-list :limit="6"/>
      </section>
    </template>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.remix-chain {
  @apply flex items-center gap-2 px-3 py-2 text-xs;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
}

.viewer-actions {
  @apply flex gap-2;
}

.viewer-share-grid {
  @apply grid grid-cols-2 md:grid-cols-4 gap-1;
}

.viewer-share-grid.has-native {
  @apply md:grid-cols-5;
}

@media (max-width: 767px) {
  .viewer-actions {
    @apply flex-col;
  }
}

.details-grid {
  @apply grid grid-cols-1 md:grid-cols-3 gap-2;
}

.details-row {
  @apply flex flex-col gap-1 px-3 py-2;
  background: var(--surface);
  border: 1px solid var(--border);
}

.details-row dt {
  @apply flex items-center gap-2 text-xs;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.details-row dd {
  @apply text-base;
  color: var(--foreground);
}

.details-row dd a {
  color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .details-row dd a:hover {
    color: var(--secondary);
  }
}
</style>
