<script setup lang="ts">
import {reactive, computed} from 'vue'

const props = withDefaults(defineProps<{
  name: string
  previewImgs: string[]
  status?: string
  folder?: boolean
  emptyIcon?: string
}>(), {emptyIcon: 'icon-image'})
defineEmits<{ click: [] }>()

const failed = reactive<Record<string, boolean>>({})
const imgs = computed(() => props.previewImgs.slice(0, 4).filter(s => !failed[s]))

function statusIcon(s?: string) {
  return s === 'public' ? 'icon-earth' : s === 'pending' ? 'icon-clock' : 'icon-earth-off'
}
function statusTitle(s?: string) {
  return s === 'public' ? 'Public' : s === 'pending' ? 'Pending review' : 'Private'
}
function statusBadge(s?: string) {
  return s === 'public' ? 'badge-public' : s === 'pending' ? 'badge-pending' : 'badge-draft'
}
</script>

<template>
  <button type="button" class="work-card" :class="{'work-card-folder': folder}" @click="$emit('click')">
    <span class="work-canvas">
      <span class="square">
        <span class="inside">
          <span v-if="imgs.length" class="tile-collage" :class="`n${imgs.length}`">
            <img v-for="s in imgs" :key="s" :src="s" alt="" loading="lazy" decoding="async" @error="failed[s] = true">
          </span>
          <span v-else class="coll-cover-empty"><span class="icon" :class="emptyIcon"/></span>
        </span>
      </span>
    </span>
    <span v-if="status" class="work-status badge-ic" :class="statusBadge(status)" :title="statusTitle(status)">
      <span class="icon" :class="statusIcon(status)"/>
    </span>
    <span class="work-meta"><span class="work-name">{{ name }}</span></span>
  </button>
</template>

<style scoped>

.work-card {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
  border: 0;
  --fold-size: 14px;
  transition: --fold-size 220ms cubic-bezier(.22, .61, .36, 1), box-shadow var(--transition);
  background: linear-gradient(225deg, transparent calc(var(--fold-size) * .7071 - .25px), var(--surface) calc(var(--fold-size) * .7071 + .25px));
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}

.work-card:not(.work-card-folder)::before {
  content: "";
  position: absolute;
  inset: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  pointer-events: none;
  z-index: 1;
  -webkit-mask: linear-gradient(225deg, transparent calc(var(--fold-size) * .7071 - .25px), #000 calc(var(--fold-size) * .7071 + .25px));
  mask: linear-gradient(225deg, transparent calc(var(--fold-size) * .7071 - .25px), #000 calc(var(--fold-size) * .7071 + .25px));
}

.work-card:not(.work-card-folder)::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  width: var(--fold-size);
  height: var(--fold-size);
  background: linear-gradient(225deg, transparent calc(var(--fold-size) * .7071 - .25px), var(--border) calc(var(--fold-size) * .7071 + .25px) calc(50% + 1.25px), var(--surface) calc(50% + 1.75px));
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-bottom-left-radius: var(--radius-sm);
  pointer-events: none;
  z-index: 1;
}

.work-card-folder {
  background: transparent;
  box-shadow: none;
}

.work-card-folder .work-canvas {
  position: relative;
  background: color-mix(in oklab, var(--primary) 55%, var(--surface));
  border-radius: var(--radius-sm);
  -webkit-mask:
    linear-gradient(#000, #000) 0 0 / 40% 17px no-repeat,
    linear-gradient(to top right, #000 calc(50% - 0.5px), transparent calc(50% + 0.5px)) calc(40% + 5.1px) 0 / 14px 17px no-repeat,
    linear-gradient(#000, #000) 0 16px / calc(100% - 5px) calc(100% - 16px) no-repeat,
    linear-gradient(#000, #000) 100% 21px / 5px calc(100% - 21px) no-repeat,
    radial-gradient(circle 5px at calc(100% - 5px) 21px, #000 4.5px, transparent 5px) 0 0 / 100% 100% no-repeat;
  mask:
    linear-gradient(#000, #000) 0 0 / 40% 17px no-repeat,
    linear-gradient(to top right, #000 calc(50% - 0.5px), transparent calc(50% + 0.5px)) calc(40% + 5.1px) 0 / 14px 17px no-repeat,
    linear-gradient(#000, #000) 0 16px / calc(100% - 5px) calc(100% - 16px) no-repeat,
    linear-gradient(#000, #000) 100% 21px / 5px calc(100% - 21px) no-repeat,
    radial-gradient(circle 5px at calc(100% - 5px) 21px, #000 4.5px, transparent 5px) 0 0 / 100% 100% no-repeat;
}

.work-card-folder .work-canvas .inside {
  inset: 24% 12% 34%;
  padding: 4%;
  background: var(--surface);
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}

.work-card-folder .coll-cover-empty { background: transparent; }
.work-card-folder .tile-collage { padding: 0; gap: 2px; }
.work-card-folder .tile-collage img { object-fit: contain; }

.work-card-folder .work-canvas::after {
  content: "";
  position: absolute;
  inset: 44% 0 0;
  background: linear-gradient(
    180deg,
    color-mix(in oklab, var(--primary) 30%, var(--surface)),
    color-mix(in oklab, var(--primary) 46%, var(--surface))
  );
  border-radius: 8px 8px var(--radius-sm) var(--radius-sm);
  box-shadow: 0 -1px 2px rgba(0, 0, 0, 0.08);
  pointer-events: none;
  z-index: 1;
}

.work-card-folder .work-status {
  top: auto;
  bottom: calc(30px + 12px);
  left: 10px;
}

.work-card-folder .work-meta {
  gap: var(--space-1);
  border-top: 0;
  padding: var(--space-2) var(--space-1) 0;
}

@media (hover: hover) and (pointer: fine) {
  .work-card:not(.work-card-folder):hover { --fold-size: 28px; }
}

.work-card .square {
  display: block;
  position: relative;
  padding-top: 100%;   
  border-radius: calc(var(--radius-sm) - 1px);
  overflow: hidden;
}

.work-canvas {
  display: block;
  background: transparent;
  image-rendering: pixelated;
}

.work-canvas .inside {
  position: absolute;
  inset: 0;
  padding: 10px;
}

.tile-collage {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 4px;
  image-rendering: pixelated;
}

.tile-collage.n1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
.tile-collage.n2 { grid-template-rows: 1fr; align-items: center; }

.tile-collage img {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  object-fit: contain;
}

.coll-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 32px;
}

.work-status {
  position: absolute;
  top: .4rem;
  left: .4rem;
  z-index: 2;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-pill);
}

.work-status .icon { width: 13px; height: 13px; }
.badge-public { background: var(--primary); color: var(--primary-foreground); }
.badge-pending { background: #f59e0b; color: #1a1a1a; }
.badge-draft { background: var(--surface-2); color: var(--muted); border: 1px solid var(--border); }

.work-meta {
  display: flex;
  align-items: center;
  padding: var(--space-3);
  border-top: 1px solid var(--border);
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
}

.work-name {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 700;
  color: var(--foreground);
}
</style>
