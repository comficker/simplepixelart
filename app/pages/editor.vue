<script setup lang="ts">
useCustomSeoMeta({
  title: "Pixel Art editor - Free Online Tool",
  description: "Professional pixel art editor with advanced tools. Create 8-bit, 16-bit, and custom pixel art online. No download required, completely free.",
  keywords: "pixel art editor, online pixel editor, pixel drawing tool, create pixel art, pixel art maker, free editor",
  canonical: "https://simplepixelart.com/editor",
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
          <strong>Brush & Eraser</strong>
          <span>Paint individual pixels or erase with precision. Adjust tool size for fine detail or broad strokes.</span>
        </div>
        <div class="feature-item">
          <strong>Fill Tool</strong>
          <span>Flood-fill an area with a single click. Perfect for quickly coloring large regions.</span>
        </div>
        <div class="feature-item">
          <strong>Mirror Drawing</strong>
          <span>Enable horizontal or vertical mirroring to draw symmetric sprites twice as fast.</span>
        </div>
        <div class="feature-item">
          <strong>Multiple Layers</strong>
          <span>Separate your artwork into layers — sketch on one, color on another, add details on top.</span>
        </div>
        <div class="feature-item">
          <strong>Undo / Redo</strong>
          <span>Full history support. Experiment freely and step back through any change.</span>
        </div>
        <div class="feature-item">
          <strong>Custom Canvas Sizes</strong>
          <span>Choose from 8×8 up to 64×64 pixels. Pick the resolution that fits your project.</span>
        </div>
        <div class="feature-item">
          <strong>Color Palette</strong>
          <span>Build and save a custom color palette for your artwork. Swap colors across the entire canvas instantly.</span>
        </div>
        <div class="feature-item">
          <strong>Export & Share</strong>
          <span>Save your artwork and share it with the SimplePixelArt.com community. Export as PNG for use in games, web, or print.</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.editor-intro {
  @apply space-y-3 pt-4;
  border-top: 1px solid var(--border);
}

.editor-intro-heading {
  @apply text-sm font-bold flex items-center;
  color: var(--foreground);
}

.editor-intro p {
  @apply text-xs leading-relaxed;
  color: var(--foreground);
}

.editor-features {
  @apply grid grid-cols-1 md:grid-cols-2 gap-3 mt-2;
}

.feature-item {
  @apply flex flex-col gap-1;
}

.feature-item strong {
  @apply text-xs;
  color: var(--foreground);
}

.feature-item span {
  @apply text-xs leading-relaxed;
  color: var(--muted);
}
</style>