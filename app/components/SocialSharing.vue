<script setup lang="ts">
type Meta = {
  url: string
  title: string
  desc?: string
  imgSrcOrigin?: string,
}

const props = defineProps<{ meta: Meta }>()

const encodedTitle = computed(() => encodeURIComponent(props.meta?.title || ''))
const encodedDesc = computed(() => encodeURIComponent(props.meta?.desc || props.meta?.title || ''))
const encodedImg = computed(() => encodeURIComponent(props.meta?.imgSrc || ''))

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
  <ui-dropdown-menu>
    <button class="btn secondary share-trigger" :disabled="!meta?.url">
      <span class="icon icon-social"/>
      <span>Share</span>
    </button>
    <template #menu>
      <div class="share-menu">
        <a class="btn" :href="twitterUrl" target="_blank" rel="noopener noreferrer" title="Share on X (Twitter)">
          <span class="icon icon-x"/> Twitter
        </a>
        <a class="btn" :href="redditUrl" target="_blank" rel="noopener noreferrer" title="Share on Reddit">
          <span class="icon icon-reddit"/> Reddit
        </a>
        <a class="btn" :href="pinterestUrl" target="_blank" rel="noopener noreferrer" title="Share on Pinterest">
          <span class="icon icon-pinterest"/> Pinterest
        </a>
      </div>
    </template>
  </ui-dropdown-menu>
</template>

<style scoped>
.share-trigger {
  transition: box-shadow var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .share-trigger:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  }
}

.share-menu {
  display: flex;
  flex-direction: column;
}

.share-menu > * + * {
  border-top: 1px solid var(--border);
}
</style>
