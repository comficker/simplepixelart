<script setup lang="ts">
import type {APIResponse, TagSchema, ResponseSharedPage} from "~/types";

const {data} = useAuthFetch<APIResponse<TagSchema>>('/coloring/tags/', {
  params: {
    page_size: 10
  }
})

const {data: templates} = useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
  params: {
    status: 'public',
    page_size: 12,
    ordering: '-remix_count'
  }
})

const sizes = ["8x8", "9x9", "10x10", "12x12", "13x13", "16x16", "20x20", "24x24", "32x32", "64x64"];

useCustomSeoMeta({
  title: "Simple Pixel Art — Free Online Pixel Art Maker & Editor",
  description: "Simple Pixel Art is a free online pixel art maker. Draw, convert photos, remix templates, and share pixel art in seconds — no signup, no skill required. Thousands of artworks updated daily.",
  keywords: "simple pixel art, simplepixelart, pixel art, pixel art maker, pixel art editor, free pixel art, pixel art online, pixel drawing tool, pixel art generator, 8-bit art, 16-bit art, retro art, create pixel art",
  canonical: "https://simplepixelart.com",
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            name: "Simple Pixel Art",
            alternateName: "SimplePixelArt.com",
            description: "Free online pixel art maker and community — create, convert, remix, and share pixel art in seconds.",
            url: "https://simplepixelart.com/",
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: "https://simplepixelart.com/arts?search={search_term_string}"
              },
              "query-input": "required name=search_term_string"
            },
            publisher: {
              "@type": "Organization",
              name: "Simple Pixel Art",
              url: "https://simplepixelart.com/",
              logo: "https://simplepixelart.com/favicon.png"
            }
          },
          {
            "@type": "WebApplication",
            name: "Simple Pixel Art Editor",
            applicationCategory: "GraphicsApplication",
            operatingSystem: "Any (browser-based)",
            url: "https://simplepixelart.com/editor",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD"
            }
          },
          {
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "What is Simple Pixel Art?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Simple Pixel Art is a free online pixel art maker. You can draw from scratch, convert any photo to pixel art, remix community templates, and share your work — all in your browser with no signup."
                }
              },
              {
                "@type": "Question",
                name: "Is Simple Pixel Art free?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes, Simple Pixel Art is completely free. No account, no watermark, no downloads required. Everything runs in the browser."
                }
              },
              {
                "@type": "Question",
                name: "Do I need any design skill to use Simple Pixel Art?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "No. Pick a template and remix it, or convert a photo into pixel art with one click. You can publish your first pixel art in under a minute."
                }
              }
            ]
          }
        ]
      })
    }
  ]
});
</script>

<template>
  <div class="page">
    <section class="hero">
      <div class="h-center v-center gap-2 md:gap-4">
        <img class="size-6 md:size-8" src="/favicon.png" alt="Simple Pixel Art logo" width="32" height="32">
        <h1 class="hero-title">Simple Pixel Art</h1>
      </div>
      <p class="hero-sub">The free online pixel art maker. Draw, convert, remix, share — in seconds.</p>
    </section>

    <!-- Feature buttons -->
    <div class="feature-grid">
      <nuxt-link to="/editor?new=true" class="feature-btn">
        <span class="icon icon-brush"/>
        <div>
          <strong>Create</strong>
          <span>Open editor, draw from scratch</span>
        </div>
      </nuxt-link>
      <nuxt-link to="/convert" class="feature-btn">
        <span class="icon icon-adjust"/>
        <div>
          <strong>Convert</strong>
          <span>Turn any image into pixel art</span>
        </div>
      </nuxt-link>
      <nuxt-link to="/arts" class="feature-btn">
        <span class="icon icon-discovery"/>
        <div>
          <strong>Discover</strong>
          <span>Browse community artworks</span>
        </div>
      </nuxt-link>
      <nuxt-link to="/work" class="feature-btn">
        <span class="icon icon-grid"/>
        <div>
          <strong>Your work</strong>
          <span>View and manage your artworks</span>
        </div>
      </nuxt-link>
    </div>

    <!-- Template picker -->
    <Widget title="Pick a template & remix">
      <div v-if="templates?.results" class="results">
        <ItemCard v-for="(item, i) in templates.results" :key="item.id" :value="item" :isRemix="true" :priority="i < 6"/>
      </div>
    </Widget>

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

    <details class="info-section" open>
      <summary class="info-heading">Why Simple Pixel Art?</summary>
      <p>Simple Pixel Art is built on one idea: <strong>anyone should be able to make pixel art in seconds</strong>. No installation, no account, no learning curve. Open the site, pick a template, remix it — or convert any photo into pixel art with one click. If you want to go deeper, the advanced editor has layers, mirror drawing, selections, and a full palette manager.</p>
      <p>The entire Simple Pixel Art platform runs in your browser. Your work saves automatically to local storage when signed out, and syncs to the cloud when you log in with Google.</p>
    </details>

    <details class="info-section">
      <summary class="info-heading">What is Pixel Art?</summary>
      <p>Pixel art is a form of digital art where images are created and edited at the pixel level — the smallest unit of a digital image. Originating from early video games and computer graphics of the 1970s–80s, pixel art has grown into a beloved creative medium celebrated for its clarity, charm, and nostalgic aesthetic. Every pixel is placed intentionally, giving artists full control over the final result with minimal tools.</p>
    </details>

    <details class="info-section">
      <summary class="info-heading">How Simple Pixel Art works</summary>
      <p>Three ways to start with Simple Pixel Art:</p>
      <ul class="info-list">
        <li><strong>Remix a template.</strong> Browse hundreds of pixel arts on the home page and click any one to open it in the editor and make it yours.</li>
        <li><strong>Convert a photo.</strong> Use the <nuxt-link to="/convert">Image to Pixel Art converter</nuxt-link> to turn any photo into pixel art with adjustable size and palette.</li>
        <li><strong>Draw from scratch.</strong> Open the <nuxt-link to="/editor">editor</nuxt-link>, pick a canvas size from 8×8 up to 64×64, and start painting pixels.</li>
      </ul>
    </details>

    <details class="info-section">
      <summary class="info-heading">Frequently asked questions</summary>
      <div class="faq-item">
        <strong>Is Simple Pixel Art free?</strong>
        <p>Yes. Simple Pixel Art is 100% free with no watermark, no signup, and no downloads required.</p>
      </div>
      <div class="faq-item">
        <strong>Do I need to create an account?</strong>
        <p>No. You can draw, convert, and download without an account. Log in with Google to share publicly and sync across devices.</p>
      </div>
      <div class="faq-item">
        <strong>Can I sell or use the pixel art I create?</strong>
        <p>Yes. You own the pixel art you create on Simple Pixel Art. Use it in your game, NFT collection, profile avatar, merchandise, or anywhere else.</p>
      </div>
    </details>

    <details class="info-section">
      <summary class="info-heading">How to Draw Pixel Art</summary>
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
    </details>

    <details class="info-section">
      <summary class="info-heading">Applications of Pixel Art</summary>
      <ul class="info-list">
        <li><strong>Game development</strong> — Pixel art is the foundation of countless indie games. Sprites, tilesets, UI elements, and backgrounds are all commonly created in pixel art style.</li>
        <li><strong>NFTs and digital collectibles</strong> — Collections like CryptoPunks popularized pixel art as a format for digital ownership and collectibles.</li>
        <li><strong>Avatars and profile pictures</strong> — Pixel art avatars are a popular choice for social media profiles, Discord servers, and online communities.</li>
        <li><strong>Animation</strong> — Frame-by-frame pixel animation is used in games, web graphics, and social media content to create expressive, retro-style motion.</li>
        <li><strong>Merchandise and print</strong> — Due to its clean geometry, pixel art scales perfectly onto clothing, stickers, posters, and enamel pins.</li>
        <li><strong>Education</strong> — Pixel art is widely used in schools and coding bootcamps to teach design fundamentals, color theory, and creative thinking alongside programming.</li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.hero {
  @apply text-center py-4 md:py-6;
}

.hero-title {
  @apply text-lg md:text-4xl;
}

.hero-actions {
  @apply flex justify-center gap-2 mt-3 md:mt-4;
}

.hero-sub {
  @apply text-xs mt-2;
  color: var(--muted);
}

.faq-item {
  @apply py-2;
}

.faq-item strong {
  @apply text-xs block;
  color: var(--foreground);
}

.faq-item p {
  @apply text-xs mt-1 leading-relaxed;
  color: var(--muted);
}

.feature-grid {
  @apply grid grid-cols-2 md:grid-cols-4 gap-2;
}

.feature-btn {
  @apply flex items-start gap-3 p-3;
  background: var(--surface);
  border: 2px solid var(--shadow-px);
  box-shadow: 3px 3px 0 0 var(--shadow-px);
  transition: transform 80ms steps(2), box-shadow 80ms steps(2);
  color: var(--foreground);
}

.feature-btn:hover {
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 0 var(--shadow-px);
  border-color: var(--primary);
  color: var(--primary);
}

.feature-btn .icon {
  flex-shrink: 0;
  font-size: 24px;
  color: var(--primary);
  margin-top: 2px;
}

.feature-btn > div {
  @apply flex flex-col flex-1;
}

.feature-btn strong {
  @apply text-sm uppercase;
  letter-spacing: 0.06em;
}

.feature-btn span {
  @apply text-xs mt-0.5;
  color: var(--muted);
}

.info-section {
  @apply py-2;
  border-top: 1px solid var(--border);
}

.info-section[open] {
  @apply space-y-3;
}

.info-heading {
  @apply text-sm font-bold flex items-center cursor-pointer;
  color: var(--foreground);
}

.info-list {
  @apply space-y-2 list-none;
}

.info-list li {
  @apply text-xs leading-relaxed;
  color: var(--foreground);
}
</style>
