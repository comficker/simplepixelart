<script setup lang="ts">
const {locale, defaultLocale} = useI18n()

const PAGE_URL = 'https://simplepixelart.com/learn/how-to-make-pixel-art'
const IMG = '/images/learn/how-to-make-pixel-art'
const TITLE = "How to Make Pixel Art: A Beginner's Workflow That Works"
const DESC = 'Pick a tiny canvas, limit your colors, then go silhouette → outline → flat colors → details. A step-by-step pixel art tutorial with a real 18×18 sprite.'

const steps = [
  {name: 'Pick a tiny canvas', text: 'Start on 16×16 or smaller: every pixel is a clear decision and you finish before you lose motivation.'},
  {name: 'Limit your palette', text: 'Pick 4 to 8 colors before drawing. Use a very dark neutral for outlines instead of pure black.'},
  {name: 'Block in the silhouette', text: 'Fill the whole shape with one color and check it reads as a single flat shape.'},
  {name: 'Add the outline', text: 'Draw the outline on top, avoiding doubles on diagonals and keeping curve steps even.'},
  {name: 'Flat colors', text: 'Fill each area with its base color, still without shading.'},
  {name: 'Details and shading', text: 'Add a few details; when shading, pick one light source and use 2–3 hue-shifted tones per color.'},
  {name: 'Export without blur', text: 'Save as PNG and scale up by whole numbers with nearest-neighbor scaling.'},
]

// Written in English only: the other locales point Google back here rather
// than serving the same English text under /ja/, /ko/ and so on.
const translated = computed(() => locale.value === defaultLocale)

useCustomSeoMeta({
  title: TITLE,
  description: DESC,
  keywords: 'how to make pixel art, pixel art tutorial, how to do pixel art, pixel art for beginners, pixel art shading, how to draw pixel art, pixel art steps, beginner pixel art',
  canonical: PAGE_URL,
  robots: () => translated.value ? 'index, follow' : 'noindex, follow',
  ogType: 'article',
  ogImage: `https://simplepixelart.com${IMG}/cover-1000x420.png`,
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Article',
            headline: TITLE,
            description: DESC,
            image: `https://simplepixelart.com${IMG}/cover-1000x420.png`,
            datePublished: '2026-11-03',
            mainEntityOfPage: PAGE_URL,
            publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
          },
          {
            '@type': 'HowTo',
            name: 'How to make pixel art',
            description: DESC,
            image: `https://simplepixelart.com${IMG}/steps.png`,
            tool: [{'@type': 'HowToTool', name: 'SimplePixelArt editor (free, browser-based)'}],
            step: steps.map((s, i) => ({'@type': 'HowToStep', position: i + 1, name: s.name, text: s.text})),
          },
        ],
      }),
    },
  ],
})
</script>

<template>
  <article class="page prose learn">
    <p class="page-meta">Pixel art tutorial</p>
    <h1>How to make pixel art</h1>
    <p>
      Most people who try pixel art for the first time open a 256×256 canvas, pick 40 colors and give up an hour
      later. The trick is the opposite: start smaller than feels reasonable and use fewer colors than feels possible.
    </p>
    <p>
      Below is a workflow for small game sprites, shown on an 18×18 cat. It works the same for characters, items
      and icons.
    </p>
    <figure>
      <img :src="`${IMG}/steps.png`" alt="Four steps of a pixel art cat: silhouette, outline, flat colors, details" width="1014" height="316">
    </figure>
    <p>
      <NuxtLinkLocale to="/editor?new=true" class="btn primary">Open the editor and follow along</NuxtLinkLocale>
    </p>

    <h2>1. Pick a tiny canvas</h2>
    <p>Small canvases are easier, not harder. Every pixel is a clear decision and you finish before you lose motivation.</p>
    <ul>
      <li><NuxtLinkLocale to="/arts/size-8x8"><strong>8×8</strong></NuxtLinkLocale> — icons, tiny items, coins</li>
      <li><NuxtLinkLocale to="/arts/size-16x16"><strong>16×16</strong></NuxtLinkLocale> — classic game characters, tiles</li>
      <li><NuxtLinkLocale to="/arts/size-32x32"><strong>24×24 – 32×32</strong></NuxtLinkLocale> — characters with more detail, portraits</li>
      <li><NuxtLinkLocale to="/arts/size-64x64"><strong>64×64</strong></NuxtLinkLocale> — big sprites, small scenes</li>
    </ul>
    <p>If you're unsure, take 16×16. The cat above is 18×18 because its tail needed two more columns.</p>

    <h2>2. Limit your palette</h2>
    <p>
      Pick 4 to 8 colors before you draw a single pixel. A limited palette forces the image to read clearly and
      keeps colors consistent across sprites.
    </p>
    <figure>
      <img :src="`${IMG}/palette.png`" alt="The six colors used for the pixel art cat" width="520" height="120">
    </figure>
    <p>
      The cat uses six: a near-black outline, the orange body, a cream belly, and three tiny accents (peach, pink,
      white) that only cover eleven pixels together. If you don't want to build a palette yourself, borrow one from
      the <NuxtLinkLocale to="/palettes">pixel art palette library</NuxtLinkLocale>: PICO-8 (16 colors), Endesga 32
      and Sweetie 16 are popular starting points.
    </p>
    <p>
      Don't use pure black for outlines on colorful sprites. A very dark neutral (here <code>#171717</code>) looks
      cleaner, and on soft styles a dark version of the body color looks even better.
    </p>

    <h2>3. Block in the silhouette</h2>
    <p>
      Fill the whole shape with one color. No outline, no details. You're only checking one thing:
      <strong>is it recognizable as a single flat shape?</strong>
    </p>
    <p>
      If the silhouette doesn't read, no amount of shading will fix it later. Squint at it, or zoom out to 1×. For
      the cat, the two ear bumps and the tail are what make it read as a cat, so they stick out clearly.
    </p>

    <h2>4. Add the outline</h2>
    <p>Draw the outline on top of the silhouette. Two rules keep it clean:</p>
    <ul>
      <li>
        <strong>Avoid "doubles"</strong>: in a diagonal line, each step should touch the next only at a corner. An
        L-shaped clump of three pixels makes the line look thick and jagged.
      </li>
      <li><strong>Keep steps even</strong>: a curve made of steps like 3-2-1-1 looks smooth; 3-1-2-1 looks wobbly.</li>
    </ul>
    <p>
      Inner lines (the eyes, the mouth) come in this step too. On a small sprite a single pixel is a face feature,
      so place them carefully. Here the eyes are two short dashes and the nose is one pixel.
    </p>

    <h2>5. Flat colors</h2>
    <p>
      Now fill each area with its base color: body orange, belly cream. Still no shading. This is where you check
      that the colors work together and that areas are big enough to read.
    </p>
    <p>Small areas (1–2 pixels wide) often become noise. If a stripe or a patch doesn't read at 1×, remove it or make it bigger.</p>

    <h2>6. Details and shading</h2>
    <p>
      Last, add the small things that make it feel alive: pink inside the ears, a hint of paws, a highlight. On a
      sprite this small, <strong>fewer details are better</strong>. The cat has no real shading at all, just color
      areas, and it still reads well as a game icon.
    </p>
    <p>When you do shade bigger sprites:</p>
    <ul>
      <li>Pick one light source (top-left is the classic choice) and stick to it.</li>
      <li>Use 2–3 tones per color: base, shadow, highlight.</li>
      <li>
        Shift the hue a little, not just the brightness: shadows slightly cooler or more saturated, highlights
        slightly warmer. It looks far less muddy than plain darker/lighter versions.
      </li>
    </ul>

    <h2>7. Export without blur</h2>
    <p>
      Pixel art is drawn at 1× and scaled up with <strong>nearest-neighbor</strong> scaling, in whole numbers (2×,
      3×, 4×…). Any smoothing turns crisp pixels into mush:
    </p>
    <figure>
      <img :src="`${IMG}/scaling.png`" alt="The same sprite scaled with smoothing and with nearest-neighbor" width="450" height="260">
    </figure>
    <ul>
      <li>Save as <strong>PNG</strong>, never JPG, which adds color noise.</li>
      <li>Scale by whole numbers only. 2.5× makes some pixels wider than others.</li>
      <li>In game engines, turn off texture filtering (Godot: Default Texture Filter = Nearest; Unity: Filter Mode = Point).</li>
    </ul>

    <h2>Tools</h2>
    <p>
      You don't need anything expensive. Aseprite is the standard paid tool, and LibreSprite is a free fork of an
      older version. Piskel and Lospec's editor run in the browser, and so does the
      <NuxtLinkLocale to="/editor">pixel art editor on this site</NuxtLinkLocale>, with palettes, a grid and
      nearest-neighbor export built in. Any of these will do. The workflow matters more than the tool.
    </p>

    <h2>Practice ideas</h2>
    <p>
      The fastest way to improve is many small finished sprites, not one big unfinished one. A few to try, each in
      16×16 with at most 8 colors:
    </p>
    <ol>
      <li>A potion bottle (simple shape, good for practicing highlights)</li>
      <li>A slime (silhouette practice)</li>
      <li>A sword (diagonal lines without doubles)</li>
      <li>A cat or a frog (readable face in a few pixels)</li>
      <li>A heart, coin and key set (consistent palette across items)</li>
    </ol>
    <p>
      For more, browse <NuxtLinkLocale to="/ideas">pixel art ideas</NuxtLinkLocale> by theme or start with
      <NuxtLinkLocale to="/easy-pixel-art">easy pixel art</NuxtLinkLocale>, and look at how others place single
      pixels for eyes and highlights.
    </p>
    <p>
      <NuxtLinkLocale to="/editor?new=true" class="btn primary">Start drawing</NuxtLinkLocale>
    </p>
  </article>
</template>

<style scoped>
/* The figures are already nearest-neighbor upscales. Never stretch them past
   their own size (that is where pixels would blur); when a narrow column
   shrinks them, smooth scaling keeps pixels even and the labels legible,
   where `pixelated` at a fractional ratio made both jagged. */
.learn figure img {
  width: auto;
  max-width: 100%;
  height: auto;
}
</style>
