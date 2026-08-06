<script setup lang="ts">
const route = useRoute()

// When ?id=X present, editor loads an existing artwork — canonical to its detail page.
// Also noindex these variants to avoid duplicate content in GSC.
const editId = computed(() => route.query.id?.toString() || '')
const canonical = computed(() =>
    editId.value
        ? `https://simplepixelart.com/art/${editId.value}`
        : 'https://simplepixelart.com/editor'
)

// "Maker" leads, not "Editor". The homepage was taking every tool query and
// ranking badly with them — pixel art maker pos 26.9, make pixel art pos 41.3,
// online pixel art pos 34.0, free pixel art pos 35.2 — while this page, the
// actual tool, drew a single impression for any of them. Tool intent is the
// highest-CTR bucket in the data (4.03%), so it belongs on the tool page.
// Title stays under ~39 chars because titleTemplate appends 21 more.
useCustomSeoMeta({
  title: "Pixel Art Maker — Free Online Editor",
  description: "Make pixel art online free — draw on a pixel grid with brushes, fill, layers, mirror mode and custom palettes, then export a PNG. No download, no signup, runs in your browser.",
  keywords: "pixel art maker, make pixel art, pixel art online, free pixel art, pixel art editor, online pixel editor, pixel art creator, pixel drawing tool, draw pixel art online, pixel art generator",
  canonical: canonical,
  robots: () => editId.value ? 'noindex, follow' : 'index, follow',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: 'Pixel Art Editor',
            description: 'Free browser-based pixel art editor with brushes, fill, layers, mirror mode, custom palettes and PNG export.',
            url: 'https://simplepixelart.com/editor',
            applicationCategory: 'GraphicsApplication',
            operatingSystem: 'Any (browser-based)',
            offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
            featureList: [
              'Brush and eraser with adjustable size',
              'Flood fill tool',
              'Horizontal and vertical mirror drawing',
              'Multiple layers',
              'Undo / redo history',
              'Custom canvas sizes from 8×8 to 64×64',
              'Custom color palette with global color swap',
              'Export as PNG and share to the gallery',
            ],
            publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
          },
          {
            '@type': 'HowTo',
            name: 'How to draw pixel art online',
            description: 'Create pixel art in your browser in three steps with the free Simple Pixel Art editor.',
            totalTime: 'PT2M',
            tool: [{'@type': 'HowToTool', name: 'Pixel Art Editor (web browser)'}],
            step: [
              {'@type': 'HowToStep', name: 'Pick a canvas size', text: 'Open the editor and choose a canvas from 8×8 up to 64×64 pixels.'},
              {'@type': 'HowToStep', name: 'Draw with the tools', text: 'Paint with the brush, flood-fill regions, work across layers, and turn on mirror mode for symmetric sprites.'},
              {'@type': 'HowToStep', name: 'Export and share', text: 'Export your art as a PNG, or publish it to the SimplePixelArt gallery.'},
            ],
          },
          {
            '@type': 'FAQPage',
            mainEntity: [
              {'@type': 'Question', name: 'Is the pixel art editor free?', acceptedAnswer: {'@type': 'Answer', text: 'Yes. It is completely free and runs entirely in your browser — no signup needed to start, and no watermark.'}},
              {'@type': 'Question', name: 'Do I need to install anything?', acceptedAnswer: {'@type': 'Answer', text: 'No. The editor runs in any modern web browser on desktop or mobile — nothing to download.'}},
              {'@type': 'Question', name: 'What canvas sizes can I use?', acceptedAnswer: {'@type': 'Answer', text: 'Anywhere from 8×8 to 64×64 pixels. Smaller canvases suit icons and sprites; larger ones allow more detail.'}},
              {'@type': 'Question', name: 'Can I turn a photo or sprite sheet into pixel art?', acceptedAnswer: {'@type': 'Answer', text: 'Yes. Use the image-to-pixel-art converter to pixelate a photo, or the tileset slicer to cut sprites from a sheet, then open the result in the editor.'}},
              {'@type': 'Question', name: 'How do I export my pixel art?', acceptedAnswer: {'@type': 'Answer', text: 'Export your artwork as a PNG for games, the web or print, and optionally share it to the SimplePixelArt gallery.'}},
            ],
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
              {'@type': 'ListItem', position: 2, name: 'Pixel Art Editor', item: 'https://simplepixelart.com/editor'},
            ],
          },
        ],
      })
    }
  ]
});

const faq = [
  {q: 'Is the pixel art editor free?', a: `<p>Yes — completely free and running in your browser. No signup to start and no watermark.</p>`},
  {q: 'Do I need to install anything?', a: `<p>No. The editor runs in any modern web browser on desktop or mobile — nothing to download.</p>`},
  {q: 'What canvas sizes can I use?', a: `<p>Anywhere from 8×8 to 64×64 pixels. Smaller canvases suit icons and sprites; larger ones allow more detail.</p>`},
  {q: 'Can I turn a photo or sprite sheet into pixel art?', a: `<p>Yes. Pixelate a photo with the <a href="/convert">image-to-pixel-art converter</a>, or cut sprites from a sheet with the <a href="/tilesets/slicer">tileset slicer</a>, then open the result here.</p>`},
  {q: 'How do I export my pixel art?', a: `<p>Export your artwork as a PNG for games, the web or print — and optionally share it to the <a href="/arts">gallery</a>.</p>`},
]
</script>

<template>
  <div class="page">
    <PXEditor/>
    <Widget title="More tools" class="tool-more">
      <ToolPaths exclude="draw"/>
    </Widget>
    <ToolReadme>
      <h1>Pixel Art Maker</h1>
      <div class="readme-badges">
        <span class="badge"><span>price</span><span class="v ok">free</span></span>
        <span class="badge"><span>signup</span><span class="v">none</span></span>
        <span class="badge"><span>runs in</span><span class="v">browser</span></span>
        <span class="badge"><span>export</span><span class="v">PNG</span></span>
        <span class="badge"><span>canvas</span><span class="v">8×8–64×64</span></span>
      </div>
      <p>
        SimplePixelArt is a free, browser-based <strong>pixel art maker</strong> — no installation and no
        account required. Make pixel art online by drawing directly on a pixel grid with a full set of
        editor tools, then export a clean PNG. New to it? Start with
        <nuxt-link to="/easy-pixel-art">easy pixel art</nuxt-link> on a small grid.
      </p>

      <blockquote class="gh-alert gh-tip">
        <p class="gh-alert-title"><span class="icon icon-rocket"/>Tip</p>
        <p>Draw on an empty part of the canvas to spawn a new board, then drag its label to arrange your workspace.</p>
      </blockquote>

      <h2>How to use it</h2>
      <ol>
        <li><strong>Pick a canvas size</strong> — open the editor and choose a canvas from <code>8×8</code> up to <code>64×64</code> pixels.</li>
        <li><strong>Draw with the tools</strong> — paint with the brush, flood-fill regions, work across layers, and turn on mirror mode for symmetric sprites.</li>
        <li><strong>Export &amp; share</strong> — export your art as a PNG, or publish it straight to the gallery.</li>
      </ol>

      <h2>Features</h2>
      <ul>
        <li><strong>Brush &amp; eraser</strong> — paint or erase individual pixels with precision; adjustable size for fine detail or broad strokes.</li>
        <li><strong>Fill tool</strong> — flood-fill a region with a single click, ideal for coloring large areas fast.</li>
        <li><strong>Mirror drawing</strong> — horizontal or vertical mirroring to draw symmetric sprites twice as fast.</li>
        <li><strong>Multiple layers</strong> — sketch on one, color on another, stack details on top.</li>
        <li><strong>Undo / redo</strong> — full history; experiment freely and step back through any change.</li>
        <li><strong>Custom canvas sizes</strong> — from <code>8×8</code> up to <code>64×64</code> pixels, whatever fits your project.</li>
        <li><strong>Color palette</strong> — build and save a palette, then swap colors across the whole canvas instantly.</li>
        <li><strong>Export &amp; share</strong> — publish to the community, or export a PNG for games, web or print.</li>
      </ul>

      <QnA :items="faq"/>
    </ToolReadme>
  </div>
</template>
