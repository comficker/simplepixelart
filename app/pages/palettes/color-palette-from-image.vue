<script setup lang="ts">
import {toast} from "vue-sonner";
import {extractPaletteFromFile} from "~/helper/palette";

const count = ref(16)
const detecting = ref(false)
const colors = ref<string[]>([])
const previewUrl = ref('')
let lastFile: File | null = null

async function detect() {
  if (!lastFile) return
  detecting.value = true
  try {
    colors.value = await extractPaletteFromFile(lastFile, count.value)
  } catch {
    toast.error('Could not read that image')
  } finally {
    detecting.value = false
  }
}

function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  lastFile = file
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
  detect()
}

let t: any = null
watch(count, () => {
  if (!lastFile) return
  clearTimeout(t)
  t = setTimeout(detect, 250)
})

onBeforeUnmount(() => {
  clearTimeout(t)   // pending re-detect must not fire after unmount
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

const FAQ = [
  {q: 'How do I get a color palette from an image?', a: 'Upload any photo, screenshot or illustration. The tool reads its pixels in your browser and extracts the most representative colors automatically — no upload to a server.', icon: 'icon-image'},
  {q: 'How many colors can I extract?', a: 'Anywhere from 2 to 32. Drag the slider and the palette re-detects instantly so you can dial in the right level of detail.', icon: 'icon-adjust'},
  {q: 'Is it free?', a: 'Yes — completely free, no signup needed to extract and copy. You only need an account if you want to publish a palette to the public library.', icon: 'icon-check'},
  {q: 'Can I edit the colors afterwards?', a: 'Yes. Click any swatch to tweak its hex, remove ones you don’t want, or add new colors before you copy, open in the editor, or publish.', icon: 'icon-pen'},
  {q: 'What image formats work?', a: 'PNG, JPG, WebP and GIF — anything your browser can display. Transparent pixels are ignored so they don’t pollute the palette.', icon: 'icon-file'},
]

useCustomSeoMeta({
  title: "Color Palette from Image — Extract Colors Online (Free)",
  description: "Generate a color palette for any image. Upload a photo and instantly extract its dominant colors — pick 2 to 32 colors, copy the hex codes, open them in the editor, or save to the palette library. Free, runs in your browser.",
  keywords: "color palette for image, color palette from image, extract colors from image, image color palette generator, get colors from photo, image to palette, dominant colors extractor, photo color palette",
  canonical: "https://simplepixelart.com/palettes/color-palette-from-image",
  robots: "index, follow",
  ogImage: "https://simplepixelart.com/og-image.jpg",
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: 'Color Palette from Image',
            description: 'Free browser tool that extracts a color palette from any image — upload a photo and get its dominant colors as hex codes, ready to copy, edit or save.',
            url: 'https://simplepixelart.com/palettes/color-palette-from-image',
            applicationCategory: 'DesignApplication',
            operatingSystem: 'Any (browser-based)',
            offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
            featureList: [
              'Extract a color palette from any image',
              'Choose 2 to 32 colors',
              'Edit, add or remove colors',
              'Copy hex codes or download',
              'Open the palette in the pixel art editor',
              'Runs entirely in the browser — nothing uploaded',
            ],
            publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
          },
          {
            '@type': 'HowTo',
            name: 'How to create a color palette from an image',
            description: 'Extract a color palette from any image online in three steps.',
            totalTime: 'PT1M',
            tool: [{'@type': 'HowToTool', name: 'Color Palette from Image (web browser)'}],
            step: [
              {'@type': 'HowToStep', name: 'Upload an image', text: 'Click to choose a photo, screenshot or illustration. It is processed in your browser — nothing is uploaded to a server.'},
              {'@type': 'HowToStep', name: 'Pick how many colors', text: 'Drag the slider from 2 to 32 colors. The palette re-detects instantly so you can find the right level of detail.'},
              {'@type': 'HowToStep', name: 'Copy, edit or save', text: 'Copy the hex codes, fine-tune any swatch, open the palette in the editor, or publish it to the library.'},
            ],
          },
          {
            '@type': 'FAQPage',
            mainEntity: FAQ.map(f => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: {'@type': 'Answer', text: f.a},
            })),
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
              {'@type': 'ListItem', position: 2, name: 'Palettes', item: 'https://simplepixelart.com/palettes'},
              {'@type': 'ListItem', position: 3, name: 'Color palette from image', item: 'https://simplepixelart.com/palettes/color-palette-from-image'},
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
    <div class="tool-card">
      <div class="tool-pane">
        <span class="tool-pane-cap">Source image</span>
        <label class="ext-drop" :class="{ filled: !!previewUrl }">
          <input type="file" accept="image/*" class="ext-file" @change="onFile"/>
          <img v-if="previewUrl" :src="previewUrl" alt="Source preview" class="ext-preview"/>
          <template v-else>
            <span class="icon icon-image ext-drop-icon"/>
            <span>Choose an image</span>
            <span class="ext-drop-hint">PNG, JPG, WebP or GIF</span>
          </template>
        </label>
        <div class="ext-count">
          <label>Colors <strong>{{ count }}</strong></label>
          <input type="range" min="2" max="32" v-model.number="count"/>
        </div>
      </div>

      <div class="tool-pane">
        <div v-if="detecting" class="tool-empty">
          <span class="icon icon-adjust"/>
          <span>Detecting colors…</span>
        </div>
        <div v-else-if="!colors.length" class="tool-empty">
          <span class="icon icon-image"/>
          <span>Pick an image to extract its palette.</span>
        </div>
        <PaletteComposer
            v-else
            v-model:colors="colors"
            source="image"
            name-placeholder="Palette name"
            default-name="Extracted palette"
        />
      </div>
    </div>

    <Widget title="More tools" class="tool-more">
      <ToolPaths exclude="extract"/>
    </Widget>

    <ToolReadme>
      <h1>Color palette from image</h1>
      <p>
        Upload any image and instantly extract its color palette. Tweak the colors, copy the hex codes,
        open them in the editor, or publish to the library.
      </p>

      <h2>Make a color palette for any image</h2>
      <p>
        This tool builds a <strong>color palette from an image</strong> in seconds. Upload a photo, a screenshot,
        game art or an illustration and it samples the picture to find its most representative colors. Everything
        runs in your browser — the image is never uploaded — so it's fast and private. Use it to grab a brand's
        colors, match a reference photo, or pull a starting palette before you draw in the
        <nuxt-link to="/editor">pixel art editor</nuxt-link>.
      </p>

      <h2>How it works</h2>
      <ol>
        <li><strong>Upload</strong> — choose any image. It loads locally and is scaled down just for fast, accurate color sampling.</li>
        <li><strong>Choose colors</strong> — pick 2–32 colors with the slider. A median-cut algorithm finds the dominant tones, not just the average.</li>
        <li><strong>Use it</strong> — edit any swatch, copy the hex codes, open it in the editor, or publish it to the palette library.</li>
      </ol>

      <h2>What you can do with it</h2>
      <ul>
        <li>Extract a brand or logo's exact colors from a screenshot.</li>
        <li>Pull a palette from a reference photo before drawing pixel art.</li>
        <li>Reduce a busy image to a clean set of 8 or 16 colors.</li>
        <li>Generate a <nuxt-link to="/palettes/color-palette-from-color">harmonious palette</nuxt-link> from the dominant color you found.</li>
        <li>Save and share palettes with the <nuxt-link to="/palettes">community library</nuxt-link>.</li>
      </ul>

      <QnA :items="FAQ"/>
    </ToolReadme>
  </div>
</template>

<style scoped>
.ext-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 220px;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--muted);
  font-weight: 600;
  overflow: hidden;
  transition: border-color var(--transition), color var(--transition);
}

.ext-drop:hover { color: var(--primary); }
.ext-drop.filled { padding: 0; border-style: solid; }
.ext-file { display: none; }
.ext-drop-icon { font-size: 32px; }
.ext-drop-hint { font-size: var(--text-xs); font-weight: 500; color: var(--muted); }
.ext-preview { width: 100%; height: 100%; max-height: 320px; object-fit: contain; image-rendering: pixelated; }

.ext-count { display: flex; align-items: center; gap: 0.625rem; margin-top: 0.875rem; font-size: var(--text-sm); }
.ext-count label { display: inline-flex; gap: var(--space-2); color: var(--muted); }
.ext-count label strong { color: var(--foreground); }
.ext-count input[type="range"] { flex: 1; accent-color: var(--primary); }
</style>
