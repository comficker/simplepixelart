<script setup lang="ts">
const {t} = useI18n()
const localHtml = useLocalHtml()
const store = useEditor()
const route = useRoute()

const editId = computed(() => route.query.id?.toString() || '')
const canonical = computed(() =>
    editId.value
        ? `https://simplepixelart.com/art/${editId.value}`
        : 'https://simplepixelart.com/editor'
)

// One source for the visible how-to/FAQ and their JSON-LD, so /ko gets
// Korean structured data rather than the English copy it used to carry.
const steps = [
  'p_editor.strongPickACanvasSizeStrong',
  'p_editor.stepPalette',
  'p_editor.strongDrawWithTheToolsStrong',
  'p_editor.stepAnimate',
  'p_editor.stepExport',
]
const faq = computed(() => [0, 1, 2, 3, 4, 5, 6].map(i => ({
  q: t(`p_editor.faq${i}q`),
  a: t(`p_editor.faq${i}a`),
})))
const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

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
            name: 'SimplePixelArt Pixel Art Maker',
            description: plain(t('seo.editor.description')),
            url: 'https://simplepixelart.com/editor',
            applicationCategory: 'DesignApplication',
            operatingSystem: 'Any (browser-based)',
            offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
            featureList: [
              'Brush and eraser with adjustable size',
              'Flood fill tool',
              'Horizontal and vertical mirror drawing',
              'Multiple layers',
              'Animation frames with onion skin',
              'Undo / redo history',
              'Custom canvas sizes up to 128×128',
              'Custom color palette with global color swap',
              'Export as PNG, animated GIF or sprite sheet',
            ],
            publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
          },
          {
            '@type': 'HowTo',
            name: t('p_editor.howToMakeH'),
            totalTime: 'PT10M',
            tool: [{'@type': 'HowToTool', name: 'SimplePixelArt pixel art maker (web browser)'}],
            step: steps.map((k, i) => {
              const html = t(k)
              const m = html.match(/<strong>(.*?)<\/strong>\s*[—–-]*\s*(.*)/)
              return {'@type': 'HowToStep', position: i + 1, name: plain(m ? m[1] : html), text: plain(m ? m[2] : html)}
            }),
          },
          {
            '@type': 'FAQPage',
            mainEntity: faq.value.map(f => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: {'@type': 'Answer', text: plain(f.a)},
            })),
          },
        ],
      })
    }
  ]
});
</script>

<template>
  <ToolLayout :title="$t('p_editor.pixelArtEditor')" agent>
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

      <h2>{{ $t('p_editor.howToMakeH') }}</h2>
      <ol>
        <li v-for="k in steps" :key="k" v-html="localHtml($t(k))"/>
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
