<script setup lang="ts">
import type {APIResponse, EditorData, SharedPage} from "~/types";
import {getStorageItem} from "~/helper/utils";

type WorkItem = (SharedPage | EditorData) & {
  id: string | number
  id_string?: string
  name?: string
  width?: number
  height?: number
  has_image?: boolean
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

const failedThumb = reactive<Record<string | number, boolean>>({})

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
          page_size: 5,
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
          .slice(0, 5)) as WorkItem[]
    }
  } finally {
    loadingWorks.value = false
  }
}

const sizes = ["8x8", "10x10", "12x12", "13x13", "15x15", "16x16", "18x18", "20x20", "24x24", "32x32"];

const faq = [
  {
    q: 'Why use Simple Pixel Art?',
    a: `<p>Anyone should be able to make pixel art in seconds — no installation, no account, no learning curve. Pick a template, remix it, or convert any photo into pixel art with one click. For deeper work, the editor has layers, mirror drawing, selections, and a full palette manager.</p>
        <p>The entire platform runs in your browser. Your work saves automatically to local storage when signed out, and syncs to the cloud when you log in with Google.</p>`,
  },
  {
    q: 'What is pixel art?',
    a: `<p>Pixel art is a form of digital art where images are created and edited at the pixel level — the smallest unit of a digital image. Originating from early video games of the 1970s–80s, pixel art has grown into a beloved medium celebrated for its clarity, charm, and nostalgic aesthetic. Every pixel is placed intentionally, giving artists full control with minimal tools.</p>`,
  },
  {
    q: 'How do I get started?',
    a: `<p>Three paths to your first pixel art:</p>
        <ul>
          <li><strong>Remix a template.</strong> Browse the library on the home page and click any artwork to open it in the editor.</li>
          <li><strong>Convert a photo.</strong> Use the <a href="/convert">image-to-pixel-art converter</a> to turn any photo into pixel art with adjustable size and palette.</li>
          <li><strong>Draw from scratch.</strong> Open the <a href="/editor">editor</a>, pick a canvas size from 8×8 to 64×64, and start painting.</li>
        </ul>`,
  },
  {
    q: 'Is Simple Pixel Art free?',
    a: `<p>Yes. Simple Pixel Art is 100% free — no watermark, no signup, no downloads required.</p>`,
  },
  {
    q: 'Do I need an account?',
    a: `<p>No. You can draw, convert, and download without an account. Log in with Google to share publicly and sync your work across devices.</p>`,
  },
  {
    q: 'Can I sell or use what I create?',
    a: `<p>Yes. You own the pixel art you create here. Use it in your game, NFT collection, profile avatar, merchandise, or anywhere else.</p>`,
  },
  {
    q: 'How do I draw good pixel art?',
    a: `<ul>
          <li><strong>Start small.</strong> 16×16 or 32×32 is ideal for learning. Larger canvases like 64×64 allow more detail.</li>
          <li><strong>Pick a limited palette.</strong> Great pixel art often uses fewer than 16 colors. Constraints force creative decisions and keep work cohesive.</li>
          <li><strong>Sketch the silhouette first.</strong> A strong silhouette makes pixel art readable at any size.</li>
          <li><strong>Add shading with dithering.</strong> Alternate two colors in a checkerboard pattern to fake gradients without extra colors.</li>
          <li><strong>Use the mirror tool.</strong> For symmetric subjects like characters or icons, enable horizontal mirroring to draw both sides at once.</li>
          <li><strong>Iterate and zoom out.</strong> Check actual size often — details that pop up close usually disappear.</li>
        </ul>`,
  },
  {
    q: 'What is pixel art used for?',
    a: `<ul>
          <li><strong>Game development</strong> — sprites, tilesets, UI, and backgrounds for indie games.</li>
          <li><strong>NFTs and collectibles</strong> — pixel art has become a signature format for digital ownership.</li>
          <li><strong>Avatars and profile pictures</strong> — popular on Discord, social media, and online communities.</li>
          <li><strong>Animation</strong> — frame-by-frame motion for games, web graphics, and short clips.</li>
          <li><strong>Merchandise and print</strong> — clean geometry scales perfectly onto clothing, stickers, posters, and pins.</li>
          <li><strong>Education</strong> — taught in schools and bootcamps for design fundamentals, color theory, and creative thinking.</li>
        </ul>`,
  },
]

// AI prompt → /generate hand-off. The form only shows when the backend can
// actually generate (billing-gated flag), so the homepage never advertises a
// dead end. Resolved during SSR: as a client-only flag the hero grew a row
// after hydration and the form was absent from the crawled HTML. `transform`
// keeps the payload down to the one boolean, and the key must not look like a
// route path — a payload key such as "/coloring/economy/" gets picked up as a
// relative URL and crawled.
const {data: aiEnabled} = await useAuthFetch<boolean>('/coloring/economy/', {
  key: 'home-ai-image-enabled',
  transform: (s: any) => !!s?.ai_image_enabled,
  default: () => false,
})
const aiPrompt = ref('')

function goGenerate() {
  const p = aiPrompt.value.trim()
  if (p.length < 3) return
  navigateTo(`/generate?prompt=${encodeURIComponent(p.slice(0, 300))}`)
}

onMounted(() => {
  loadUserWorks()
})

useCustomSeoMeta({
  title: "Simple Pixel Art — Easy Free Online Pixel Art Maker",
  description: "Simple Pixel Art is a free online pixel art maker built for easy pixel art. Draw on a grid, convert photos, remix easy templates, and share in seconds — no signup, no skill required.",
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

    <section class="home-hero">
      <div class="home-hero-inner">
        <span class="home-hero-eyebrow">
          Free · No signup · Runs in your browser
        </span>
        <h1 class="home-hero-title">
          <span class="home-hero-title-main">Make pixel art</span>
          <span class="home-hero-title-accent">in seconds.</span>
        </h1>
        <p class="home-hero-tagline">
          Draw from scratch, convert any photo into pixel art, or remix templates from a community library — all in one place.
        </p>
        <form v-if="aiEnabled" class="home-ai" @submit.prevent="goGenerate">
          <input
              v-model="aiPrompt"
              class="home-ai-input"
              type="text"
              maxlength="300"
              placeholder="Describe a sprite — “a sleeping orange cat”…"
              aria-label="Describe the pixel art to generate"
          >
          <button type="submit" class="btn primary home-ai-btn" :disabled="aiPrompt.trim().length < 3">
            <span class="icon icon-auto-fix"/><span>Generate</span>
          </button>
        </form>
        <div class="studio-tools">

          <ToolPaths exclude="ai"/>
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

    <section v-if="hasWorks || loadingWorks" class="studio readme">
      <div class="readme-head">
        <div class="readme-tabs">
          <span class="readme-tab is-active"><span class="icon icon-file"/>{{ auth.logged ? 'Your studio' : 'Start a project' }}</span>
        </div>
        <div v-if="hasWorks" class="readme-actions">
          <nuxt-link to="/work" class="section-link">View all →</nuxt-link>
        </div>
      </div>

      <div class="studio-body">

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
              <div class="inside">
                <img
                    v-if="isCloudWork(item) && item.has_image !== false && !failedThumb[item.id]"
                    :src="workThumbUrl(item)"
                    :alt="item.name || 'Pixel art'"
                    class="size-full"
                    loading="lazy"
                    decoding="async"
                    @error="failedThumb[item.id] = true"
                />
                <div v-else-if="isCloudWork(item)" class="studio-empty-thumb">
                  <span class="icon icon-image"/>
                </div>
                <Thumb v-else :data="item as EditorData"/>
              </div>
            </div>
          </div>
        </nuxt-link>
      </div>

      <div v-else-if="loadingWorks" class="studio-loading">
        <div v-for="i in 6" :key="i" class="skeleton skeleton-square"/>
      </div>

      </div>
    </section>

    <section class="library readme">
      <div class="readme-head">
        <div class="readme-tabs">
          <span class="readme-tab is-active"><span class="icon icon-hot"/>What's new</span>
        </div>
        <div class="readme-actions">
          <nuxt-link to="/arts/new" class="section-link">View all →</nuxt-link>
        </div>
      </div>
      <div class="library-body">
        <item-list :limit="12" hide-ip hide-paginator ordering="-updated"/>
      </div>
    </section>

    <ClientOnly>
      <AdSlot slot="6499761093"/>
    </ClientOnly>

    <ToolReadme :toc="false" :guidelines="false">
      <h1>Simple Pixel Art</h1>
      <div class="readme-badges">
        <span class="badge"><span>price</span><span class="v ok">free</span></span>
        <span class="badge"><span>signup</span><span class="v">none</span></span>
        <span class="badge"><span>runs in</span><span class="v">browser</span></span>
        <span class="badge"><span>export</span><span class="v">PNG</span></span>
      </div>

      <p>
        <strong>Simple Pixel Art</strong> is a free online pixel art maker for everyone — hobbyists, game
        developers, and complete beginners alike. Draw sprites from scratch, turn any photo into pixel art,
        or remix templates from the community library, then share or download your work. No installation,
        no account, no learning curve.
      </p>

      <blockquote class="gh-alert gh-tip">
        <p class="gh-alert-title"><span class="icon icon-rocket"/>Tip</p>
        <p>New here? Open any artwork from the gallery above and start editing — you can publish your first piece in under a minute.</p>
      </blockquote>

      <h2>Three ways to start</h2>
      <ol>
        <li><strong>Draw from scratch</strong> — open the <a href="/editor">editor</a>, pick a canvas from <code>8×8</code> to <code>64×64</code>, and paint pixel by pixel.</li>
        <li><strong>Convert a photo</strong> — drop an image into the <a href="/convert">converter</a> and tune the resolution and palette until it looks right.</li>
        <li><strong>Remix a template</strong> — browse the <a href="/arts">gallery</a> and open any artwork straight into the editor.</li>
        <li><strong>Start from a palette</strong> — pick one of the <a href="/palettes">color palettes</a> and draw inside a fixed set of colors, the way most pixel art is made.</li>
      </ol>

      <h2>What's inside</h2>
      <ul>
        <li><strong>Full editor</strong> — brush, eraser, fill, selections, layers, and unlimited undo/redo.</li>
        <li><strong>Mirror drawing</strong> — draw symmetric characters and icons in half the time.</li>
        <li><strong>Palette manager</strong> — build, save, and swap <a href="/palettes">color palettes</a> across the whole canvas.</li>
        <li><strong>Photo to pixel art</strong> — one-click conversion with adjustable resolution and colors.</li>
        <li><strong>Tilesets &amp; worlds</strong> — assemble pixel tiles into grid or isometric scenes.</li>
        <li><strong>Export anywhere</strong> — clean PNGs for games, NFTs, avatars, print, and more.</li>
      </ul>

      <h2>Popular canvas sizes</h2>
      <p>
        Start from a preset —
        <template v-for="(s, i) in sizes" :key="s"><a :href="`/arts/size-${s}`">{{ s }}</a><span v-if="i < sizes.length - 1" aria-hidden="true"> · </span></template>.
      </p>

      <h2>New to pixel art?</h2>
      <p>
        Start with <nuxt-link to="/easy-pixel-art">easy pixel art</nuxt-link> — small grids, three
        colors, and a four-step method that gets a readable sprite out of you in about ten minutes.
        Or jump straight into the <nuxt-link to="/editor">pixel art editor</nuxt-link> to make pixel
        art online for free.
      </p>

      <QnA title="Questions &amp; answers" :items="faq"/>
    </ToolReadme>
  </div>
</template>

<style scoped>
.home > * + * {
  margin-top: var(--space-2);
}

.home-hero {
  padding: var(--space-4);
  background:
    radial-gradient(120% 120% at 100% 0%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 60%),
    var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.home-hero-inner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
  width: 100%;
  min-width: 0;
}

.home-hero-eyebrow {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--muted);
}

.home-hero-title {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.5rem;
  font-size: clamp(1.75rem, 5vw, 2.75rem);
  line-height: 1.05;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.035em;
}

.home-hero-title-main {
  color: var(--foreground);
}

.home-hero-title-accent {
  color: var(--primary);
}

.home-hero-tagline {
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.55;
  max-width: 56ch;
}

@media (min-width: 768px) {
  .home-hero-tagline {
    font-size: var(--text-base);
  }
}

.home-ai {
  display: flex;
  gap: var(--space-2);
  width: 100%;
  max-width: 480px;
}

.home-ai-input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--background);
  color: var(--foreground);
  font-size: var(--text-sm);
}

.home-ai-input:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.home-ai-btn {
  white-space: nowrap;
  flex-shrink: 0;
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
  gap: var(--space-3);
  width: 100%;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
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
    gap: var(--space-1);
  }
  .home-hero-stats li {
    flex-direction: row;
    gap: var(--space-2);
    align-items: baseline;
  }
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: 0.25rem;
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-xl);
  line-height: 1.2;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.02em;
  color: var(--foreground);
}

.section-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  line-height: 1;
  font-weight: 600;
  color: var(--muted);
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  transition: color 160ms ease, background 160ms ease, transform 160ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .section-link:hover {
    color: var(--primary);
    background: color-mix(in oklab, var(--primary) 10%, transparent);
  }
}

.studio-body,
.library-body { padding: var(--space-4); }

.studio-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

@media (min-width: 768px) {
  .studio-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--space-4);
  }
}

.studio-new {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  text-align: center;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  aspect-ratio: 1;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .studio-new:hover {
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
  position: relative;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color var(--transition);

  --fold-size: 14px;
  transition: --fold-size 220ms cubic-bezier(.22,.61,.36,1);
  -webkit-mask: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), #000 calc(var(--fold-size) * 0.7071 + 0.25px));
  mask: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), #000 calc(var(--fold-size) * 0.7071 + 0.25px));
}

@media (hover: hover) and (pointer: fine) {
  .studio-card:hover {
    --fold-size: 28px;
  }
}

.studio-card .square {
  border-radius: calc(var(--radius-sm) - 1px);
  overflow: hidden;
}

.studio-card::after {
  content: "";
  position: absolute;
  top: -1px;
  right: -1px;
  width: var(--fold-size);
  height: var(--fold-size);
  background: linear-gradient(
    225deg,
    var(--border) calc(50% + 1.25px),
    var(--surface) calc(50% + 1.75px)
  );
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-bottom-left-radius: var(--radius-sm);
  pointer-events: none;
  z-index: 1;
}

.studio-canvas {
  display: block;
  background: var(--surface);
  image-rendering: pixelated;
}

.studio-canvas img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.studio-empty-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: color-mix(in oklab, var(--muted) 45%, transparent);
}

.studio-empty-thumb .icon {
  width: 28px;
  height: 28px;
}

.studio-loading {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

@media (min-width: 768px) {
  .studio-loading {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--space-4);
  }
}

.studio-tools {
  width: 100%;
}

</style>
