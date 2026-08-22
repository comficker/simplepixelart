<script setup lang="ts">
import {toast} from "vue-sonner";
import {PALETTE_THEMES} from "~/helper/constants";
import type {Palette} from "~/types";

const props = withDefaults(defineProps<{
  source: string
  namePlaceholder?: string
  defaultName?: string
}>(), {
  namePlaceholder: 'Palette name',
  defaultName: 'My palette',
})

const colors = defineModel<string[]>('colors', {required: true})

const auth = useAuthStore()
const name = ref('')
const themes = ref<string[]>([])
const saving = ref(false)

function toggleTheme(t: string) {
  const i = themes.value.indexOf(t)
  if (i >= 0) themes.value.splice(i, 1)
  else themes.value.push(t)
}

function updateColor(i: number, e: Event) {
  const next = colors.value.slice()
  next[i] = (e.target as HTMLInputElement).value.toUpperCase()
  colors.value = next
}

function removeColor(i: number) {
  const next = colors.value.slice()
  next.splice(i, 1)
  colors.value = next
}

function addColor() {
  colors.value = [...colors.value, '#000000']
}

const editorHref = computed(() =>
    '/editor?colors=' + colors.value.map(c => c.replace('#', '')).join(','))

async function copyAll() {
  try {
    await navigator.clipboard.writeText(colors.value.join('\n'))
    toast.success(`Copied ${colors.value.length} colors`)
  } catch {
    toast.error('Copy failed')
  }
}

async function publish() {
  if (!auth.isLogged) { toast.error('Sign in to publish a palette'); return }
  if (!colors.value.length) { toast.error('Add some colors first'); return }
  saving.value = true
  try {
    const res = await useNativeFetch<Palette>('/coloring/palettes/', {
      method: 'POST',
      body: {
        name: name.value.trim() || props.defaultName,
        colors: colors.value,
        source: props.source,
        tags: themes.value,
      },
    })
    toast.success(`Published "${res.name}"`)
    await navigateTo(`/palettes/${res.id_string}`)
  } catch {
    toast.error('Publish failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="composer">
    <div class="composer-head">
      <span class="tool-pane-cap" style="margin: 0;">{{ colors.length }} color{{ colors.length === 1 ? '' : 's' }}</span>
      <div class="composer-head-actions">
        <button class="composer-link" type="button" @click="addColor">
          <span class="icon icon-plus"/><span>Add</span>
        </button>
        <button class="composer-link" type="button" @click="copyAll">Copy hex</button>
      </div>
    </div>

    <div class="composer-swatches">
      <div v-for="(c, i) in colors" :key="i" class="composer-sw-wrap">
        <input type="color" class="composer-sw" :value="c" :title="c" @input="updateColor(i, $event)"/>
        <span class="composer-sw-hex">{{ c }}</span>
        <button class="composer-sw-x" type="button" :aria-label="`Remove ${c}`" @click="removeColor(i)">
          <span class="icon icon-x"/>
        </button>
      </div>
    </div>

    <input
        v-model="name"
        type="text"
        class="composer-name"
        :placeholder="namePlaceholder"
        @keydown.enter="publish"
    />

    <p class="composer-themes-label">Themes <span>(optional)</span></p>
    <div class="composer-themes">
      <button
          v-for="t in PALETTE_THEMES" :key="t"
          type="button"
          class="composer-theme" :class="{ active: themes.includes(t) }"
          @click="toggleTheme(t)"
      >{{ t }}</button>
    </div>

    <div class="composer-actions">
      <button class="btn primary" :disabled="saving || !colors.length" @click="publish">
        <span class="icon icon-check"/>
        <span>{{ saving ? 'Publishing…' : 'Publish' }}</span>
      </button>
      <a class="btn" :href="editorHref">
        <span class="icon icon-pen"/>
        <span>Open in editor</span>
      </a>
    </div>
    <p v-if="!auth.isLogged" class="composer-note">Sign in to publish to the public library.</p>
  </div>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
}

.composer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.625rem;
}

.composer-head-actions {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.composer-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  border: 0;
  background: transparent;
  padding: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
}

.composer-link:hover {
  text-decoration: underline;
}

.composer-link .icon {
  width: 12px;
  height: 12px;
}

.composer-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  gap: var(--space-3);
  margin-bottom: 0.875rem;
}

.composer-sw-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.composer-sw {
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.composer-sw::-webkit-color-swatch-wrapper { padding: 0; }
.composer-sw::-webkit-color-swatch { border: none; border-radius: var(--radius-sm); }
.composer-sw::-moz-color-swatch { border: none; border-radius: var(--radius-sm); }

.composer-sw-hex {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 9px;
  font-weight: 600;
  text-align: center;
  color: var(--muted);
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
}

.composer-sw-x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--foreground);
  color: var(--background);
  cursor: pointer;
  font-size: 9px;
  opacity: 0;
  transition: opacity 140ms ease;
}

.composer-sw-wrap:hover .composer-sw-x { opacity: 1; }
.composer-sw-x .icon { width: 10px; height: 10px; }

.composer-name {
  width: 100%;
  height: 38px;
  padding: 0 0.75rem !important;
  font-size: var(--text-sm);
  margin-bottom: 0.75rem;
}

.composer-themes-label {
  font-size: var(--text-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: 0 0 0.375rem;
}

.composer-themes-label span { font-weight: 500; text-transform: none; letter-spacing: 0; }

.composer-themes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 1rem;
}

.composer-theme {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}

.composer-theme.active {
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  border-color: var(--primary);
  color: var(--primary);
}

.composer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.composer-actions .btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.composer-note {
  font-size: var(--text-xs);
  color: var(--muted);
  margin-top: 0.625rem;
}
</style>
