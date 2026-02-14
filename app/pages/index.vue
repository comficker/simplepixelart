<script setup lang="ts">
import type {APIResponse, TagSchema} from "~/types";

const {data} = useAuthFetch<APIResponse<TagSchema>>('/coloring/tags/', {
  params: {
    page_size: 10
  }
})

const sizes = ["8x8", "9x9", "10x10", "12x12", "13x13", "16x16", "20x20", "24x24", "32x32", "64x64"];

useCustomSeoMeta({
  title: "Simple Pixel Art - Create & Discover Pixel Art Online",
  description: "Create and discover amazing pixel art online. Free pixel art editor with advanced tools, daily updates, and a vibrant community of creators. Start your pixel art journey today!",
  keywords: "pixel art, pixel editor, pixel art maker, create pixel art, pixel art online, retro art, 8-bit art, pixel drawing",
  canonical: "https://simplepixelart.com",
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Simple Pixel Art",
        description: "Create and discover amazing pixel art online. Free pixel art editor with advanced tools and vibrant community.",
        url: "https://simplepixelart.com/",
        potentialAction: {
          "@type": "CreateAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: "https://simplepixelart.com/editor"
          }
        },
        mainEntity: {
          "@type": "CreativeWork",
          name: "Pixel Art Creator",
          description: "Online pixel art editor and gallery"
        },
        publisher: {
          "@type": "Organization",
          name: "SimplePixelArt.com",
          url: "https://simplepixelart.com/"
        }
      })
    }
  ]
});
</script>

<template>
  <div class="page">
    <section class="text-center py-6">
      <div class="h-center v-center gap-4">
        <img class="size-8" src="/favicon.png" alt="">
        <h1 class="text-2xl md:text-4xl">Simple Pixel Art</h1>
      </div>
      <p class="text-xs">Discover trending pixel arts updated daily.</p>
      <div class="v-center mt-4">
        <nuxt-link to="/editor" class="btn primary">
          <span class="icon icon-brush"/>
          <span>Editor</span>
        </nuxt-link>
        <nuxt-link to="/arts" class="btn">
          <span class="icon icon-discovery"/>
          <span>Discover</span>
        </nuxt-link>
      </div>
    </section>
    <Widget title="New">
      <item-list :limit="6"/>
    </Widget>
    <Widget title="Tags:">
      <div class="tags">
        <div class="item" v-for="item in data?.results" :key="item.id">
          <nuxt-link :to="`/arts/${item.id_string}`">{{ item.title }}</nuxt-link>
        </div>
      </div>
    </Widget>
    <Widget title="Sizes:">
      <div class="tags">
        <div class="item" v-for="item in sizes" :key="item">
          <nuxt-link :to="`/arts/size-${item}`">{{ item }}</nuxt-link>
        </div>
      </div>
    </Widget>
  </div>
</template>
