<script setup lang="ts">
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
      <div class="menu">
        <nuxt-link to="/arts" class="item">
          <span>Gallery</span>
        </nuxt-link>
<nuxt-link to="/work" class="item">
          <span>Your work</span>
        </nuxt-link>
        <div class="item" v-if="auth.isLogged" @click="auth.logout()">Logout</div>
        <a class="item" v-else :href="`${config.public.api}/auth/google`">Login with Google</a>
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