<script setup lang="ts">
const EASY_SIZES = [
  {slug: '8x8', label: '8×8', note: 'icons, hearts, tiny sprites'},
  {slug: '10x10', label: '10×10', note: 'simple faces and fruit'},
  {slug: '12x12', label: '12×12', note: 'the most popular easy grid'},
  {slug: '13x13', label: '13×13', note: 'odd grid — perfect symmetry'},
  {slug: '15x15', label: '15×15', note: 'room for small characters'},
  {slug: '16x16', label: '16×16', note: 'the classic sprite size'},
]

const steps = [
  {
    h: 'Pick a small canvas',
    p: 'Fewer pixels means fewer decisions. An 8×8 grid holds 64 squares — you can fill it in a couple of minutes, and the shape reads clearly because there is no room for detail to get muddy.',
  },
  {
    h: 'Limit yourself to 3-5 colors',
    p: 'Beginner pixel art goes wrong from too many colors, not too few. Pick one base tone, one shadow, one highlight, and one outline. The palette manager can lock those in so you cannot drift.',
  },
  {
    h: 'Draw the silhouette first',
    p: 'Block the outline in a single flat color before touching anything else. If the silhouette is unreadable at actual size, no amount of shading will save it — and fixing it now costs a few clicks.',
  },
  {
    h: 'Add shadow last, sparingly',
    p: 'One darker tone on the side away from your light source is enough. Mirror mode helps for faces and symmetric objects: draw half, get the other half free.',
  },
]

const faq = [
  {
    q: 'What is the easiest pixel art to start with?',
    a: `<p>An 8×8 or 12×12 grid with three colors. Hearts, mushrooms, swords, apples and simple faces all read well at that size, which is why they are the classic first subjects. Start from an existing piece in the <a href="/arts/size-8x8">8×8 gallery</a> and change the colors — remixing teaches the grid faster than an empty canvas.</p>`,
  },
  {
    q: 'Do I need to be good at drawing?',
    a: `<p>No. Pixel art is placement, not brush control. You are choosing which squares to fill, and you can undo any square. That is closer to solving a puzzle than to sketching, which is exactly why it suits people who say they cannot draw.</p>`,
  },
  {
    q: 'What canvas size should I avoid as a beginner?',
    a: `<p>Anything above 32×32. A 64×64 canvas is over 4,000 squares — enough that mistakes compound before the shape is readable. Work up to it once small pieces feel comfortable.</p>`,
  },
  {
    q: 'Is it free, and do I need an account?',
    a: `<p>Free, and no account. The <a href="/editor">editor</a> runs in your browser and saves your work locally. Signing in with Google only matters if you want your pieces on a public profile or synced across devices.</p>`,
  },
]

useCustomSeoMeta({
  title: 'Easy Pixel Art — Simple Grids, 3 Colors, Free Editor',
  description: 'Easy pixel art for beginners — start on an 8×8 or 12×12 grid with three colors. Step-by-step method, the easiest canvas sizes, and a free online editor with mirror mode. No signup.',
  keywords: 'easy pixel art, pixel art easy, simple pixel art, pixel art for beginners, easy pixel art ideas, small pixel art, 8x8 pixel art, easy pixel art grid, beginner pixel art',
  canonical: 'https://simplepixelart.com/easy-pixel-art',
  ogType: 'article',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'HowTo',
            name: 'How to make easy pixel art',
            description: 'Draw readable pixel art on a small grid with a limited palette.',
            totalTime: 'PT10M',
            tool: [{'@type': 'HowToTool', name: 'SimplePixelArt editor (free, browser-based)'}],
            step: steps.map((s, i) => ({
              '@type': 'HowToStep',
              position: i + 1,
              name: s.h,
              text: s.p,
            })),
          },
          {
            '@type': 'FAQPage',
            mainEntity: faq.map(f => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: {'@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '')},
            })),
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Easy Pixel Art',
                item: 'https://simplepixelart.com/easy-pixel-art',
              },
            ],
          },
        ],
      }),
    },
  ],
})
</script>

<template>
  <div class="page">
    <section class="page-hero">
      <span class="page-hero-eyebrow">Beginner guide</span>
      <h1>Easy Pixel Art</h1>
      <p>
        Pixel art gets easy the moment you shrink the canvas. On an 8×8 grid there are 64 squares and
        no room to overthink — pick three colors, block the shape, done in minutes. Below: the grids
        that work best when you are starting, the four steps that matter, and a free editor to do it in.
      </p>
      <p>
        <nuxt-link to="/editor?new=true" class="btn">Open the editor</nuxt-link>
      </p>
    </section>

    <section>
      <h2>The easiest canvas sizes</h2>
      <p>Each of these has real pieces you can open, remix, and recolor — the fastest way to learn the grid.</p>
      <ul class="policy-list">
        <li v-for="s in EASY_SIZES" :key="s.slug">
          <nuxt-link :to="`/arts/size-${s.slug}`"><strong>{{ s.label }} pixel art</strong></nuxt-link>
          — {{ s.note }}
        </li>
      </ul>
      <p>
        Bigger grids once these feel small:
        <nuxt-link to="/arts/size-20x20">20×20</nuxt-link> ·
        <nuxt-link to="/arts/size-24x24">24×24</nuxt-link> ·
        <nuxt-link to="/arts/size-32x32">32×32</nuxt-link>.
      </p>
    </section>

    <section>
      <h2>Four steps that do most of the work</h2>
      <ol class="policy-list">
        <li v-for="s in steps" :key="s.h">
          <strong>{{ s.h }}</strong> — {{ s.p }}
        </li>
      </ol>
    </section>

    <section>
      <h2>Where to go next</h2>
      <ul class="policy-list">
        <li>
          <nuxt-link to="/editor"><strong>Pixel art editor</strong></nuxt-link>
          — brushes, fill, layers, mirror mode and PNG export, all in the browser.
        </li>
        <li>
          <nuxt-link to="/palettes"><strong>Color palettes</strong></nuxt-link>
          — ready-made 3-8 color sets, so you skip the hardest beginner decision.
        </li>
        <li>
          <nuxt-link to="/convert"><strong>Photo to pixel art</strong></nuxt-link>
          — convert an image, then clean it up by hand to see how a piece is built.
        </li>
        <li>
          <nuxt-link to="/arts"><strong>Browse the gallery</strong></nuxt-link>
          — every piece opens in the editor as a starting point.
        </li>
      </ul>
    </section>

    <ToolReadme :toc="false">
      <QnA title="Questions &amp; answers" :items="faq"/>
    </ToolReadme>
  </div>
</template>
