<script setup lang="ts">
/** `compact` is the top bar: the project's own accounts are in the sidebar
 *  from 1024px up, so it drops them, and its controls are icons like the rest
 *  of that row. The footer stays as it is -- it is the only place the project
 *  links appear below that width, and it has room for words. */
withDefaults(defineProps<{ compact?: boolean }>(), {compact: false})

const auth = useAuthStore()
const loginModal = useLoginModal()
</script>

<template>
  <div class="social-auth">
    <a
        v-if="!compact"
        href="https://github.com/comficker/simplepixelart"
        target="_blank"
        rel="noopener"
        class="social-ic"
        :title="$t('c_SocialAuth.openSourceOnGithub')"
        :aria-label="$t('c_SocialAuth.githubRepository')"
    >
      <span class="icon icon-github"/>
    </a>
    <a
        v-if="!compact"
        href="https://x.com/comficker"
        target="_blank"
        rel="noopener"
        class="social-ic"
        :title="$t('c_SocialAuth.followOnX')"
        :aria-label="$t('c_SocialAuth.xTwitter')"
    >
      <span class="icon icon-brand-x"/>
    </a>
    <span v-if="!compact" class="social-sep" aria-hidden="true"/>
    <!-- Settings works signed out too -- theme, language and app data are all
         on it -- so it is not hidden behind an account any more. -->
    <NuxtLinkLocale v-if="compact" to="/settings" class="hdr-link" :title="$t('common.settings')">
      <span class="icon icon-cog"/>
    </NuxtLinkLocale>
    <NuxtLinkLocale v-else to="/settings" class="social-auth-link">{{ $t('common.settings') }}</NuxtLinkLocale>

    <template v-if="!auth.isLogged">
      <!-- In the bar these two sat at the same weight as each other and
           brighter than every icon beside them, so the row shouted its least
           used controls. Sign-in joins the muted icon row it sits in, and
           the one action worth pointing at is the only lit thing. -->
      <template v-if="compact">
        <span class="social-sep" aria-hidden="true"/>
        <button type="button" class="hdr-link" @click="loginModal.show()">
          {{ $t('c_SocialAuth.login') }}
        </button>
        <button type="button" class="btn primary" @click="loginModal.show(undefined, 'register')">
          {{ $t('c_LoginModal.createAccount') }}
        </button>
      </template>
      <template v-else>
        <span class="social-auth-link" @click="loginModal.show()">{{ $t('c_SocialAuth.login') }}</span>
        <span class="social-auth-link" @click="loginModal.show(undefined, 'register')">{{ $t('c_LoginModal.createAccount') }}</span>
      </template>
    </template>
  </div>
</template>

<style scoped>
.social-auth {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
}

.social-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--muted);
  transition: color var(--transition);
}

.social-ic .icon {
  width: 17px;
  height: 17px;
}

.social-sep {
  width: 1px;
  height: 14px;
  background: var(--border);
}

.social-auth-link {
  display: inline-flex;
  align-items: center;
  font-weight: 600;
  color: var(--foreground);
  cursor: pointer;
  transition: color var(--transition);
}

@media (pointer: coarse) {
  .social-ic,
  .social-auth-link {
    min-height: 32px;
    min-width: 32px;
    justify-content: center;
  }
}

@media (hover: hover) and (pointer: fine) {
  .social-ic:hover,
  .social-auth-link:hover {
    color: var(--primary);
  }
}
</style>
