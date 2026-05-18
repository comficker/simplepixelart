<script setup lang="ts">
useCustomSeoMeta({
  title: "Terms of Service",
  description: "Terms of Service for SimplePixelArt.com. Read our terms before using the pixel art editor and gallery.",
  keywords: "terms of service, simplepixelart terms, user agreement",
  canonical: "https://simplepixelart.com/terms",
});
</script>

<template>
  <div class="page">
    <section>
      <h1 class="page-title">Terms of Service</h1>
      <p class="page-meta">Last updated: April 2026</p>
      <p>By using SimplePixelArt.com ("the site", "our service"), you agree to the following terms. Please read them carefully.</p>
    </section>

    <section>
      <h2>Use of the Service</h2>
      <ul class="policy-list">
        <li>SimplePixelArt.com provides a free online pixel art editor and gallery. You may use it for personal and commercial creative purposes.</li>
        <li>You must not use the service in any way that violates applicable laws or regulations.</li>
        <li>You must not attempt to disrupt, hack, or interfere with the service or its servers.</li>
        <li>Automated scraping or bulk downloading of content is not permitted without prior written permission.</li>
      </ul>
    </section>

    <section>
      <h2>User Accounts</h2>
      <ul class="policy-list">
        <li>You may use the editor without an account. Creating an account (via Google Sign-In) allows you to save and publish pixel art.</li>
        <li>You are responsible for maintaining the security of your account.</li>
        <li>We reserve the right to terminate accounts that violate these terms.</li>
      </ul>
    </section>

    <section>
      <h2>User-Generated Content</h2>
      <ul class="policy-list">
        <li>You retain ownership of pixel art you create. By publishing artwork on the site, you grant SimplePixelArt.com a non-exclusive license to display and distribute that content on the platform.</li>
        <li>You must not publish content that is illegal, harmful, defamatory, or infringes on the intellectual property rights of others. See our <nuxt-link to="/guidelines">Community Guidelines</nuxt-link>.</li>
        <li>We reserve the right to remove any content that violates these terms without notice.</li>
        <li>Published artwork is visible to the public. Do not publish artwork containing personal information.</li>
        <li>Copyright owners can submit takedown requests via our <nuxt-link to="/dmca">DMCA Policy</nuxt-link>.</li>
      </ul>
    </section>

    <section>
      <h2>Intellectual Property</h2>
      <p>The SimplePixelArt.com name, logo, and software are the property of SimplePixelArt.com. You may not reproduce, distribute, or create derivative works from our software or branding without permission.</p>
    </section>

    <section>
      <h2>Advertising</h2>
      <p>The site displays advertisements provided by Google AdSense. By using the site, you acknowledge that advertisements may be shown based on your browsing activity, as described in our <nuxt-link to="/privacy">Privacy Policy</nuxt-link>.</p>
    </section>

    <section>
      <h2>Disclaimer of Warranties</h2>
      <p>SimplePixelArt.com is provided "as is" without warranties of any kind. We do not guarantee that the service will be uninterrupted, error-free, or that your saved work will never be lost. We recommend keeping local backups of important artwork.</p>
    </section>

    <section>
      <h2>Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, SimplePixelArt.com shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.</p>
    </section>

    <section>
      <h2>Changes to Terms</h2>
      <p>We may update these Terms of Service at any time. Continued use of the site after changes are posted constitutes acceptance of the new terms.</p>
    </section>

    <section>
      <h2>Contact</h2>
      <p>If you have questions about these terms, contact us at <a href="mailto:comficker@gmail.com">comficker@gmail.com</a>.</p>
    </section>

    <section>
      <div class="tags">
        <div class="item"><nuxt-link to="/">Home</nuxt-link></div>
        <div class="item"><nuxt-link to="/about">About</nuxt-link></div>
        <div class="item"><nuxt-link to="/privacy">Privacy Policy</nuxt-link></div>
        <div class="item"><nuxt-link to="/contact">Contact</nuxt-link></div>
        <div class="item"><nuxt-link to="/dmca">DMCA</nuxt-link></div>
        <div class="item"><nuxt-link to="/guidelines">Community Guidelines</nuxt-link></div>
      </div>
    </section>
  </div>
</template>
