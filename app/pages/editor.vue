<script setup lang="ts">
const {t} = useI18n()
const store = useEditor()
const route = useRoute()

const editId = computed(() => route.query.id?.toString() || '')
const canonical = computed(() =>
    editId.value
        ? `https://simplepixelart.com/art/${editId.value}`
        : 'https://simplepixelart.com/editor'
)

useCustomSeoMeta({
  title: () => t('seo.editor.title'),
  description: () => t('seo.editor.description'),
  keywords: () => t('seo.editor.keywords'),
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
        ],
      })
    }
  ]
});

const faq = computed(() => [
  {q: t('p_editor.faq0q'), a: t('p_editor.faq0a')},
  {q: t('p_editor.faq1q'), a: t('p_editor.faq1a')},
  {q: t('p_editor.faq2q'), a: t('p_editor.faq2a')},
  {q: t('p_editor.faq3q'), a: t('p_editor.faq3a')},
  {q: t('p_editor.faq4q'), a: t('p_editor.faq4a')},
])
</script>

<template>
  <ToolLayout :title="$t('p_editor.draw')" agent>
    <PXEditor/>
    <template #status>
      <p class="editor-foot-hint text-xs text-muted">
        {{ store.editorData.width }}×{{ store.editorData.height }}px ·
        {{ $t('p_editor.nLayers', store.layerCount, {count: store.layerCount}) }} ·
        {{ $t('common.nColors', {count: store.editorData.colors.length}) }}<template v-if="store.isAnimated"> ·
          {{ $t('p_editor.nFrames', {count: store.frameCount}) }}</template>
      </p>
      <span class="text-xs text-muted">{{ $t('common.tool_' + store.currentTool) }}</span>
    </template>

    <template #doc>
      <h1>{{ $t('p_editor.pixelArtMaker') }}</h1>
      <div class="readme-badges">
        <span class="badge"><span>{{ $t('p_editor.price') }}</span><span class="v ok">{{ $t('p_editor.free') }}</span></span>
        <span class="badge"><span>{{ $t('p_editor.signup') }}</span><span class="v">{{ $t('p_editor.none') }}</span></span>
        <span class="badge"><span>{{ $t('p_editor.runsIn') }}</span><span class="v">{{ $t('p_editor.browser') }}</span></span>
        <span class="badge"><span>{{ $t('p_editor.export') }}</span><span class="v">{{ $t('common.png') }}</span></span>
        <span class="badge"><span>{{ $t('p_editor.canvas') }}</span><span class="v">8×8–64×64</span></span>
      </div>
      <p>
        {{ $t('p_editor.simplepixelartIsAFreeBrowserBased') }} <strong>{{ $t('p_editor.pixelArtMaker2') }}</strong> {{ $t('p_editor.noInstallationAndNoAccountRequired') }} <NuxtLinkLocale to="/easy-pixel-art">{{ $t('p_editor.easyPixelArt') }}</NuxtLinkLocale> {{ $t('p_editor.onASmallGrid') }} </p>

      <blockquote class="gh-alert gh-tip">
        <p class="gh-alert-title"><span class="icon icon-rocket"/>{{ $t('common.tip') }}</p>
        <p v-html="$t('p_editor.drawOnAnEmptyPartOf')"/>
      </blockquote>

      <h2>{{ $t('common.howToUseIt') }}</h2>
      <ol>
        <li v-html="$t('p_editor.strongPickACanvasSizeStrong')"/>
        <li v-html="$t('p_editor.strongDrawWithTheToolsStrong')"/>
        <li v-html="$t('p_editor.strongExportShareStrongExportYour')"/>
      </ol>

      <h2>{{ $t('common.features') }}</h2>
      <ul>
        <li v-html="$t('p_editor.strongBrushEraserStrongPaintOr')"/>
        <li v-html="$t('p_editor.strongFillToolStrongFloodFill')"/>
        <li v-html="$t('p_editor.strongMirrorDrawingStrongHorizonta')"/>
        <li v-html="$t('p_editor.strongMultipleLayersStrongSketchOn')"/>
        <li v-html="$t('p_editor.strongUndoRedoStrongFullHistory')"/>
        <li v-html="$t('p_editor.strongCustomCanvasSizesStrongFrom')"/>
        <li v-html="$t('p_editor.strongColorPaletteStrongBuildAnd')"/>
        <li v-html="$t('p_editor.strongExportShareStrongPublishTo')"/>
      </ul>

      <QnA :items="faq"/>
    </template>
  </ToolLayout>
</template>
