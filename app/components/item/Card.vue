<template>
  <NuxtLinkLocale class="card" :to="to" :title="value.name">
    <div class="square">
      <div class="inside card-pad">
        <img
            v-if="!isDraw && !imgError"
            :src="src"
            :alt="value.name || $t('c_Card.pixelArtArtwork')"
            class="size-full"
            width="200"
            height="200"
            :loading="priority ? 'eager' : 'lazy'"
            :fetchpriority="priority ? 'high' : 'auto'"
            decoding="async"
            @error="imgError = true"
        />
        <div v-else-if="!isDraw && imgError" class="card-empty" :aria-label="$t('c_Card.noPreviewYet')">
          <span class="icon icon-image"/>
        </div>
        <canvas
            v-else
            :id="`canvas_${value.id}`"
            class="size-full"
            width="200"
            height="200"
            :aria-label="value.name || $t('c_Card.pixelArtPreview')"
        />
        <span v-if="isAnim || isAi" class="card-badges">
          <span v-if="isAnim" class="card-badge" :title="$t('common.animatedArtwork')">
            <svg viewBox="0 0 24 24" width="10" height="10"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
            <span>{{ $t('c_Card.gif') }}</span>
          </span>
          <span v-if="isAi" class="card-badge" :title="$t('common.aiGenerated')">{{ $t('common.ai') }}</span>
        </span>
        <span v-if="views || likes" class="card-stats">
          <span v-if="views" class="card-stat" :title="$t('c_Card.views', views, {count: views})">
            <span class="icon icon-eye"/>{{ compact(views) }}
          </span>
          <span v-if="likes" class="card-stat" :title="$t('c_Card.likes', likes, {count: likes})">
            <span class="icon icon-heart"/>{{ compact(likes) }}
          </span>
        </span>
        <!-- A span, not a link: the whole card is already one, and links
             can't nest. It still behaves as a link for mouse and keyboard. -->
        <span
            v-if="creator"
            class="card-creator"
            :class="{'is-founding': creator.founding}"
            role="link"
            tabindex="0"
            :title="creator.founding ? `@${creator.username} · ${$t('common.foundingCreator')}` : `@${creator.username}`"
            :aria-label="`@${creator.username}`"
            @click.prevent.stop="goCreator"
            @keydown.enter.prevent.stop="goCreator"
        >
          <img v-if="creator.avatar" :src="creator.avatar" alt="" loading="lazy">
          <span v-else>{{ creator.username.slice(0, 1).toUpperCase() }}</span>
        </span>
      </div>
    </div>
  </NuxtLinkLocale>
</template>

<script setup lang="ts">
import type {SharedPage} from "~/types";

const {value, isDraw, isRemix, priority} = defineProps<{
  value: SharedPage, isDraw?: boolean, isRemix?: boolean, priority?: boolean
}>()
const artImage = useArtImage()

const imgError = ref(false)

const src = computed(() => artImage(value))
watch(src, () => { imgError.value = false })
const to = computed(() => {
  return (isDraw || isRemix) ? `/editor?id=${value.id_string || value.id}` : `/art/${value.id_string}`
})
// `is_anim` / `is_ai` are annotated on list rows; detail payloads still carry meta.
const isAnim = computed(() => value.is_anim
    ?? ((((value.meta as any)?.animation?.frames?.length) || 0) > 1))
const isAi = computed(() => value.is_ai ?? !!(value.meta as any)?.ai)
// List rows carry both; a zero shows nothing rather than a row of "0"s.
const views = computed(() => value.view_count || 0)
const likes = computed(() => value.likes ?? (value.meta as any)?.vote_count ?? 0)
const {locale} = useI18n()

// The author, bottom-right. List rows carry `creator`; detail payloads `user`.
// Left off on that creator's own page, where every card is theirs.
const route = useRoute()
const localePath = useLocalePath()
const creator = computed(() => {
  const c = (value as any).creator || (value as any).user
  if (!c?.username || isDraw || isRemix) return null
  if (route.params.id_string === c.username && route.path.includes('/creator/')) return null
  return c as {username: string; avatar?: string | null; founding?: boolean}
})
function goCreator() {
  if (creator.value) navigateTo(localePath(`/creator/${creator.value.username}`))
}
const compact = (n: number) => new Intl.NumberFormat(locale.value, {notation: 'compact', maximumFractionDigits: 1}).format(n)
</script>

<style>
.card {
  display: block;
  position: relative;
  image-rendering: pixelated;
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  transition: --fold-size 220ms cubic-bezier(.22,.61,.36,1);

  --fold-size: 14px;
  -webkit-mask: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), #000 calc(var(--fold-size) * 0.7071 + 0.25px));
  mask: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), #000 calc(var(--fold-size) * 0.7071 + 0.25px));
}

@media (hover: hover) and (pointer: fine) {
  .card:hover {
    --fold-size: 28px;
  }
}

.card .square {
  border-radius: calc(var(--radius-sm) - 1px);
  overflow: hidden;
}

.card::after {
  content: "";
  position: absolute;
  top: -1px;
  right: -1px;
  width: var(--fold-size);
  height: var(--fold-size);
  background: linear-gradient(
    225deg,
    var(--border) calc(50% + 1.25px),
    var(--surface-2) calc(50% + 1.75px)
  );
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-bottom-left-radius: var(--radius-sm);
  pointer-events: none;
  z-index: 1;
}

.card .size-full {
  transition: transform 320ms cubic-bezier(.22,.61,.36,1);
}

.card-pad {
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: color-mix(in oklab, var(--muted) 45%, transparent);
}

.card-empty .icon {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

.card .size-full {
  object-fit: contain;
}

/* Views and likes over the bottom-left of the art: small, and only once
   there is something to count. */
.card-stats {
  position: absolute;
  left: 5px;
  bottom: 5px;
  display: flex;
  gap: var(--space-1);
  pointer-events: none;
}

.card-stat {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 5px;
  font-size: var(--text-2xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  color: #fff;
  background: rgba(0, 0, 0, 0.62);
  border-radius: var(--radius-pill);
}

.card-stat .icon {
  width: var(--text-2xs);
  height: var(--text-2xs);
}

/* The author's avatar, bottom-right: small, and its own link. */
.card-creator {
  position: absolute;
  right: 5px;
  bottom: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--space-5);
  height: var(--space-5);
  overflow: hidden;
  font-size: var(--text-2xs);
  font-weight: 800;
  color: var(--primary-foreground);
  background: var(--primary-fill);
  border: 1px solid rgba(0, 0, 0, 0.35);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: transform var(--transition);
}

/* Founding Creators: a warm ring, the program's one mark on the card. */
.card-creator.is-founding {
  box-shadow: 0 0 0 2px var(--warning);
}

.card-creator img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-creator:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

@media (hover: hover) and (pointer: fine) {
  .card-creator:hover {
    transform: scale(1.12);
  }
}

/* Corner labels: animated, AI-drawn. One row, so both can show at once. */
.card-badges {
  position: absolute;
  top: 5px;
  left: 5px;
  display: flex;
  gap: var(--space-1);
  pointer-events: none;
}

.card-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  font-size: var(--text-2xs);
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
  background: rgba(0, 0, 0, 0.62);
  border-radius: var(--radius-pill);
}
</style>