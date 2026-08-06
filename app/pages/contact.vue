<script setup lang="ts">
useCustomSeoMeta({
  title: "Contact SimplePixelArt.com",
  description: "Contact SimplePixelArt.com — report a bug, request a feature, flag content, or submit a business inquiry. We respond within 3 business days.",
  keywords: "contact simple pixel art, support, bug report, feedback",
  canonical: "https://simplepixelart.com/contact",
});
</script>

<template>
  <div class="page">
    <section>
      <h1 class="page-title">Contact Us</h1>
      <p>We read every message. Pick the channel that matches your request.</p>
    </section>

    <section>
      <h2>General Support</h2>
      <p>Questions about the editor, account issues, feedback, or feature requests:</p>
      <p><a href="mailto:comficker@gmail.com?subject=SimplePixelArt%20Support">comficker@gmail.com</a></p>
      <p class="page-meta">Typical response: within 3 business days.</p>
    </section>

    <section>
      <h2>Copyright / DMCA</h2>
      <p>If your copyrighted work was published without permission, submit a takedown notice following our <nuxt-link to="/dmca">DMCA Policy</nuxt-link>.</p>
      <p><a href="mailto:comficker@gmail.com?subject=DMCA%20Takedown%20Request">comficker@gmail.com</a></p>
    </section>

    <section>
      <h2>Report Abuse</h2>
      <p>Content that violates our <nuxt-link to="/guidelines">Community Guidelines</nuxt-link> (illegal, hateful, harassing, or sexually explicit material):</p>
      <p><a href="mailto:comficker@gmail.com?subject=Abuse%20Report">comficker@gmail.com</a></p>
      <p class="page-meta">Include the artwork URL and a brief description of the issue.</p>
    </section>

    <section>
      <h2>Privacy Requests</h2>
      <p>Account deletion, data export (GDPR/CCPA), or privacy-related inquiries:</p>
      <p><a href="mailto:comficker@gmail.com?subject=Privacy%20Request">comficker@gmail.com</a></p>
    </section>

    <section>
      <h2>Business / Press</h2>
      <p>Partnerships, advertising questions, press inquiries:</p>
      <p><a href="mailto:comficker@gmail.com?subject=Business%20Inquiry">comficker@gmail.com</a></p>
    </section>

    <section>
      <div class="tags">
        <div class="item"><nuxt-link to="/">Home</nuxt-link></div>
        <div class="item"><nuxt-link to="/about">About</nuxt-link></div>
        <div class="item"><nuxt-link to="/privacy">Privacy Policy</nuxt-link></div>
        <div class="item"><nuxt-link to="/terms">Terms of Service</nuxt-link></div>
        <div class="item"><nuxt-link to="/dmca">DMCA</nuxt-link></div>
        <div class="item"><nuxt-link to="/guidelines">Community Guidelines</nuxt-link></div>
      </div>
    </section>
  </div>
</template>
