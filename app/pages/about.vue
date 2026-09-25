<script setup lang="ts">
useCustomSeoMeta({
  title: "About SimplePixelArt.com",
  description: "Learn about SimplePixelArt.com — a free online pixel art editor and gallery where anyone can create, share, and discover pixel art.",
  keywords: "about simple pixel art, pixel art editor, pixel art community, free pixel art maker",
  canonical: "https://simplepixelart.com/about",
});
</script>

<template>
  <div class="page prose">
    <h1>{{ $t('p_about.aboutSimplepixelartCom') }}</h1>
    <p v-html="$t('p_about.simplepixelartComIsAFreeOnline')"/>

    <h2>{{ $t('p_about.whatWeOffer') }}</h2>
    <ul>
      <li v-html="$t('p_about.strongFreePixelArtEditorStrong')"/>
      <li v-html="$t('p_about.strongGalleryStrongBrowseThousands')"/>
      <li v-html="$t('p_about.strongCreatorProfilesStrongArtists')"/>
      <li v-html="$t('p_about.strongCollectionsStrongOrganizeAnd')"/>
    </ul>

    <h2>{{ $t('p_about.ourMission') }}</h2>
    <p v-html="$t('p_about.weBelievePixelArtShouldBe')"/>

    <h2>{{ $t('p_about.openSource') }}</h2>
    <p v-html="$t('p_about.theEditorIsAHrefHttps')"/>

    <h2>{{ $t('p_about.contact') }}</h2>
    <p>{{ $t('p_about.haveAQuestionSuggestionOrFound') }} <NuxtLinkLocale to="/contact">{{ $t('p_about.contactPage') }}</NuxtLinkLocale> {{ $t('p_about.orEmail') }} <a href="mailto:comficker@gmail.com">comficker@gmail.com</a>.</p>

    <div class="tags">
      <div class="item"><NuxtLinkLocale to="/">{{ $t('common.home') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/editor">{{ $t('p_about.editor') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/arts">{{ $t('p_about.gallery') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/contact">{{ $t('p_about.contact') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/privacy">{{ $t('p_about.privacyPolicy') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/terms">{{ $t('p_about.termsOfService') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/guidelines">{{ $t('p_about.communityGuidelines') }}</NuxtLinkLocale></div>
      <div class="item"><NuxtLinkLocale to="/dmca">DMCA</NuxtLinkLocale></div>
    </div>
  </div>
</template>
