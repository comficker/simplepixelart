<script setup lang="ts">
useCustomSeoMeta({
  title: "Contact SimplePixelArt.com",
  description: "Contact SimplePixelArt.com — report a bug, request a feature, flag content, or submit a business inquiry. We respond within 3 business days.",
  keywords: "contact simple pixel art, support, bug report, feedback",
  canonical: "https://simplepixelart.com/contact",
});
</script>

<template>
  <div class="page prose">
    <h1>{{ $t('p_contact.contactUs') }}</h1>
    <p v-html="$t('p_contact.weReadEveryMessagePickThe')"/>

    <h2>{{ $t('p_contact.bugsAmpFeatureRequests') }}</h2>
    <p v-html="$t('p_contact.simplepixelartIsAHrefHttpsGithub')"/>

    <h2>{{ $t('p_contact.generalSupport') }}</h2>
    <p v-html="$t('p_contact.questionsAboutTheEditorAccountIssu')"/>
    <p><a href="mailto:comficker@gmail.com?subject=SimplePixelArt%20Support">comficker@gmail.com</a></p>
    <p class="page-meta" v-html="$t('p_contact.typicalResponseWithin3BusinessDays')"/>

    <h2>{{ $t('p_contact.copyrightDmca') }}</h2>
    <p>{{ $t('p_contact.ifYourCopyrightedWorkWasPublished') }} <NuxtLinkLocale to="/dmca">{{ $t('p_contact.dmcaPolicy') }}</NuxtLinkLocale>.</p>
    <p><a href="mailto:comficker@gmail.com?subject=DMCA%20Takedown%20Request">comficker@gmail.com</a></p>

    <h2>{{ $t('p_contact.reportAbuse') }}</h2>
    <p>{{ $t('p_contact.contentThatViolatesOur') }} <NuxtLinkLocale to="/guidelines">{{ $t('p_contact.communityGuidelines') }}</NuxtLinkLocale> {{ $t('p_contact.illegalHatefulHarassingOrSexuallyE') }}</p>
    <p><a href="mailto:comficker@gmail.com?subject=Abuse%20Report">comficker@gmail.com</a></p>
    <p class="page-meta" v-html="$t('p_contact.includeTheArtworkUrlAndA')"/>

    <h2>{{ $t('p_contact.privacyRequests') }}</h2>
    <p v-html="$t('p_contact.accountDeletionDataExportGdprCcpa')"/>
    <p><a href="mailto:comficker@gmail.com?subject=Privacy%20Request">comficker@gmail.com</a></p>

    <h2>{{ $t('p_contact.businessPress') }}</h2>
    <p v-html="$t('p_contact.partnershipsAdvertisingQuestionsPr')"/>
    <p><a href="mailto:comficker@gmail.com?subject=Business%20Inquiry">comficker@gmail.com</a></p>

    <div class="tags">
      <div class="item"><NuxtLinkLocale to="/">{{ $t('common.home') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/about">{{ $t('p_contact.about') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/privacy">{{ $t('common.privacyPolicy') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/terms">{{ $t('p_contact.termsOfService') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/dmca">{{ $t('common.dmca') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/guidelines">{{ $t('p_contact.communityGuidelines') }}</NuxtLinkLocale></div>
    </div>
  </div>
</template>
