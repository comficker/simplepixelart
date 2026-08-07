<script setup lang="ts">
import {toast} from 'vue-sonner'

type Meta = {
  url: string
  title: string
  desc?: string
  imgSrcOrigin?: string
  imgSrc?: string
  // Square (1080×1080) render — used for Instagram / native share sheets.
  imgSquare?: string
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
const telegramUrl = computed(() => `https://t.me/share/url?url=${encodeURIComponent(withUtm('telegram'))}&text=${encodedTitle.value}`)

// Instagram has no web share endpoint. On mobile, hand the square image to the
// OS share sheet (Instagram shows up as a target); on desktop, save the square
// PNG so the user can attach it to a post manually.
const igBusy = ref(false)
const squareSrc = computed(() => props.meta?.imgSquare || props.meta?.imgSrcOrigin || props.meta?.imgSrc || '')

async function shareInstagram() {
  if (!squareSrc.value || igBusy.value) return
  igBusy.value = true
  try {
    const blob = await (await fetch(squareSrc.value)).blob()
    const file = new File([blob], 'pixel-art.png', {type: blob.type || 'image/png'})
    if (typeof navigator.canShare === 'function' && navigator.canShare({files: [file]})) {
      await navigator.share({files: [file], text: props.meta?.title}).catch(() => { /* user closed the sheet */ })
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'pixel-art-1080.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast.success('Square image saved — attach it to your Instagram post')
  } catch {
    toast.error('Could not load the share image')
  } finally {
    igBusy.value = false
  }
}
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
      <a class="drop-item" :href="telegramUrl" target="_blank" rel="noopener noreferrer" title="Share on Telegram">
        <span class="icon icon-telegram"/> Telegram
      </a>
      <a class="drop-item" :href="redditUrl" target="_blank" rel="noopener noreferrer" title="Share on Reddit">
        <span class="icon icon-reddit"/> Reddit
      </a>
      <a class="drop-item" :href="pinterestUrl" target="_blank" rel="noopener noreferrer" title="Share on Pinterest">
        <span class="icon icon-pinterest"/> Pinterest
      </a>
      <button
          v-if="squareSrc"
          class="drop-item"
          :disabled="igBusy"
          title="Share the square image to Instagram"
          @click="shareInstagram"
      >
        <span class="icon icon-instagram"/> {{ igBusy ? 'Preparing…' : 'Instagram' }}
      </button>
    </template>
  </ui-dropdown-menu>
</template>

<style scoped>
/* Match the app's dropdown item rows (icon + label, flush, own separators
 * come from the global .dropdown-menu > * + * rule). a.drop-item keeps the
 * specificity above the global `.dropdown .drop-item` rule. */
a.drop-item,
button.drop-item {
  align-items: center;
  gap: var(--space-2);
  text-decoration: none;
  color: var(--foreground);
  width: 100%;
  background: none;
  border: 0;
  font: inherit;
}

/* The icon-only variant owns its square padding — callers don't restyle it.
 * NB: class is "is-icon-only", NOT "icon-only" — the icons.css generator turns
 * any `icon-<x>` token into a mask-image rule, which would mask the button away. */
.share-trigger.is-icon-only {
  padding: 0.5rem;
}
</style>
