<script setup lang="ts">
/** The signed-in account, last in the bar: who you are, your pages,
 *  settings and the way out. Log out used to live only at the bottom of
 *  Settings and in the command palette, where nobody found it. */
/** `feedback` adds Send feedback: on phones the header has no room for its
 *  own button once you are signed in. */
defineProps<{ feedback?: boolean }>()
const auth = useAuthStore()
const {openFeedback} = useFeedback()
const username = computed(() => auth.logged?.username || '')
</script>

<template>
  <ui-dropdown-menu v-if="auth.isLogged" position="right" :label="$t('p_settings.account')">
    <button type="button" class="hdr-link" :title="username ? `@${username}` : $t('p_settings.account')">
      <span class="icon icon-account"/>
    </button>
    <template #menu>
      <div class="file-menu">
        <div v-if="username" class="file-menu-item file-menu-heading">@{{ username }}</div>
        <NuxtLinkLocale v-if="username" :to="`/creator/${username}`" class="file-menu-item">
          <span class="icon icon-account"/><span>{{ $t('c_SocialAuth.yourPublicProfile') }}</span>
        </NuxtLinkLocale>
        <NuxtLinkLocale to="/work" class="file-menu-item">
          <span class="icon icon-workspace"/><span>{{ $t('nav.yourWork') }}</span>
        </NuxtLinkLocale>
        <NuxtLinkLocale to="/settings" class="file-menu-item">
          <span class="icon icon-cog"/><span>{{ $t('common.settings') }}</span>
        </NuxtLinkLocale>
        <button v-if="feedback" type="button" class="file-menu-item" @click="openFeedback('header')">
          <span class="icon icon-chat"/><span>{{ $t('c_Feedback.title') }}</span>
        </button>
        <div class="file-menu-sep"/>
        <button type="button" class="file-menu-item" @click="auth.logout()">
          <span class="icon icon-logout"/><span>{{ $t('common.logOut') }}</span>
        </button>
      </div>
    </template>
  </ui-dropdown-menu>
</template>
