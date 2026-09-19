<script setup lang="ts">
const auth = useAuthStore()
const googleAuthUrl = useGoogleAuthUrl()
</script>

<template>
  <div class="social-auth">
    <a
        href="https://github.com/comficker/simplepixelart"
        target="_blank"
        rel="noopener"
        class="social-ic"
        title="Open source on GitHub"
        aria-label="GitHub repository"
    >
      <span class="icon icon-github"/>
    </a>
    <a
        href="https://x.com/comficker"
        target="_blank"
        rel="noopener"
        class="social-ic"
        title="Follow on X"
        aria-label="X (Twitter)"
    >
      <span class="icon icon-brand-x"/>
    </a>
    <span class="social-sep" aria-hidden="true"/>
    <span v-if="auth.isLogged" class="social-auth-link" @click="auth.logout()">Logout</span>
    <a v-else :href="googleAuthUrl" class="social-auth-link">Login</a>
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
