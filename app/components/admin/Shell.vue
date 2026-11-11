<script setup lang="ts">
/* The one frame every /admin screen sits in: the same tabs in the same
   place, the page's own actions on the right, and the staff gate. */
defineProps<{ title: string; busy?: boolean }>()
defineEmits<{ refresh: [] }>()

const auth = useAuthStore()
const isStaff = computed(() => !!(auth.logged as any)?.is_staff)

const TABS = [
  {to: '/admin', label: 'Overview', icon: 'adjust'},
  {to: '/admin/arts', label: 'Arts', icon: 'image'},
  {to: '/admin/users', label: 'Users', icon: 'user'},
  {to: '/admin/program', label: 'Creator Program', icon: 'trophy'},
]
</script>

<template>
  <div class="page">
    <section class="readme adm-panel">
      <h1 class="sr-only">Admin · {{ title }}</h1>
      <div class="adm-head">
        <nav class="adm-tabs" aria-label="Admin">
          <NuxtLinkLocale
              v-for="t in TABS"
              :key="t.to"
              :to="t.to"
              class="adm-tab"
              exact-active-class="is-active"
          >
            <span class="icon" :class="`icon-${t.icon}`"/><span>{{ t.label }}</span>
          </NuxtLinkLocale>
        </nav>
        <div v-if="isStaff" class="adm-head-actions">
          <slot name="actions"/>
          <button class="btn" :disabled="busy" title="Refresh" aria-label="Refresh" @click="$emit('refresh')">
            <span class="icon icon-refresh" :class="{'adm-spin': busy}"/>
          </button>
        </div>
      </div>

      <div class="adm-body">
        <p v-if="!isStaff" class="adm-empty text-xs text-muted">Staff only.</p>
        <slot v-else/>
      </div>
    </section>
    <slot name="outside"/>
  </div>
</template>
