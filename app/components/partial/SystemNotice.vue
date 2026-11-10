<script setup lang="ts">
/* The top bar's notice section: whatever the system has to say right now
   (helper/notices.ts). The cross hides it for a day: the cookie holds the
   closed notice's id and expires after 24h, and a new notice (a new id)
   shows at once. A cookie, not localStorage, so the server renders the same
   bar and nothing flashes. */
import {SYSTEM_NOTICES} from '~/helper/notices'

const closed = useCookie<string | null>('notice_closed', {default: () => null, maxAge: 60 * 60 * 24})
const notice = computed(() => {
  const n = SYSTEM_NOTICES[0]
  return n && n.id !== closed.value ? n : null
})

function close() {
  if (notice.value) closed.value = notice.value.id
}
const external = computed(() => !!notice.value?.href && /^https?:/.test(notice.value.href))
</script>

<template>
  <section v-if="notice" class="sys-notice" :aria-label="$t('c_SystemNotice.label')">
    <component
        :is="notice.href ? (external ? 'a' : resolveComponent('NuxtLinkLocale')) : 'span'"
        v-bind="notice.href ? (external ? {href: notice.href, target: '_blank', rel: 'noopener'} : {to: notice.href}) : {}"
        class="sys-notice-body"
    >
      <span v-if="notice.icon" class="icon sys-notice-ic" :class="notice.icon" :style="notice.iconColor ? {color: notice.iconColor} : undefined" aria-hidden="true"/>
      <span class="sys-notice-text">{{ $t(notice.text) }}</span>
      <span v-if="notice.cta" class="sys-notice-cta">{{ $t(notice.cta) }}</span>
    </component>
    <button type="button" class="sys-notice-close" :aria-label="$t('common.close')" :title="$t('common.close')" @click="close">
      <span class="icon icon-close"/>
    </button>
  </section>
</template>

<style scoped>
.sys-notice {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  margin-left: auto;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: var(--text-xs);
  color: var(--muted);
  white-space: nowrap;
  transition: border-color var(--transition);
}

.sys-notice-body {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
  color: inherit;
}

.sys-notice-ic {
  flex-shrink: 0;
}

.sys-notice-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.sys-notice-cta {
  font-weight: 600;
  color: var(--primary);
}

.sys-notice-close {
  display: inline-flex;
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-1);
  color: var(--muted);
}

.sys-notice-close .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

@media (hover: hover) and (pointer: fine) {
  .sys-notice:hover {
    border-color: var(--primary);
  }

  .sys-notice-body:hover,
  .sys-notice-close:hover {
    color: var(--foreground);
  }
}
</style>
