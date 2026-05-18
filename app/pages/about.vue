<script setup lang="ts">
useCustomSeoMeta({
  title: "About SimplePixelArt.com",
  description: "Learn about SimplePixelArt.com — a free online pixel art editor and gallery where anyone can create, share, and discover pixel art.",
  keywords: "about simple pixel art, pixel art editor, pixel art community, free pixel art maker",
  canonical: "https://simplepixelart.com/about",
});
</script>

<template>
  <div class="page">
    <section>
      <h1 class="page-title">About SimplePixelArt.com</h1>
      <p>SimplePixelArt.com is a free online platform for creating, sharing, and discovering pixel art. Whether you're a beginner picking up a digital brush for the first time or a seasoned artist looking for a lightweight editor, our tools are built to get out of your way and let you create.</p>
    </section>

    <section>
      <h2>What We Offer</h2>
      <ul class="policy-list">
        <li><strong>Free Pixel Art Editor</strong> — A canvas-based editor with brush, eraser, fill, and move tools. Supports multiple layers, undo/redo, mirror drawing, and canvas sizes from 8×8 up to 64×64.</li>
        <li><strong>Gallery</strong> — Browse thousands of pixel art pieces created by our community, updated daily. Filter by tags, categories, and canvas size.</li>
        <li><strong>Creator Profiles</strong> — Artists can sign in with Google and build a public portfolio of their work.</li>
        <li><strong>Collections</strong> — Organize and manage your pixel art projects in one place.</li>
      </ul>
    </section>

    <section>
      <h2>Our Mission</h2>
      <p>We believe pixel art should be accessible to everyone. Our goal is to provide a fast, clean, and distraction-free editor that works directly in the browser — no downloads, no subscriptions, no barriers.</p>
    </section>

    <section>
      <h2>Contact</h2>
      <p>Have a question, suggestion, or found a bug? See our <nuxt-link to="/contact">Contact page</nuxt-link> or email <a href="mailto:comficker@gmail.com">comficker@gmail.com</a>.</p>
    </section>

    <section>
      <div class="tags">
        <div class="item"><nuxt-link to="/">Home</nuxt-link></div>
        <div class="item"><nuxt-link to="/editor">Editor</nuxt-link></div>
        <div class="item"><nuxt-link to="/arts">Gallery</nuxt-link></div>
        <div class="item"><nuxt-link to="/contact">Contact</nuxt-link></div>
        <div class="item"><nuxt-link to="/privacy">Privacy Policy</nuxt-link></div>
        <div class="item"><nuxt-link to="/terms">Terms of Service</nuxt-link></div>
        <div class="item"><nuxt-link to="/guidelines">Community Guidelines</nuxt-link></div>
        <div class="item"><nuxt-link to="/dmca">DMCA</nuxt-link></div>
      </div>
    </section>
  </div>
</template>
