<script setup lang="ts">
const props = defineProps<{
  error: {
    statusCode: number
    message: string
  }
}>()

const handleError = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="page text-center py-12">
    <section>
      <h1 class="text-4xl">{{ error.statusCode }}</h1>
      <p v-if="error.statusCode === 404">This page could not be found.</p>
      <p v-else>Something went wrong.</p>
      <div class="v-center mt-4 gap-4">
        <button class="btn primary" @click="handleError">Go Home</button>
        <nuxt-link to="/arts" class="btn">Browse Gallery</nuxt-link>
      </div>
    </section>
  </div>
</template>
