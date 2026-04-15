<script setup lang="ts">
import type {SharedPage} from "~/types";
import {editorDataToJSON, editorDataToSVG} from "~/helper/canvas";
import {sharedPage2EditorData} from "~/helper/utils";

const route = useRoute();
const config = useRuntimeConfig()
const {data, pending, error} = await useAuthFetch<SharedPage>(`/coloring/shared-pages/${route.params.id_string}/`)

const meta = computed(() => {
  if (!data.value) {
    return {
      url: `${config.public.siteUrl}/art/${route.params.id_string}`,
      title: 'Loading...',
      desc: 'Loading pixel art...',
      imgSrc: '/screenshot/default.png'
    }
  }

  const url = `${config.public.siteUrl}/art/${data.value.id_string}`
  const imgSrc = `${config.public.api}/coloring/files/art-social/${data.value.id_string}.png`
  const imgSrcOrigin = `${config.public.api}/coloring/files/art-preview/${data.value.id_string}.png`
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

const download = (type: string) => {
  const base = `${config.public.api}/coloring/files`
  let url: string | undefined = ''
  let ext: string = 'png'
  if (['preview', 'original', 'pdf'].includes(type)) {
    if (type === 'pdf') {
      url = base + `/art-preview/${data.value!.id_string}.pdf`
      ext = 'pdf'
    } else if (type === 'preview') {
      url = base + `/art-preview/${data.value!.id_string}.png`
    } else {
      url = base + `/art-original/${data.value!.id_string}.png`
    }
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
                  :src="`${config.public.api}/coloring/files/art-original/${data!.id_string}.png`"
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
      <!-- Enhanced action buttons -->
      <div class="v-center gap-4">
        <nuxt-link
            :to="`/editor?id=${route.params.id_string}`"
            class="btn primary hover:shadow-lg transition-shadow"
            title="Remix this pixel art in the editor"
        >
          <span class="icon icon-brush"/>
          <span>Remix</span>
        </nuxt-link>
       <ui-dropdown-menu>
          <button class="btn secondary hover:shadow-lg transition-shadow" :disabled="!data">
            <span class="icon icon-download"/>
            <span>Download</span>
          </button>
          <template #menu>
            <div class="flex flex-col divide-y">
              <button
                  class="btn justify-between" title="Download original pixel art"
                  @click="download('original')"
              >
                <span>Original</span>
                <span class="text-gray-500">[{{ data.width }}×{{ data.height }}]</span>
              </button>
              <button
                  class="btn justify-between" title="Download preview pixel art"
                  @click="download('preview')"
              >
                <span>Preview</span>
                <span class="text-gray-500">[600×{{ 600 * data.height / data.width }}]</span>
              </button>
              <button
                  class="btn" title="Download SVG pixel art"
                  @click="download('svg')">SVG
              </button>
              <button
                  class="btn"
                  title="Download PDF pixel art"
                  @click="download('pdf')">PDF
              </button>
              <button
                  class="btn" title="Download JSON pixel art"
                  @click="download('json')">JSON
              </button>
           </div>
          </template>
        </ui-dropdown-menu>
        <SocialSharing :meta="meta" />
       </div>
      <section>
        <h2>
          <span class="icon icon-angle-right"/>
          <span>Artwork Details</span>
        </h2>
        <div v-if="data" class="meta">
          <div class="item">
            <div class="icon icon-ruler"/>
            <div>Pixel Count:</div>
            <div><strong>{{ Object.keys(data.map_numbers).length }}</strong> pixels</div>
          </div>
          <div class="item">
            <div class="icon icon-ruler"/>
            <div>Canvas Size:</div>
            <div>
              <nuxt-link :to="`/arts/size-${data.width}x${data.height}`">
                {{ data.width }}×{{ data.height }}
              </nuxt-link>
            </div>
          </div>
          <div class="item">
            <div class="icon icon-calender"/>
            <div>Last Updated:</div>
            <div>{{ new Date(data.updated).toLocaleDateString() }}</div>
          </div>
        </div>
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
