<script setup lang="ts">
import type {APIResponse, EditorData, SharedPage, ResponseSharedPage} from "~/types";
import {getStorageItem} from "~/helper/utils";

type WorkItem = (SharedPage | EditorData) & {
  id: string | number
  id_string?: string
  name?: string
  width?: number
  height?: number
}

const auth = useAuthStore()
const config = useRuntimeConfig()

const userWorks = ref<WorkItem[]>([])
const loadingWorks = ref(true)

const hasWorks = computed(() => userWorks.value.length > 0)

const greetingName = computed(() => {
  if (!auth.logged) return ''
  return auth.logged.username || auth.logged.first_name || 'pixel artist'
})

function isCloudWork(item: WorkItem): boolean {
  return typeof item.id === 'number' && !!item.id_string
}

function workThumbUrl(item: WorkItem): string {
  return `${config.public.api}/coloring/files/art-original/${item.id_string}.png`
}

async function loadUserWorks() {
  loadingWorks.value = true
  try {
    if (auth.logged?.id) {
      const res = await useNativeFetch<APIResponse<SharedPage>>('/coloring/shared-pages/', {
        params: {
          user: auth.logged.username,
          page_size: 3,
          is_template: true,
          ordering: '-updated',
        },
      })
      userWorks.value = res.results as WorkItem[]
    } else {
      const ws = Object.values(getStorageItem('workspaces')) as EditorData[]
      userWorks.value = (ws
          .filter(w => w && w.id)
          .sort((a: any, b: any) => (b.updated || 0) - (a.updated || 0))
          .slice(0, 3)) as WorkItem[]
    }
  } finally {
    loadingWorks.value = false
  }
}

const {data: templates} = useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
  params: {
    status: 'public',
    page_size: 5,
    ordering: '-remix_count'
  }
})

const sizes = ["8x8", "9x9", "10x10", "12x12", "13x13", "16x16", "20x20", "24x24", "32x32", "64x64"];

onMounted(() => {
  loadUserWorks()
})

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
  <div class="page home">
    <!-- Hero -->
    <section class="home-hero">
      <div class="home-hero-inner">
        <span class="home-hero-eyebrow">
          <span class="home-hero-eyebrow-dot" aria-hidden="true"/>
          Free · No signup · Runs in your browser
        </span>
        <h1 class="home-hero-title">
          <span class="home-hero-title-main">Make pixel art</span>
          <span class="home-hero-title-accent">in seconds.</span>
        </h1>
        <p class="home-hero-tagline">
          Draw from scratch, convert any photo into pixel art, or remix templates from a community library — all in one place.
        </p>
        <div class="home-hero-ctas">
          <nuxt-link to="/editor?new=true" class="btn primary home-hero-cta-primary">
            <span class="icon icon-brush"/>
            <span>Start drawing</span>
          </nuxt-link>
          <nuxt-link to="/arts" class="btn home-hero-cta-secondary">
            <span class="icon icon-search"/>
            <span>Browse gallery</span>
          </nuxt-link>
        </div>
        <p v-if="auth.logged" class="home-hero-greeting">
          Welcome back, <span class="home-hero-name">@{{ greetingName }}</span>
        </p>
        <ul class="home-hero-stats" aria-label="Highlights">
          <li>
            <strong>8×8 → 64×64</strong>
            <span>canvas sizes</span>
          </li>
          <li>
            <strong>One-click</strong>
            <span>photo → pixel art</span>
          </li>
          <li>
            <strong>Layered</strong>
            <span>editor with mirror</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Studio: personalization core -->
    <section class="studio">
      <header class="section-head">
        <h2 class="section-title">
          {{ auth.logged ? 'Your studio' : 'Start a project' }}
        </h2>
        <nuxt-link v-if="hasWorks" to="/work" class="section-link">View all →</nuxt-link>
      </header>

      <!-- Has recent works: grid -->
      <div v-if="hasWorks" class="studio-grid">
        <nuxt-link to="/editor?new=true" class="studio-new" title="New blank canvas">
          <span class="icon icon-plus studio-new-icon"/>
          <span class="studio-new-label">New canvas</span>
        </nuxt-link>
        <nuxt-link
            v-for="item in userWorks"
            :key="item.id as any"
            :to="`/editor?id=${item.id_string || item.id}`"
            class="studio-card"
            :title="item.name || 'Untitled'"
        >
          <div class="studio-canvas">
            <div class="square">
              <div class="inside p-2">
                <img
                    v-if="isCloudWork(item)"
                    :src="workThumbUrl(item)"
                    :alt="item.name || 'Pixel art'"
                    class="size-full"
                    loading="lazy"
                    decoding="async"
                />
                <Thumb v-else :data="item as EditorData"/>
              </div>
            </div>
          </div>
          <div class="studio-card-meta">
            <span class="studio-card-name">{{ item.name || 'Untitled' }}</span>
            <span class="studio-card-size">{{ item.width }}×{{ item.height }}</span>
          </div>
        </nuxt-link>
      </div>

      <!-- Loading skeleton -->
      <div v-else-if="loadingWorks" class="studio-loading">
        <div v-for="i in 4" :key="i" class="skeleton skeleton-square"/>
      </div>

      <!-- Empty: 3-path warm CTA -->
      <div v-else class="studio-empty">
        <p class="studio-empty-caption">Three ways to start — pick what feels right:</p>
        <div class="studio-paths">
          <nuxt-link to="/editor?new=true" class="studio-path">
            <span class="studio-path-icon icon icon-brush"/>
            <span class="studio-path-title">Pixel art editor</span>
            <span class="studio-path-desc">Open a blank canvas with layers, mirror drawing, and a full palette — sized from 8×8 to 64×64.</span>
            <span class="studio-path-cta">Start drawing →</span>
          </nuxt-link>
          <nuxt-link to="/convert" class="studio-path">
            <span class="studio-path-icon icon icon-image"/>
            <span class="studio-path-title">Image to pixel art</span>
            <span class="studio-path-desc">Drop any photo and turn it into pixel art with adjustable size and palette.</span>
            <span class="studio-path-cta">Convert a photo →</span>
          </nuxt-link>
          <nuxt-link to="/arts" class="studio-path">
            <span class="studio-path-icon icon icon-discovery"/>
            <span class="studio-path-title">Browse pixel arts</span>
            <span class="studio-path-desc">Explore the community library and remix any piece to make it your own.</span>
            <span class="studio-path-cta">Open gallery →</span>
          </nuxt-link>
        </div>
      </div>
    </section>

    <!-- Library: templates -->
    <section id="templates" class="library">
      <header class="section-head">
        <h2 class="section-title">Templates to remix</h2>
        <nuxt-link to="/arts" class="section-link">Browse all →</nuxt-link>
      </header>
      <div v-if="templates?.results" class="results">
        <ItemCard
            v-for="(item, i) in templates.results"
            :key="item.id"
            :value="item"
            :isRemix="true"
            :priority="i < 5"
        />
      </div>
    </section>

    <!-- Library: new -->
    <section class="library">
      <header class="section-head">
        <h2 class="section-title">What's new</h2>
        <nuxt-link to="/arts/new" class="section-link">View all →</nuxt-link>
      </header>
      <item-list :limit="5" status="public,pending"/>
    </section>

    <ClientOnly>
      <AdSlot slot="6499761093"/>
    </ClientOnly>

    <!-- Library: browse chips -->
    <section class="library">
      <header class="section-head">
        <h2 class="section-title">Browse</h2>
        <nuxt-link to="/arts" class="section-link">All tags →</nuxt-link>
      </header>
      <div class="browse-row">
        <span class="browse-label">Sizes</span>
        <div class="chip-strip no-scrollbar">
          <nuxt-link
              v-for="item in sizes"
              :key="item"
              :to="`/arts/size-${item}`"
              class="chip"
          >{{ item }}</nuxt-link>
        </div>
      </div>
    </section>

    <!-- Questions & answers -->
    <section class="learn-more">
      <header class="section-head">
        <h2 class="section-title">Questions & answers</h2>
        <span class="section-link">Tap a question to expand</span>
      </header>

      <div class="qa-list">
        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">Why use Simple Pixel Art?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>Anyone should be able to make pixel art in seconds — no installation, no account, no learning curve. Pick a template, remix it, or convert any photo into pixel art with one click. For deeper work, the editor has layers, mirror drawing, selections, and a full palette manager.</p>
            <p>The entire platform runs in your browser. Your work saves automatically to local storage when signed out, and syncs to the cloud when you log in with Google.</p>
          </div>
        </details>

        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">What is pixel art?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>Pixel art is a form of digital art where images are created and edited at the pixel level — the smallest unit of a digital image. Originating from early video games of the 1970s–80s, pixel art has grown into a beloved medium celebrated for its clarity, charm, and nostalgic aesthetic. Every pixel is placed intentionally, giving artists full control with minimal tools.</p>
          </div>
        </details>

        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">How do I get started?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>Three paths to your first pixel art:</p>
            <ul>
              <li><strong>Remix a template.</strong> Browse the library on the home page and click any artwork to open it in the editor.</li>
              <li><strong>Convert a photo.</strong> Use the <nuxt-link to="/convert">image-to-pixel-art converter</nuxt-link> to turn any photo into pixel art with adjustable size and palette.</li>
              <li><strong>Draw from scratch.</strong> Open the <nuxt-link to="/editor">editor</nuxt-link>, pick a canvas size from 8×8 to 64×64, and start painting.</li>
            </ul>
          </div>
        </details>

        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">Is Simple Pixel Art free?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>Yes. Simple Pixel Art is 100% free — no watermark, no signup, no downloads required.</p>
          </div>
        </details>

        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">Do I need an account?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>No. You can draw, convert, and download without an account. Log in with Google to share publicly and sync your work across devices.</p>
          </div>
        </details>

        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">Can I sell or use what I create?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>Yes. You own the pixel art you create here. Use it in your game, NFT collection, profile avatar, merchandise, or anywhere else.</p>
          </div>
        </details>

        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">How do I draw good pixel art?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <ul>
              <li><strong>Start small.</strong> 16×16 or 32×32 is ideal for learning. Larger canvases like 64×64 allow more detail.</li>
              <li><strong>Pick a limited palette.</strong> Great pixel art often uses fewer than 16 colors. Constraints force creative decisions and keep work cohesive.</li>
              <li><strong>Sketch the silhouette first.</strong> A strong silhouette makes pixel art readable at any size.</li>
              <li><strong>Add shading with dithering.</strong> Alternate two colors in a checkerboard pattern to fake gradients without extra colors.</li>
              <li><strong>Use the mirror tool.</strong> For symmetric subjects like characters or icons, enable horizontal mirroring to draw both sides at once.</li>
              <li><strong>Iterate and zoom out.</strong> Check actual size often — details that pop up close usually disappear.</li>
            </ul>
          </div>
        </details>

        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">What is pixel art used for?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <ul>
              <li><strong>Game development</strong> — sprites, tilesets, UI, and backgrounds for indie games.</li>
              <li><strong>NFTs and collectibles</strong> — pixel art has become a signature format for digital ownership.</li>
              <li><strong>Avatars and profile pictures</strong> — popular on Discord, social media, and online communities.</li>
              <li><strong>Animation</strong> — frame-by-frame motion for games, web graphics, and short clips.</li>
              <li><strong>Merchandise and print</strong> — clean geometry scales perfectly onto clothing, stickers, posters, and pins.</li>
              <li><strong>Education</strong> — taught in schools and bootcamps for design fundamentals, color theory, and creative thinking.</li>
            </ul>
          </div>
        </details>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home > * + * {
  margin-top: 2.5rem;
}

@media (min-width: 768px) {
  .home > * + * {
    margin-top: 4rem;
  }
}

/* === Hero === */
.home-hero {
  padding-top: 1.5rem;
  padding-bottom: 0.5rem;
}

@media (min-width: 768px) {
  .home-hero {
    padding-top: 3rem;
    padding-bottom: 1rem;
  }
}

.home-hero-inner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
  max-width: 720px;
  min-width: 0;
}

.home-hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 10px;
  border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
  background: color-mix(in oklab, var(--surface-2) 60%, transparent);
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--muted);
  text-transform: none;
}

.home-hero-eyebrow-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 25%, transparent);
  animation: heroDot 2.4s ease-in-out infinite;
}

@keyframes heroDot {
  0%, 100% { box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 25%, transparent); }
  50%      { box-shadow: 0 0 0 6px color-mix(in oklab, var(--primary) 0%, transparent); }
}

.home-hero-title {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.5rem;
  font-size: clamp(2rem, 6.5vw, 3.5rem);
  line-height: 1.02;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.035em;
}

.home-hero-title-main {
  background: linear-gradient(
      135deg,
      var(--foreground) 0%,
      var(--foreground) 65%,
      color-mix(in oklab, var(--foreground) 70%, var(--primary)) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.home-hero-title-accent {
  background: linear-gradient(
      135deg,
      var(--primary) 0%,
      color-mix(in oklab, var(--primary) 70%, var(--foreground)) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.home-hero-tagline {
  color: var(--muted);
  font-size: var(--text-base);
  line-height: 1.55;
  max-width: 56ch;
}

@media (min-width: 768px) {
  .home-hero-tagline {
    font-size: var(--text-lg);
  }
}

.home-hero-ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.625rem;
  margin-top: 0.25rem;
}

.home-hero-cta-primary,
.home-hero-cta-secondary {
  padding: 0.625rem 1.125rem !important;
  font-size: var(--text-sm) !important;
}

.home-hero-greeting {
  font-size: var(--text-sm);
  color: var(--muted);
}

.home-hero-name {
  color: var(--foreground);
  font-weight: 700;
}

.home-hero-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  width: 100%;
  max-width: 560px;
  margin-top: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
}

.home-hero-stats li {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.home-hero-stats strong {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--foreground);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.home-hero-stats span {
  font-size: 11.5px;
  color: var(--muted);
  letter-spacing: 0.01em;
}

@media (max-width: 520px) {
  .home-hero-stats {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
  .home-hero-stats li {
    flex-direction: row;
    gap: 6px;
    align-items: baseline;
  }
}

/* === Section heads (shared) === */
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

@media (min-width: 768px) {
  .section-head { margin-bottom: 1.25rem; }
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-xl);
  line-height: 1.2;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.02em;
  color: var(--foreground);
}

.section-title::before {
  content: "";
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: var(--primary);
  flex-shrink: 0;
}

.section-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-sm);
  line-height: 1;
  font-weight: 600;
  color: var(--muted);
  padding: 6px 10px;
  border-radius: 999px;
  transition: color 160ms ease, background 160ms ease, transform 160ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .section-link:hover {
    color: var(--primary);
    background: color-mix(in oklab, var(--primary) 10%, transparent);
    transform: translateX(2px);
  }
}

/* === Studio: recent works grid === */
.studio-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

@media (min-width: 768px) {
  .studio-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }
}

.studio-new {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  text-align: center;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  aspect-ratio: 1;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .studio-new:hover {
    border-color: var(--primary);
    color: var(--primary);
    border-style: solid;
    background: var(--surface-2);
  }
}

.studio-new-icon {
  font-size: 28px;
}

.studio-new-label {
  font-size: var(--text-sm);
  font-weight: 600;
}

.studio-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .studio-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
    border-color: var(--primary);
  }
}

.studio-canvas {
  display: block;
  background: var(--background);
  image-rendering: pixelated;
}

.studio-canvas img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.studio-card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-top: 1px solid var(--border);
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
}

.studio-card-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
  font-weight: 600;
  color: var(--foreground);
}

.studio-card-size {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* === Studio: loading skeleton === */
.studio-loading {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

@media (min-width: 768px) {
  .studio-loading {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }
}

/* === Studio: empty (3-path CTA) === */
.studio-empty-caption {
  color: var(--muted);
  font-size: var(--text-sm);
  margin-bottom: 12px;
}

.studio-paths {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
}

@media (min-width: 768px) {
  .studio-paths {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }
}

.studio-path {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  color: var(--foreground);
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
  cursor: pointer;
}

@media (min-width: 768px) {
  .studio-path {
    padding: 1.25rem;
  }
}

@media (hover: hover) and (pointer: fine) {
  .studio-path:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
    border-color: var(--primary);
  }
  .studio-path:hover .studio-path-cta {
    color: var(--primary);
  }
}

.studio-path-icon {
  font-size: 28px;
  color: var(--primary);
  margin-bottom: 4px;
}

.studio-path-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--foreground);
}

.studio-path-desc {
  font-size: var(--text-xs);
  color: var(--muted);
  line-height: 1.5;
  flex: 1;
}

.studio-path-cta {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
  margin-top: 4px;
  transition: color var(--transition);
}

/* === Library === */
.library > * + * {
  margin-top: 0.5rem;
}

/* === Browse chips === */
.browse-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
}

.browse-row + .browse-row {
  border-top: 1px dashed color-mix(in oklab, var(--border) 70%, transparent);
}

.browse-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  width: 52px;
  flex-shrink: 0;
}

.chip-strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  padding: 2px 0;
}

.chip {
  padding: 5px 12px;
  white-space: nowrap;
  background: color-mix(in oklab, var(--surface-2) 60%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  color: var(--foreground);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: -0.005em;
  border-radius: 999px;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease, transform 160ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .chip:hover {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
    transform: translateY(-1px);
  }
}

/* === Questions & answers section spacing — qa-* styles live in main.css === */
.learn-more {
  padding-top: 2rem;
  border-top: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
}
</style>
