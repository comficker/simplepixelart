<script setup lang="ts">
type Meta = {
  url: string
  title: string
  desc?: string
  imgSrcOrigin?: string
  imgSrc?: string
}

const props = defineProps<{ meta: Meta; position?: string; iconOnly?: boolean }>()

const encodedTitle = computed(() => encodeURIComponent(props.meta?.title || ''))
const encodedDesc = computed(() => encodeURIComponent(props.meta?.desc || props.meta?.title || ''))
const encodedImg = computed(() => encodeURIComponent(props.meta?.imgSrcOrigin || props.meta?.imgSrc || ''))

function withUtm(source: string): string {
  const base = props.meta?.url || ''
  if (!base) return ''
  try {
    const u = new URL(base)
    u.searchParams.set('utm_source', source)
    u.searchParams.set('utm_medium', 'social')
    u.searchParams.set('utm_campaign', 'art_share')
    if (props.meta?.title) {
      u.searchParams.set('utm_content', props.meta.title.slice(0, 100))
    }
    return u.toString()
  } catch (_e) {
    const sep = base.includes('?') ? '&' : '?'
    const content = props.meta?.title ? `&utm_content=${encodeURIComponent(props.meta.title.slice(0, 100))}` : ''
    return `${base}${sep}utm_source=${encodeURIComponent(source)}&utm_medium=social&utm_campaign=art_share${content}`
  }
}

const twitterUrl = computed(() => `https://twitter.com/intent/tweet?url=${encodeURIComponent(withUtm('twitter'))}&text=${encodedTitle.value}`)
const redditUrl = computed(() => `https://www.reddit.com/submit?url=${encodeURIComponent(withUtm('reddit'))}&title=${encodedTitle.value}`)
const pinterestUrl = computed(() => `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(withUtm('pinterest'))}&media=${encodedImg.value}&description=${encodedDesc.value}`)
</script>

<template>
  <ui-dropdown-menu :position="position">
    <button
        class="btn secondary share-trigger"
        :class="{'is-icon-only': iconOnly}"
        :disabled="!meta?.url"
        :title="iconOnly ? 'Share' : undefined"
        aria-label="Share"
    >
      <span class="icon icon-share"/>
      <span v-if="!iconOnly">Share</span>
    </button>
    <template #menu>
      <a class="drop-item" :href="twitterUrl" target="_blank" rel="noopener noreferrer" title="Share on X (Twitter)">
        <span class="icon icon-x"/> Twitter
      </a>
      <a class="drop-item" :href="redditUrl" target="_blank" rel="noopener noreferrer" title="Share on Reddit">
        <span class="icon icon-reddit"/> Reddit
      </a>
      <a class="drop-item" :href="pinterestUrl" target="_blank" rel="noopener noreferrer" title="Share on Pinterest">
        <span class="icon icon-pinterest"/> Pinterest
      </a>
    </template>
  </ui-dropdown-menu>
</template>

<style scoped>
/* Match the app's dropdown item rows (icon + label, flush, own separators
 * come from the global .dropdown-menu > * + * rule). a.drop-item keeps the
 * specificity above the global `.dropdown .drop-item` rule. */
a.drop-item {
  align-items: center;
  gap: var(--space-2);
  text-decoration: none;
  color: var(--foreground);
}

/* The icon-only variant owns its square padding — callers don't restyle it.
 * NB: class is "is-icon-only", NOT "icon-only" — the icons.css generator turns
 * any `icon-<x>` token into a mask-image rule, which would mask the button away. */
.share-trigger.is-icon-only {
  padding: 0.5rem;
}
</style>
