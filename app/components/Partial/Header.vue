<script setup lang="ts">
import {useAuthStore} from "#build/imports";

const config = useRuntimeConfig()
const auth = useAuthStore()
</script>
<template>
  <header>
    <div class="container">
      <div class="menu">
        <nuxt-link to="/" class="item">
          <span class="icon icon-home"/>
          <span>Home</span>
        </nuxt-link>
      </div>
      <div>
        <div class="logout" v-if="auth.isLogged" @click="auth.logout()">Logout</div>
        <a v-else :href="`${config.public.api}/auth/google`">Login with Google</a>
      </div>
    </div>
  </header>
</template>

<style>
@reference "tailwindcss";

.menu {
  @apply flex gap-4;
}

.menu .item {
  @apply flex gap-1 items-center py-2;
}

header .container {
  @apply flex justify-between items-center;
}

header .logout {
  color: #ddd;
  cursor: pointer;
}
</style>