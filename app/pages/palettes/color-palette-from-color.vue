<script setup lang="ts">
const {t} = useI18n()

import {generatePalette, SCHEME_TYPES, type SchemeType} from "~/helper/color";

const TONE_OPTIONS = [
  {key: 'subtle', label: t('p_palettes_color-palette-from-color.subtle'), spread: 0.16},
  {key: 'medium', label: t('p_palettes_color-palette-from-color.medium'), spread: 0.34},
  {key: 'strong', label: t('p_palettes_color-palette-from-color.strong'), spread: 0.52},
] as const

const base = ref('#4F7CFF')
const type = ref<SchemeType>('complementary')
const count = ref(6)
const tone = ref<'subtle' | 'medium' | 'strong'>('medium')
const colors = ref<string[]>([])
const variant = ref(0)

const toneSpread = computed(() => TONE_OPTIONS.find(t => t.key === tone.value)?.spread ?? 0.34)

function regen() {
  colors.value = generatePalette(base.value, type.value, count.value, toneSpread.value, variant.value)
}

watch([base, type, count, tone], () => { variant.value = 0; regen() }, {immediate: true})

const activeHint = computed(() => SCHEME_TYPES.find(s => s.key === type.value)?.hint || '')

const PRESETS = ['#FF5C5C', '#FF9F1C', '#FFD23F', '#2EC4B6', '#4F7CFF', '#7B5CFF', '#FF5C9E', '#1B2430']

function shuffle() {
  variant.value = variant.value + 1
  regen()
}

function onHex(e: Event) {
  const el = e.target as HTMLInputElement
  const v = el.value.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(v)) base.value = '#' + v.toUpperCase()
  else if (/^[0-9a-fA-F]{3}$/.test(v)) base.value = '#' + v.split('').map(c => c + c).join('').toUpperCase()
  else el.value = base.value
}

const FAQ = [
  {q: 'How do I make a color palette from one color?', a: 'Pick your base color, choose a harmony, then set how many colors and how much tonal spread you want. The matching colors are calculated from the color wheel instantly.', icon: 'icon-swap'},
  {q: 'What do the harmony types mean?', a: 'Complementary uses the opposite color for high contrast. Analogous uses neighbours for a calm blend. Triadic and Square space colors evenly for vivid balance. Monochrome and Shades vary one hue tonally.', icon: 'icon-adjust'},
  {q: 'Can I choose the number of colors?', a: 'Yes. Set the palette size from 2 to 16 colors, and pick a Tones level (Subtle, Medium or Strong) to control how light-to-dark the palette spreads.', icon: 'icon-grid'},
  {q: 'Is it free?', a: 'Yes — completely free, no signup. You only need an account if you want to publish a palette to the public library.', icon: 'icon-check'},
  {q: 'Can I edit the generated colors?', a: 'Yes. Click any swatch to adjust it, add or remove colors, then copy the hex codes, open them in the editor, or publish.', icon: 'icon-pen'},
  {q: 'Where can I use the palette?', a: 'Copy the hex codes into any design or game project, open the palette straight in the pixel art editor, or save it to the library to reuse later.', icon: 'icon-pen'},
]

useCustomSeoMeta({
  title: "Color Palette from One Color",
  description: "Pick one color and generate a matching palette — complementary, analogous, triadic, square, monochrome or shades. Copy the hex codes or edit them.",
  keywords: "color palette by color, color palette from color, color palette generator, palette from one color, color harmony palette, complementary colors, analogous colors, triadic colors, color combinations",
  canonical: "https://simplepixelart.com/palettes/color-palette-from-color",
  robots: "index, follow",
  ogImage: "https://simplepixelart.com/og-image.png",
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: 'Color Palette by Color',
            description: 'Free browser tool that generates a harmonious color palette from a single base color — choose a harmony, the number of colors and the tonal spread.',
            url: 'https://simplepixelart.com/palettes/color-palette-from-color',
            applicationCategory: 'DesignApplication',
            operatingSystem: 'Any (browser-based)',
            offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
            featureList: [
              'Generate a color palette from one color',
              'Complementary, analogous, triadic, square, split, monochrome and shades',
              'Choose 2–16 colors and the tonal spread',
              'Edit, add or remove colors',
              'Copy hex codes or download',
              'Open the palette in the pixel art editor',
            ],
            publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
          },
          {
            '@type': 'HowTo',
            name: 'How to create a color palette from a color',
            description: 'Generate a matching color palette from one base color in three steps.',
            totalTime: 'PT1M',
            tool: [{'@type': 'HowToTool', name: 'Color Palette by Color (web browser)'}],
            step: [
              {'@type': 'HowToStep', name: 'Pick a base color', text: 'Choose your starting color with the picker or paste a hex code.'},
              {'@type': 'HowToStep', name: 'Choose harmony, count and tones', text: 'Select a harmony, set how many colors you want, and pick the tonal spread. The palette updates instantly.'},
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
        ],
      }),
    },
  ],
})
</script>

<template>
  <div class="page">
    <header class="tool-hero">
      <span class="tool-eyebrow">{{ $t('p_palettes_color-palette-from-color.colorTool') }}</span>
      <h1 class="tool-title">{{ $t('p_palettes_color-palette-from-color.colorPaletteByColor') }}</h1>
      <p class="tool-sub" v-html="$t('p_palettes_color-palette-from-color.pickOneColorAndGetA')"/>
    </header>

    <div class="tool-card">
      <div class="tool-pane">
        <span class="tool-pane-cap">{{ $t('p_palettes_color-palette-from-color.baseColor') }}</span>
        <div class="scheme-base">
          <label class="scheme-swatch" :style="{ background: base }" :title="$t('p_palettes_color-palette-from-color.pickAColor')">
            <input type="color" v-model="base" class="scheme-color-input" :aria-label="$t('p_palettes_color-palette-from-color.baseColor')"/>
          </label>
          <div class="scheme-base-fields">
            <input
                type="text"
                class="scheme-hex"
                :value="base"
                spellcheck="false"
                :aria-label="$t('p_palettes_color-palette-from-color.baseHexColor')"
                @change="onHex"
                @keydown.enter="onHex"
            />
            <div class="scheme-presets">
              <button
                  v-for="p in PRESETS" :key="p"
                  type="button"
                  class="scheme-preset"
                  :class="{ active: p === base }"
                  :style="{ background: p }"
                  :title="p"
                  :aria-label="$t('common.useX', {x: p})"
                  @click="base = p"
              />
            </div>
          </div>
        </div>

        <span class="tool-pane-cap scheme-harm-cap">{{ $t('p_palettes_color-palette-from-color.harmony') }}</span>
        <div class="scheme-harm-grid">
          <button
              v-for="h in SCHEME_TYPES" :key="h.key"
              type="button"
              class="scheme-harm" :class="{ active: type === h.key }"
              @click="type = h.key"
          >{{ h.label }}</button>
        </div>

        <div class="scheme-count-row">
          <span class="tool-pane-cap scheme-count-cap">{{ $t('common.colors') }} <strong>{{ count }}</strong></span>
          <input type="range" min="2" max="16" v-model.number="count" class="scheme-range" :aria-label="$t('p_palettes_color-palette-from-color.numberOfColors')"/>
        </div>

        <span class="tool-pane-cap scheme-harm-cap">{{ $t('p_palettes_color-palette-from-color.tones') }}</span>
        <div class="scheme-tones">
          <button
              v-for="o in TONE_OPTIONS" :key="o.key"
              type="button"
              class="scheme-harm" :class="{ active: tone === o.key }"
              @click="tone = o.key"
          >{{ o.label }}</button>
        </div>

        <button
            type="button"
            class="scheme-refresh"
            :title="$t('p_palettes_color-palette-from-color.generateAnotherPaletteForThisColor')"
            :aria-label="$t('p_palettes_color-palette-from-color.refreshPalette')"
            @click="shuffle"
        >
          <span class="icon icon-rotate-right"/>
          <span>{{ $t('p_palettes_color-palette-from-color.refresh') }}</span>
        </button>
      </div>

      <div class="tool-pane">
        <p class="scheme-hint">{{ activeHint }}</p>
        <PaletteComposer
            v-model:colors="colors"
            source="scheme"
            name-:placeholder="$t('common.paletteName')"
            default-name="Color palette"
        />
      </div>
    </div>

    <Widget :title="$t('p_palettes_color-palette-from-color.moreTools')" class="tool-more">
      <ToolPaths/>
    </Widget>

    <ToolReadme>
      <h2>{{ $t('p_palettes_color-palette-from-color.buildAColorPaletteFromOne') }}</h2>
      <p> {{ $t('p_palettes_color-palette-from-color.startWithASingleColorAnd') }} <strong>{{ $t('p_palettes_color-palette-from-color.colorPaletteFromThatColor') }}</strong> {{ $t('p_palettes_color-palette-from-color.usingTheRulesOfColorTheory') }} <NuxtLinkLocale to="/palettes/color-palette-from-image">{{ $t('p_palettes_color-palette-from-color.imageColorPaletteTool') }}</NuxtLinkLocale> {{ $t('p_palettes_color-palette-from-color.firstThenBuildAPaletteAround') }} </p>

      <h2>{{ $t('p_palettes_color-palette-from-color.theHarmonyTypes') }}</h2>
      <ul>
        <li><strong>{{ $t('p_palettes_color-palette-from-color.complementary') }}</strong> {{ $t('p_palettes_color-palette-from-color.complementaryDesc') }}</li>
        <li><strong>{{ $t('p_palettes_color-palette-from-color.analogous') }}</strong> {{ $t('p_palettes_color-palette-from-color.analogousDesc') }}</li>
        <li><strong>{{ $t('p_palettes_color-palette-from-color.triadicAmpSquare') }}</strong> {{ $t('p_palettes_color-palette-from-color.triadicDesc') }}</li>
        <li><strong>{{ $t('p_palettes_color-palette-from-color.split') }}</strong> {{ $t('p_palettes_color-palette-from-color.splitDesc') }}</li>
        <li><strong>{{ $t('p_palettes_color-palette-from-color.monochrome') }}</strong> {{ $t('p_palettes_color-palette-from-color.monochromeDesc') }}</li>
        <li><strong>{{ $t('p_palettes_color-palette-from-color.shadesAmpTints') }}</strong> {{ $t('p_palettes_color-palette-from-color.shadesDesc') }}</li>
      </ul>

      <h2>{{ $t('common.howToUseIt') }}</h2>
      <ul>
        <li v-html="$t('p_palettes_color-palette-from-color.pickABaseColorWithThe')"/>
        <li v-html="$t('p_palettes_color-palette-from-color.switchHarmonyTypesToComparePalette')"/>
        <li v-html="$t('p_palettes_color-palette-from-color.setTheNumberOfColorsAnd')"/>
        <li v-html="$t('p_palettes_color-palette-from-color.editAnySwatchThenCopyThe')"/>
        <li><NuxtLinkLocale to="/editor?new=true">{{ $t('p_palettes_color-palette-from-color.openThePaletteInTheEditor') }}</NuxtLinkLocale> {{ $t('p_palettes_color-palette-from-color.toStartDrawingRightAway') }}</li>
        <li>{{ $t('p_palettes_color-palette-from-color.publishItToThe') }} <NuxtLinkLocale to="/palettes">{{ $t('p_palettes_color-palette-from-color.paletteLibrary') }}</NuxtLinkLocale> {{ $t('p_palettes_color-palette-from-color.toReuseAndShare') }}</li>
      </ul>

      <QnA :items="FAQ"/>
    </ToolReadme>
  </div>
</template>

<style scoped>
.scheme-base {
  display: flex;
  gap: 0.875rem;
  margin-bottom: 1.25rem;
}

.scheme-swatch {
  position: relative;
  flex: none;
  width: 84px;
  height: 84px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  overflow: hidden;
}

.scheme-color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  border: 0;
  padding: 0;
}

.scheme-base-fields {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-3);
  min-width: 0;
  flex: 1;
}

.scheme-hex {
  width: 100%;
  max-width: 160px;
  height: 36px;
  padding: 0 0.625rem !important;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.scheme-refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  height: 38px;
  margin-top: 1.25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--foreground);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}

.scheme-refresh:hover {
  color: var(--primary);
}

.scheme-refresh .icon {
  width: 15px;
  height: 15px;
}

.scheme-presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.scheme-preset {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: var(--radius-pill);
  border: 0;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.scheme-preset.active {
  box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--primary);
}

.scheme-harm-cap { margin-top: 1.25rem; }

.scheme-harm-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.scheme-count-row {
  margin-top: 1.25rem;
}

.scheme-count-cap {
  margin-bottom: 0.5rem;
}

.scheme-count-cap strong {
  color: var(--foreground);
  font-size: var(--text-sm);
  margin-left: 0.25rem;
}

.scheme-range {
  width: 100%;
  accent-color: var(--primary);
}

.scheme-tones {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.scheme-harm {
  height: 34px;
  padding: 0 0.625rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}

.scheme-harm.active {
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  border-color: var(--primary);
  color: var(--primary);
}

.scheme-hint {
  font-size: var(--text-xs);
  color: var(--muted);
  margin-bottom: 0.875rem;
  min-height: 1.5em;
}
</style>
