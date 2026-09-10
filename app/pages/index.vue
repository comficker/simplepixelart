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

const userWorks = ref<WorkItem[]>([])
const loadingWorks = ref(false)

const {hasWork, workCount, setWorkCount} = useHasWork()
const {rowSize} = useResultsCols()

const studioLimit = computed(() => rowSize(5, 1))

const mounted = ref(false)

const hasWorks = computed(() => userWorks.value.length > 0)
const studioWorks = computed(() => userWorks.value.slice(0, studioLimit.value))
const studioSkeletons = computed(() => Math.min(workCount.value, studioLimit.value) + 1)
const showStudio = computed(() => hasWork.value || hasWorks.value)

function isCloudWork(item: WorkItem): boolean {
  return typeof item.id === 'number' && !!item.id_string
}

const failedThumb = reactive<Record<string | number, boolean>>({})

const artImage = useArtImage()

function workThumbUrl(item: WorkItem): string {
  return artImage(item as any)
}

async function loadUserWorks() {
  loadingWorks.value = true
  try {
    if (auth.logged?.id) {
      const res = await useNativeFetch<APIResponse<SharedPage>>('/coloring/shared-pages/', {
        params: {
          user: auth.logged.username,
          page_size: studioLimit.value,
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
          .slice(0, studioLimit.value)) as WorkItem[]
    }
  } finally {
    loadingWorks.value = false


    setWorkCount(userWorks.value.length)
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

// Start the artwork list now rather than after the lookups below resolve.
// item-list further down calls useArtListFetch with the same key, so it joins
// this in-flight request instead of opening a second round trip — on a
// client-side navigation each round trip costs about a second of latency.
useArtListFetch({limit: 32, ordering: '-updated', hideIp: true})

// Awaited together: these two are independent, and awaiting them one after
// the other made the server wait out both round trips before the artwork list
// (fetched by item-list further down) could even start.
const [{data: aiEnabled}, {data: homeChallenge}] = await Promise.all([
  useAuthFetch<boolean>('/coloring/economy/', {
    key: 'home-ai-image-enabled',
    transform: (s: any) => !!s?.ai_image_enabled,
    default: () => false,
  }),
  useAuthFetch<any>('/coloring/challenges/', {
    key: 'home-weekly-challenge',
    transform: (s: any) => s?.current
        ? {
          id_string: s.current.id_string,
          name: s.current.name,
          ends: s.current.ends,
          entries: s.current.entries_count,
        }
        : null,
    default: () => null,
  }),
])

const challengeDaysLeft = computed(() => {
  if (!homeChallenge.value?.ends) return 0
  const end = new Date(`${homeChallenge.value.ends}T23:59:59`)
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000))
})
const aiPrompt = ref('')

function goGenerate() {
  const p = aiPrompt.value.trim()
  if (p.length < 3) return
  navigateTo(`/generate?prompt=${encodeURIComponent(p.slice(0, 300))}`)
}

onMounted(() => {
  mounted.value = true

  if (hasWork.value) loadUserWorks()
})

useCustomSeoMeta({
  title: "Free Pixel Art Maker for Game Art",
  description: "Free online pixel art maker for game assets: draw sprites, build tilesets, paint tilemaps, and export for Godot, Unity or Phaser. No signup.",
  keywords: "simple pixel art, simplepixelart, pixel art, pixel art maker, pixel art editor, free pixel art, pixel art online, game sprites, tileset maker, tilemap editor, sprite editor, pixel art for games, 8-bit art, retro art, create pixel art",
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
  <ToolLayout title="Home">
    <template #head>
      <p class="home-facts text-xs text-muted">
        Sprites → tiles → maps · Godot · Unity · Phaser export · photo → pixel art in one click
      </p>
    </template>

    <div class="screen home-stack">
      <section class="home-hero">
        <span class="home-hero-eyebrow">Free · No signup · Runs in your browser</span>
        <h1 class="home-hero-title">
          <span class="home-hero-title-main">Make pixel art</span>
          <span class="home-hero-title-accent">in seconds.</span>
        </h1>
        <p class="home-hero-tagline">
          Draw sprites, build tilesets, paint tilemaps, and export game-ready assets for Godot, Unity, or Phaser —
          or just convert a photo and remix community templates. All free, in your browser.
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
        <div class="home-tools"><ToolPaths exclude="ai"/></div>
      </section>

      <Widget v-if="showStudio" :title="auth.logged ? 'Your studio' : 'Start a project'">
        <template #ctl>
          <nuxt-link to="/work" class="widget-ctl-btn">
            <span class="widget-ctl-name">View all</span><span class="icon icon-angle-right"/>
          </nuxt-link>
        </template>

          <div v-if="hasWorks" class="studio-grid">
            <nuxt-link to="/editor?new=true" class="studio-new" title="New blank canvas">
              <span class="icon icon-plus studio-new-icon"/>
              <span class="studio-new-label">New</span>
            </nuxt-link>
            <nuxt-link
                v-for="item in studioWorks"
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

          <div v-else class="studio-grid" aria-busy="true">
            <div v-for="i in studioSkeletons" :key="i" class="studio-card">
              <div class="studio-canvas">
                <div class="square">
                  <div class="inside"><span class="skeleton size-full"/></div>
                </div>
              </div>
            </div>
          </div>
      </Widget>

      <nuxt-link v-if="homeChallenge" :to="`/challenges/${homeChallenge.id_string}`" class="home-challenge-link">
        <span class="home-challenge-tag"><span class="icon icon-flag"/>Weekly challenge</span>
        <span class="home-challenge-name">{{ homeChallenge.name }}</span>
        <span class="home-challenge-sub">
          {{ challengeDaysLeft }} {{ challengeDaysLeft === 1 ? 'day' : 'days' }} left ·
          {{ homeChallenge.entries }} {{ homeChallenge.entries === 1 ? 'entry' : 'entries' }} · Join →
        </span>
      </nuxt-link>

      <Widget title="What's new" class="home-library">
        <template #ctl>
          <nuxt-link to="/arts/new" class="widget-ctl-btn">
            <span class="widget-ctl-name">View all</span><span class="icon icon-angle-right"/>
          </nuxt-link>
        </template>
        <item-list :limit="32" hide-ip hide-paginator ordering="-updated"/>
      </Widget>
    </div>

    <template #status>
      <PartialFooterBar/>
    </template>

    <template #doc>
      <h2>Simple Pixel Art</h2>
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

      <h2>Built for game developers</h2>
      <p>
        The whole game-asset pipeline lives here, end to end:
      </p>
      <ol>
        <li><strong>Draw sprites</strong> in the <a href="/editor">editor</a> — layers, animation frames with tags, mirror and iso modes.</li>
        <li><strong>Build tilesets</strong> — <a href="/tilesets/slicer">slice a sheet</a> or draw tiles, then generate terrain variants with autotiling in the <a href="/tilesets/editor">tileset editor</a>.</li>
        <li><strong>Paint tilemaps</strong> — grid or isometric maps with layers and terrain brushes in the <a href="/tilemaps/editor">tilemap editor</a>.</li>
        <li><strong>Export game-ready</strong> — sprite sheets with Aseprite-format JSON for Phaser, Unity and Godot; Godot <code>.tres</code> and Tiled <code>.tsx</code> tilesets; and full maps as Tiled <code>.tmj</code> that Phaser and Tiled load directly.</li>
      </ol>

      <h2>What's inside</h2>
      <ul>
        <li><strong>Full editor</strong> — brush, eraser, fill, selections, layers, and unlimited undo/redo.</li>
        <li><strong>Animation</strong> — frame-by-frame with tags, onion skin, GIF and sprite-sheet export.</li>
        <li><strong>Mirror drawing</strong> — draw symmetric characters and icons in half the time.</li>
        <li><strong>Palette manager</strong> — build, save, and swap <a href="/palettes">color palettes</a> across the whole canvas.</li>
        <li><strong>Photo to pixel art</strong> — one-click conversion with adjustable resolution and colors.</li>
        <li><strong>Tilesets &amp; tilemaps</strong> — autotile terrain and assemble grid or isometric scenes.</li>
        <li><strong>Weekly challenges</strong> — a fresh <a href="/challenges">theme every week</a>, community-voted winners.</li>
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
      <ClientOnly>
        <AdSlot slot="6499761093"/>
      </ClientOnly>
    </template>
  </ToolLayout>
</template>

<style scoped>
.home-hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  background:
    radial-gradient(120% 120% at 100% 0%, color-mix(in oklab, var(--surface-2) 85%, transparent), transparent 62%),
    var(--surface);
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

.home-challenge-link {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  transition: background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .home-challenge-link:hover {
    background: var(--surface-2);
  }
}

.home-challenge-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 2px 8px;
  font-size: var(--text-2xs);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary-foreground);
  background: var(--primary);
  border-radius: 999px;
}

.home-challenge-tag .icon {
  width: 0.9em;
  height: 0.9em;
}

.home-challenge-name {
  font-weight: 800;
  color: var(--foreground);
}

.home-challenge-sub {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--muted);
  white-space: nowrap;
}

/* Phones: the row cannot hold all three parts, and the auto margin left the
   wrapped line pinned right. Lay it out as two rows instead. */
@media (max-width: 767px) {
  .home-challenge-link {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    row-gap: var(--space-1);
  }

  .home-challenge-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .home-challenge-sub {
    grid-column: 1 / -1;
    margin-left: 0;
    white-space: normal;
  }
}

.home-library {
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
}

.home-library :deep(.widget-body) {
  flex: 1 0 auto;
}

.studio-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

@media (max-width: 767px) {
  .studio-grid > :nth-child(n+4) {
    display: none;
  }
}

@media (min-width: 768px) {
  .studio-grid {
    grid-template-columns: repeat(var(--results-cols, 6), minmax(0, 1fr));
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

</style>
