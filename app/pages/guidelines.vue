<script setup lang="ts">
useCustomSeoMeta({
  title: "Community Guidelines",
  description: "Community guidelines for SimplePixelArt.com. Rules on user-generated pixel art, copyright, harassment, and what gets removed.",
  keywords: "community guidelines, simplepixelart rules, content policy, moderation",
  canonical: "https://simplepixelart.com/guidelines",
});
</script>

<template>
  <div class="page">
    <section>
      <h1 class="text-2xl">Community Guidelines</h1>
      <p class="text-xs text-gray-500">Last updated: April 2026</p>
      <p>SimplePixelArt.com is a creative platform open to everyone. These guidelines keep it a safe, welcoming, and legal place for artists of all levels. Breaking them can result in removed artwork, suspended accounts, or permanent bans.</p>
    </section>

    <section>
      <h2>What's Not Allowed</h2>
      <ul class="space-y-2 list-none">
        <li><strong>Illegal content</strong> — Anything that violates applicable law, including child sexual abuse material (CSAM), incitement to violence, or content that promotes terrorism.</li>
        <li><strong>Sexually explicit content</strong> — Nudity, pornography, or sexually suggestive material. SimplePixelArt is not an adult platform.</li>
        <li><strong>Hate speech</strong> — Content that attacks, threatens, or dehumanizes people based on race, ethnicity, national origin, religion, disability, gender, sexual orientation, or other protected characteristics.</li>
        <li><strong>Harassment & bullying</strong> — Targeted abuse, doxxing, or sustained insults toward other users.</li>
        <li><strong>Violence & gore</strong> — Graphic depictions of real-world violence, self-harm, or animal cruelty.</li>
        <li><strong>Copyright infringement</strong> — Uploading artwork that copies or closely traces protected characters, logos, or images without permission. See our <nuxt-link to="/dmca">DMCA Policy</nuxt-link>.</li>
        <li><strong>Impersonation</strong> — Pretending to be another person, brand, or organization.</li>
        <li><strong>Spam & scams</strong> — Bulk low-effort uploads, phishing links, misleading promotions, or referral abuse.</li>
        <li><strong>Personal information</strong> — Publishing addresses, phone numbers, government IDs, or private data of yourself or others.</li>
        <li><strong>Malware</strong> — Uploading files or links that contain or distribute malicious code.</li>
      </ul>
    </section>

    <section>
      <h2>Fan Art & Derivative Work</h2>
      <p>Fan art of copyrighted characters sits in a gray zone. We allow transformative pixel-art reinterpretations, but we will remove artwork on valid rights-holder request. If you're recreating an exact logo or frame-by-frame copy, expect a takedown.</p>
    </section>

    <section>
      <h2>Reporting Violations</h2>
      <p>Flag artwork that breaks these rules by emailing <a href="mailto:comficker@gmail.com?subject=Abuse%20Report">comficker@gmail.com</a>. Include:</p>
      <ul class="space-y-2 list-none">
        <li>The URL of the artwork or profile.</li>
        <li>The rule you believe was broken.</li>
        <li>Any supporting context (screenshots, links).</li>
      </ul>
      <p>For copyright-specific issues, use our <nuxt-link to="/dmca">DMCA process</nuxt-link> instead.</p>
    </section>

    <section>
      <h2>Enforcement</h2>
      <ul class="space-y-2 list-none">
        <li><strong>First minor violation:</strong> Content removed, warning sent.</li>
        <li><strong>Repeated or severe violations:</strong> Account suspension or permanent ban.</li>
        <li><strong>Illegal content:</strong> Immediate removal and, where required, report to law enforcement (e.g., NCMEC for CSAM).</li>
      </ul>
      <p>We review reports manually and may remove content proactively when we detect violations. Decisions are final but can be appealed via <nuxt-link to="/contact">Contact</nuxt-link>.</p>
    </section>

    <section>
      <h2>Age Requirements</h2>
      <p>You must be at least 13 years old to use SimplePixelArt.com. Users under 18 should have a parent or guardian review these guidelines.</p>
    </section>

    <section>
      <div class="tags">
        <div class="item"><nuxt-link to="/">Home</nuxt-link></div>
        <div class="item"><nuxt-link to="/about">About</nuxt-link></div>
        <div class="item"><nuxt-link to="/terms">Terms of Service</nuxt-link></div>
        <div class="item"><nuxt-link to="/privacy">Privacy Policy</nuxt-link></div>
        <div class="item"><nuxt-link to="/dmca">DMCA</nuxt-link></div>
        <div class="item"><nuxt-link to="/contact">Contact</nuxt-link></div>
      </div>
    </section>
  </div>
</template>
