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