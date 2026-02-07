<script setup lang="ts">
import type {SharedPage} from "~/types";

const domain = 'simplepixelart.com'
const route = useRoute();
const config = useRuntimeConfig()
const {data} = await useAuthFetch<SharedPage>(`/coloring/shared-pages/${route.params.id_string}/`)

const meta = computed(() => {
  const defaultDesc = ''
  const url = `https://www.${domain}/art/${data.value?.id_string}`
  let src = `${config.public.api}/coloring/files/art-original/${data.value?.id_string}.png?force=true`
  if (data.value) {
    return {
      url: url,
      title: `${data.value.name || data.value.id_string} ${data.value.width}x${data.value.height} Pixel Art`,
      desc: data.value.desc || defaultDesc,
      imgSrc: src
    }
  } else {
    return {
      url: url,
      title: 'Untitled',
      desc: defaultDesc,
      imgSrc: '/screenshot/default.png'
    }
  }
})

useHead({
  title: meta.value.title,
  meta: [{name: "description", content: meta.value.desc}]
})
</script>

<template>
  <div class="page">
    <section>
      <h1 v-if="meta?.title" class="h-center">
        <span class="icon icon-angle-right"/>
        <span>{{ meta.title }}</span>
      </h1>
      <p>{{ meta.desc }}</p>
    </section>
    <section v-if="data" class="h-center v-center bg-gray-100 p-4 border">
      <div class="w-full md:w-1/3">
        <div class="square">
          <div class="inside">
            <img
                id="mainImg"
                :src="meta.imgSrc"
                :alt="meta.title"
                class="object-contain w-full mx-auto h-full pixelated"
            >
          </div>
        </div>
      </div>
    </section>
    <div class="v-center gap-4">
      <nuxt-link :to="`/editor?id=${route.params.id_string}`" class="btn primary">
        <span>Remix</span>
      </nuxt-link>
      <div class="btn secondary">
        <span>Download</span>
      </div>
    </div>
    <section>
      <h2>
        <span class="icon icon-angle-right"/>
        <span>Meta:</span>
      </h2>
      <div v-if="data" class="meta">
        <div class="item">
          <div class="icon icon-ruler"/>
          <div>Length:</div>
          <div>{{ Object.keys(data.map_numbers).length }}</div>
        </div>
        <div class="item">
          <div class="icon icon-ruler"/>
          <div>Size:</div>
          <div>
            <nuxt-link :to="`/arts/size-${data.width}x${data.height}`">{{ data.width }}x{{ data.height }}</nuxt-link>
          </div>
        </div>
        <div class="item">
          <div class="icon icon-calender"/>
          <div>Created:</div>
          <div>{{ Object.keys(data.map_numbers).length }}</div>
        </div>
        <div class="item">
          <div class="icon icon-user"/>
          <div>By:</div>
          <div v-if="data.user">
            <nuxt-link :to="`/creator/${data.user.username}`">{{ data.user.username }}</nuxt-link>
          </div>
        </div>
      </div>
    </section>
    <section v-if="data?.taxonomies">
      <h2>
        <span class="icon icon-angle-right"/>
        <span>Tags:</span>
      </h2>
      <div class="tags">
        <div class="item" v-for="item in data.taxonomies" :key="item.id">
          <nuxt-link :to="`/arts/${item.id_string}`">{{ item.title }}</nuxt-link>
        </div>
      </div>
    </section>
    <section>
      <h2>
        <span class="icon icon-angle-right"/>
        <span>Color palette:</span>
      </h2>
      <div v-if="data?.colors" class="h-center gap-1 flex-wrap">
        <nuxt-link
            v-for="item in data.colors" :key="item"
            class="size-8"
            :to="`/arts/color-${item.toUpperCase().replace('#', '')}`"
            :style="{background: item}"
            :title="item"
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
  </div>
</template>
