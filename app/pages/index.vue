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
        <img class="size-8" src="/favicon.png" alt="Simple Pixel Art logo" width="32" height="32">
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

    <section class="info-section">
      <h2 class="info-heading">What is Pixel Art?</h2>
      <p>Pixel art is a form of digital art where images are created and edited at the pixel level — the smallest unit of a digital image. Originating from early video games and computer graphics of the 1970s–80s, pixel art has grown into a beloved creative medium celebrated for its clarity, charm, and nostalgic aesthetic. Every pixel is placed intentionally, giving artists full control over the final result with minimal tools.</p>
    </section>

    <section class="info-section">
      <h2 class="info-heading">Our Mission</h2>
      <p>SimplePixelArt.com was built with one goal: make pixel art creation accessible to everyone. No software to install, no account required to start drawing. Just open the editor and create. We believe great tools should be simple, fast, and free — whether you're a professional game artist or someone who just wants to draw a tiny cat for fun.</p>
    </section>

    <section class="info-section">
      <h2 class="info-heading">How to Draw Pixel Art</h2>
      <ul class="info-list">
        <li><strong>Choose your canvas size.</strong> Beginners should start small — 16×16 or 32×32 pixels is ideal for learning. Larger canvases like 64×64 allow more detail.</li>
        <li><strong>Pick a limited palette.</strong> Great pixel art often uses fewer than 16 colors. A constrained palette forces creative decisions and keeps the artwork cohesive.</li>
        <li><strong>Sketch the silhouette first.</strong> Block out the shape of your subject before adding details. A strong silhouette makes pixel art readable at any size.</li>
        <li><strong>Add shading with dithering.</strong> Pixel artists use dithering — alternating two colors in a checkerboard pattern — to create the illusion of gradients without extra colors.</li>
        <li><strong>Use the mirror tool.</strong> For symmetric subjects like characters or icons, enable horizontal mirroring to draw both sides simultaneously.</li>
        <li><strong>Iterate and zoom out.</strong> Zoom out regularly to see how your artwork looks at actual size. Details that seem important up close often disappear — simplify where needed.</li>
      </ul>
      <div class="mt-3">
        <nuxt-link to="/editor" class="btn primary">Open the Editor</nuxt-link>
      </div>
    </section>

    <section class="info-section">
      <h2 class="info-heading">Applications of Pixel Art</h2>
      <ul class="info-list">
        <li><strong>Game development</strong> — Pixel art is the foundation of countless indie games. Sprites, tilesets, UI elements, and backgrounds are all commonly created in pixel art style.</li>
        <li><strong>NFTs and digital collectibles</strong> — Collections like CryptoPunks popularized pixel art as a format for digital ownership and collectibles.</li>
        <li><strong>Avatars and profile pictures</strong> — Pixel art avatars are a popular choice for social media profiles, Discord servers, and online communities.</li>
        <li><strong>Animation</strong> — Frame-by-frame pixel animation is used in games, web graphics, and social media content to create expressive, retro-style motion.</li>
        <li><strong>Merchandise and print</strong> — Due to its clean geometry, pixel art scales perfectly onto clothing, stickers, posters, and enamel pins.</li>
        <li><strong>Education</strong> — Pixel art is widely used in schools and coding bootcamps to teach design fundamentals, color theory, and creative thinking alongside programming.</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.info-section {
  @apply space-y-3 py-2 border-t border-gray-100;
}

.info-heading {
  @apply text-sm font-bold text-gray-700 flex items-center;
}

.info-list {
  @apply space-y-2 list-none;
}

.info-list li {
  @apply text-xs text-gray-600 leading-relaxed;
}
</style>
