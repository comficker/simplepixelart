<script setup lang="ts">
useCustomSeoMeta({
  title: "Pixel Art Editor - Free Online Tool",
  description: "Professional pixel art editor with advanced tools. Create 8-bit, 16-bit, and custom pixel art online. No download required, completely free.",
  keywords: "pixel art editor, online pixel editor, pixel drawing tool, create pixel art, pixel art maker, free editor",
  canonical: "https://simplepixelart.com/editor",
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Pixel Art Editor",
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
  <PXEditor/>
 </template>