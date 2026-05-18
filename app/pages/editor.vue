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

useCustomSeoMeta({
  title: "Pixel Art editor - Free Online Tool",
  description: "Professional pixel art editor with advanced tools. Create 8-bit, 16-bit, and custom pixel art online. No download required, completely free.",
  keywords: "pixel art editor, online pixel editor, pixel drawing tool, create pixel art, pixel art maker, free editor",
  canonical: canonical.value,
  robots: editId.value ? 'noindex, follow' : 'index, follow',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Pixel Art editor",
        description: "Professional online pixel art editor with advanced tools for creating retro and modern pixel art",
        url: "https://simplepixelart.com/editor",
        applicationCategory: "GraphicsDesign",
        operatingSystem: "Any",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD"
        },
        featureList: [
          "Advanced pixel drawing tools",
          "Multiple brush sizes",
          "Color palette management",
          "Layer support",
          "Import/Export functionality",
          "Real-time preview"
        ],
        publisher: {
          "@type": "Organization",
          name: "SimplePixelArt.com",
          url: "https://simplepixelart.com"
        }
      })
    }
  ]
});
</script>

<template>
  <div class="page">
    <PXEditor/>
    <section class="editor-intro">
      <h2 class="editor-intro-heading">About This Editor</h2>
      <p>SimplePixelArt.com provides a free, browser-based pixel art editor — no installation or account required. Draw directly on a pixel grid with a full set of tools designed for both beginners and experienced artists.</p>
      <div class="editor-features">
        <div class="feature-item">
          <span class="icon icon-square feature-icon"/>
          <div>
            <strong>Brush & Eraser</strong>
            <span>Paint individual pixels or erase with precision. Adjust tool size for fine detail or broad strokes.</span>
          </div>
        </div>
        <div class="feature-item">
          <span class="icon icon-bucket feature-icon"/>
          <div>
            <strong>Fill Tool</strong>
            <span>Flood-fill an area with a single click. Perfect for quickly coloring large regions.</span>
          </div>
        </div>
        <div class="feature-item">
          <span class="icon icon-reflect-horizontal feature-icon"/>
          <div>
            <strong>Mirror Drawing</strong>
            <span>Enable horizontal or vertical mirroring to draw symmetric sprites twice as fast.</span>
          </div>
        </div>
        <div class="feature-item">
          <span class="icon icon-grid feature-icon"/>
          <div>
            <strong>Multiple Layers</strong>
            <span>Separate your artwork into layers — sketch on one, color on another, add details on top.</span>
          </div>
        </div>
        <div class="feature-item">
          <span class="icon icon-undo feature-icon"/>
          <div>
            <strong>Undo / Redo</strong>
            <span>Full history support. Experiment freely and step back through any change.</span>
          </div>
        </div>
        <div class="feature-item">
          <span class="icon icon-ruler feature-icon"/>
          <div>
            <strong>Custom Canvas Sizes</strong>
            <span>Choose from 8×8 up to 64×64 pixels. Pick the resolution that fits your project.</span>
          </div>
        </div>
        <div class="feature-item">
          <span class="icon icon-adjust feature-icon"/>
          <div>
            <strong>Color Palette</strong>
            <span>Build and save a custom color palette for your artwork. Swap colors across the entire canvas instantly.</span>
          </div>
        </div>
        <div class="feature-item">
          <span class="icon icon-social feature-icon"/>
          <div>
            <strong>Export & Share</strong>
            <span>Save your artwork and share it with the SimplePixelArt.com community. Export as PNG for use in games, web, or print.</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.editor-intro {
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.editor-intro > * + * {
  margin-top: 0.75rem;
}

.editor-intro-heading {
  font-size: var(--text-lg);
  line-height: var(--text-lg-lh);
  font-weight: 700;
  display: flex;
  align-items: center;
  color: var(--foreground);
}

.editor-intro p {
  line-height: 1.625;
  color: var(--foreground);
}

.editor-features {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

@media (min-width: 768px) {
  .editor-features {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.feature-item > div {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.feature-item strong {
  display: block;
  color: var(--foreground);
}

.feature-item span {
  display: block;
  line-height: 1.625;
  color: var(--muted);
}

.feature-item .feature-icon {
  flex-shrink: 0;
  color: var(--primary);
  font-size: 32px;
  margin-top: 2px;
}
</style>