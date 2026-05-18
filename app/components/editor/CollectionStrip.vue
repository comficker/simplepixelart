<script setup lang="ts">
import type {APIResponse, SharedPage} from "~/types";

interface CollectionRef {
  id: number
  id_string: string
  title: string
  status: string
}

const props = defineProps<{
  collections: CollectionRef[]
  excludeId?: number | string
}>()

const config = useRuntimeConfig()
const expanded = ref(true)
const itemsBySlug = ref<Record<string, SharedPage[]>>({})
const loadingSlug = ref<Record<string, boolean>>({})

function thumbUrl(item: SharedPage): string {
  return `${config.public.api}/coloring/files/art-original/${item.id_string}.png`
}

async function loadItems(c: CollectionRef) {
  if (itemsBySlug.value[c.id_string]) return
  if (loadingSlug.value[c.id_string]) return
  loadingSlug.value[c.id_string] = true
  try {
    const res = await useNativeFetch<APIResponse<SharedPage>>(
        '/coloring/shared-pages/',
        {params: {collections__id: c.id, page_size: 16, ordering: '-updated'}},
    )
    const filter = props.excludeId
    itemsBySlug.value[c.id_string] = res.results.filter(r => {
      if (filter == null) return true
      return r.id_string !== filter && r.id !== filter
    })
  } catch {
    itemsBySlug.value[c.id_string] = []
  } finally {
    loadingSlug.value[c.id_string] = false
  }
}

watch(
    () => props.collections.map(c => c.id_string).join(','),
    () => {
      if (!expanded.value) return
      props.collections.forEach(c => loadItems(c))
    },
    {immediate: true},
)

function toggle() {
  expanded.value = !expanded.value
  if (expanded.value) props.collections.forEach(c => loadItems(c))
}
</script>

<template>
  <div v-if="collections.length" class="cstrip">
    <button class="cstrip-head" type="button" @click="toggle">
      <span class="icon" :class="expanded ? 'icon-eye' : 'icon-eye-cross'"/>
      <span>Reference from your collections</span>
      <span class="cstrip-count">{{ collections.length }}</span>
      <span class="cstrip-chev" :class="{open: expanded}">
        <span class="icon icon-angle-right"/>
      </span>
    </button>
    <div v-if="expanded" class="cstrip-body">
      <div
          v-for="c in collections"
          :key="c.id"
          class="cstrip-row"
      >
        <div class="cstrip-row-head">
          <nuxt-link
              v-if="c.status === 'public'"
              :to="`/collections/${c.id_string}`"
              class="cstrip-row-title"
              target="_blank"
          >
            {{ c.title }}
          </nuxt-link>
          <span v-else class="cstrip-row-title">{{ c.title }}</span>
          <span
              class="cstrip-badge"
              :class="c.status === 'public' ? 'badge-public' : 'badge-draft'"
          >
            {{ c.status === 'public' ? 'PUBLIC' : 'PRIVATE' }}
          </span>
        </div>
        <div class="cstrip-thumbs">
          <template v-if="loadingSlug[c.id_string] && !itemsBySlug[c.id_string]">
            <div
                v-for="i in 6"
                :key="`s-${i}`"
                class="cstrip-thumb skeleton"
            />
          </template>
          <template v-else-if="itemsBySlug[c.id_string]?.length">
            <a
                v-for="item in itemsBySlug[c.id_string]"
                :key="item.id"
                :href="`/art/${item.id_string}`"
                target="_blank"
                rel="noopener noreferrer"
                class="cstrip-thumb"
                :title="item.name || ''"
            >
              <img
                  :src="thumbUrl(item)"
                  :alt="item.name || ''"
                  loading="lazy"
                  decoding="async"
              />
            </a>
          </template>
          <span v-else class="cstrip-empty">No other items yet</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cstrip {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.cstrip-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.625rem;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  font-weight: 700;
  color: var(--foreground);
  text-align: left;
}

.cstrip-head:hover {
  color: var(--primary);
}

.cstrip-count {
  padding: 0 0.375rem;
  font-size: 10px;
  font-weight: 700;
  color: var(--primary-foreground);
  background: var(--primary);
  border-radius: 999px;
  height: 16px;
  display: inline-flex;
  align-items: center;
}

.cstrip-chev {
  margin-left: auto;
  display: inline-flex;
  transition: transform 180ms ease;
  color: var(--muted);
}

.cstrip-chev.open {
  transform: rotate(90deg);
}

.cstrip-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0 0.625rem 0.625rem;
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
}

.cstrip-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.cstrip-row-head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 11px;
  line-height: 1.2;
}

.cstrip-row-title {
  font-weight: 700;
  color: var(--foreground);
  text-decoration: none;
}

.cstrip-row-title:hover {
  color: var(--primary);
}

.cstrip-badge {
  padding: 0 0.25rem;
  font-size: 10px;
  letter-spacing: 0.04em;
  border-radius: 4px;
}

.cstrip-badge.badge-public {
  background: var(--primary);
  color: var(--primary-foreground);
}

.cstrip-badge.badge-draft {
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--border);
}

.cstrip-thumbs {
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
  padding-bottom: 0.125rem;
  scrollbar-width: thin;
}

.cstrip-thumb {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
  image-rendering: pixelated;
  display: block;
}

.cstrip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.cstrip-thumb:hover {
  border-color: var(--primary);
}

.cstrip-empty {
  font-size: 11px;
  color: var(--muted);
  padding: 0.25rem 0;
}
</style>
