<script setup lang="ts">
import {toast} from 'vue-sonner'
import type {APIResponse, Collection, SharedPage} from "~/types";

interface CollectionDetail extends Collection {
  status: string
  type: string
  items: SharedPage[]
  owners?: number[]
  meta?: Record<string, any>
}

const route = useRoute()
const config = useRuntimeConfig()
const auth = useAuthStore()

const {data, error} = await useAuthFetch<CollectionDetail>(
    `/coloring/collections/${route.params.id_string}/`,
)

// A missing or private collection should 404 for crawlers, not soft-200.
if (error.value && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404)
}

const title = computed(() => data.value?.title || data.value?.name || 'Untitled collection')
const desc = computed(() => data.value?.desc || '')
const items = computed<SharedPage[]>(() => Array.isArray(data.value?.items) ? data.value!.items : [])
const itemCount = computed(() => items.value.length)

const isOwner = computed(() => {
  if (!auth.logged?.id || !data.value?.owners) return false
  return data.value.owners.includes(auth.logged.id)
})

const canonicalUrl = computed(() =>
    `${config.public.siteUrl}/collections/${route.params.id_string}`,
)

const isPublic = computed(() => data.value?.status === 'public')


// Share/preview image: the first piece's social card, so links unfurl with art.
const coverItem = computed(() => items.value[0])
const ogImage = computed(() =>
    coverItem.value?.id_string
        ? `${config.public.api}/coloring/files/art-social/${coverItem.value.id_string}.png`
        : `${config.public.siteUrl}/og-image.png`,
)

const formattedDate = computed(() => {
  const d = data.value?.updated
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'})
  } catch {
    return null
  }
})

useCustomSeoMeta({
  title: `${title.value} — Pixel Art Collection`,
  description: desc.value
      ? `${desc.value} Browse ${itemCount.value} pixel art ${itemCount.value === 1 ? 'piece' : 'pieces'} curated on SimplePixelArt.`
      : `A pixel art collection on SimplePixelArt featuring ${itemCount.value} ${itemCount.value === 1 ? 'piece' : 'pieces'}. Browse, remix or download any piece.`,
  canonical: canonicalUrl.value,
  ogImage: ogImage.value,
  ogType: 'website',
  robots: isPublic.value ? 'index, follow' : 'noindex, follow',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => data.value ? JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title.value,
        ...(desc.value ? {description: desc.value} : {}),
        url: canonicalUrl.value,
        numberOfItems: itemCount.value,
        ...(data.value.created ? {dateCreated: data.value.created} : {}),
        ...(data.value.updated ? {dateModified: data.value.updated} : {}),
        isPartOf: {'@type': 'WebSite', name: 'SimplePixelArt.com', url: `${config.public.siteUrl}/`},
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: itemCount.value,
          itemListElement: items.value.slice(0, 24).map((it, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            url: `${config.public.siteUrl}/art/${it.id_string}`,
            name: it.name || title.value,
          })),
        },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {'@type': 'ListItem', position: 1, name: 'Home', item: `${config.public.siteUrl}/`},
            {'@type': 'ListItem', position: 2, name: 'Gallery', item: `${config.public.siteUrl}/arts`},
            {'@type': 'ListItem', position: 3, name: title.value, item: canonicalUrl.value},
          ],
        },
      }) : '',
    },
  ],
})

const shareMeta = computed(() => ({
  url: canonicalUrl.value,
  title: title.value,
  desc: desc.value || title.value,
}))

// ── Manage mode (owner only): stage add/remove locally, commit on Save ──
const managing = ref(false)
const savingManage = ref(false)
const myArts = ref<SharedPage[]>([])
const loadingMyArts = ref(false)
const failedThumb = reactive<Record<number, boolean>>({})
// Snapshot taken on entering manage mode — Cancel restores it, Save diffs
// against it to know which add-item/remove-item calls to send.
let originalItems: SharedPage[] = []

const addableArts = computed<SharedPage[]>(() => {
  const inColl = new Set(items.value.map(i => i.id))
  return myArts.value.filter(a => !inColl.has(a.id))
})

// Leaving manage mode goes through saveManage/cancelManage.
function startManage() {
  originalItems = [...items.value]
  managing.value = true
  if (!myArts.value.length) fetchMyArts()
}

async function fetchMyArts() {
  if (!auth.logged?.username) return
  loadingMyArts.value = true
  try {
    const res = await useNativeFetch<APIResponse<SharedPage>>('/coloring/shared-pages/', {
      params: {user: auth.logged.username, page_size: 100, is_template: true, ordering: '-updated'},
    })
    myArts.value = res.results
  } catch {
    toast.error('Could not load your artworks')
  } finally {
    loadingMyArts.value = false
  }
}

// Local-only staging — nothing hits the API until Save.
// useFetch data is a shallowRef in Nuxt 4 — replace the object, don't mutate.
function removeItem(item: SharedPage) {
  if (!data.value) return
  data.value = {...data.value, items: items.value.filter(i => i.id !== item.id)}
}

function addItem(item: SharedPage) {
  if (!data.value) return
  data.value = {...data.value, items: [...items.value, item]}
}

async function saveManage() {
  if (!data.value || savingManage.value) return
  const current = items.value
  const before = new Set(originalItems.map(i => i.id))
  const after = new Set(current.map(i => i.id))
  const added = current.filter(i => !before.has(i.id))
  const removed = originalItems.filter(i => !after.has(i.id))
  if (!added.length && !removed.length) {
    managing.value = false
    return
  }
  savingManage.value = true
  try {
    await Promise.all([
      ...added.map(i => useNativeFetch(`/coloring/collections/${data.value!.id}/add-item/`, {
        method: 'POST', body: {page_id: i.id},
      })),
      ...removed.map(i => useNativeFetch(`/coloring/collections/${data.value!.id}/remove-item/`, {
        method: 'POST', body: {page_id: i.id},
      })),
    ])
    toast.success('Collection updated')
    managing.value = false
  } catch {
    // Partial failure possible — refetch nothing, just let the user retry.
    toast.error('Could not save changes')
  } finally {
    savingManage.value = false
  }
}

function cancelManage() {
  if (!data.value || savingManage.value) return
  data.value = {...data.value, items: originalItems}
  managing.value = false
}

function thumbUrl(item: SharedPage): string {
  return `${config.public.api}/coloring/files/art-original/${item.id_string}.png`
}

// ── Edit collection (settings modal, opened from the cog in manage mode) ──
const showEditModal = ref(false)

function onCollectionUpdated(updated: Partial<CollectionDetail>) {
  showEditModal.value = false
  if (!data.value) return
  // shallowRef — replace, don't mutate. Keep the hydrated items array: the
  // settings PATCH doesn't touch items and its response may serialize them
  // differently (ids instead of objects).
  data.value = {...data.value, ...updated, items: items.value}
  // Slug change moves the page URL; keep it in sync without a full reload.
  if (updated.id_string && updated.id_string !== route.params.id_string) {
    navigateTo(`/collections/${updated.id_string}`, {replace: true})
  }
}
</script>

<template>
  <div class="page">
    <div v-if="error" class="cl-detail-error">
      <h1 class="page-title">Collection not found</h1>
      <p class="text-xs text-muted">This collection may be private or no longer exists.</p>
      <nuxt-link to="/arts" class="btn primary">Browse public pixel art</nuxt-link>
    </div>

    <template v-else-if="data">
      <section class="cl-detail-hero">
        <div class="cl-detail-head">
          <span class="cl-detail-eyebrow">Collection</span>
          <h1 class="page-title">{{ title }}</h1>
          <p v-if="desc" class="cl-detail-desc">{{ desc }}</p>
          <div class="cl-detail-meta">
            <span class="cl-detail-pill">{{ itemCount }} {{ itemCount === 1 ? 'piece' : 'pieces' }}</span>
            <span v-if="formattedDate" class="cl-detail-pill">
              <span class="icon icon-calender"/> Updated {{ formattedDate }}
            </span>
            <span v-if="!isPublic" class="cl-detail-pill cl-detail-pill-private">
              <span class="icon icon-earth-off"/> Private
            </span>
          </div>
        </div>
        <div class="cl-hero-actions">
          <template v-if="!managing">
            <SocialSharing :meta="shareMeta" position="right" icon-only/>
            <button
                v-if="isOwner"
                class="btn cl-icon-btn"
                title="Manage collection"
                aria-label="Manage collection"
                @click="startManage"
            >
              <span class="icon icon-pencil"/>
            </button>
          </template>
          <template v-else>
            <button
                class="btn cl-icon-btn"
                title="Collection settings"
                aria-label="Collection settings"
                @click="showEditModal = true"
            >
              <span class="icon icon-cog"/>
            </button>
            <button
                class="btn cl-icon-btn"
                title="Cancel — discard changes"
                aria-label="Cancel and discard changes"
                :disabled="savingManage"
                @click="cancelManage"
            >
              <span class="icon icon-x"/>
            </button>
            <button
                class="btn primary cl-icon-btn"
                :title="savingManage ? 'Saving…' : 'Save changes'"
                aria-label="Save changes"
                :disabled="savingManage"
                @click="saveManage"
            >
              <span class="icon icon-save"/>
            </button>
          </template>
        </div>
      </section>

      <section v-if="items.length" class="cl-detail-grid-wrap">
        <div class="cl-detail-grid">
          <div v-for="(item, i) in items" :key="item.id" class="cl-manage-cell">
            <ItemCard :value="item" :priority="i < 4"/>
            <button
                v-if="managing"
                class="cl-manage-trash"
                :aria-label="`Remove ${item.name || 'artwork'} from collection`"
                @click.prevent.stop="removeItem(item)"
            >
              <span class="icon icon-trash"/>
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="!managing" class="empty-state">
        <span class="empty-state-icon icon icon-rhombus" aria-hidden="true"/>
        <div class="empty-state-title">Empty collection</div>
        <p class="empty-state-body">No pixel art has been added to this collection yet.</p>
        <div class="empty-state-actions">
          <button v-if="isOwner" class="btn primary" @click="startManage">Add pixel art</button>
          <nuxt-link to="/arts" class="btn">Browse gallery</nuxt-link>
        </div>
      </section>

      <!-- Manage mode: add your artworks to this collection -->
      <section v-if="managing && isOwner" class="cl-manage-add">
        <header class="section-head">
          <h2 class="section-title">Add your artworks</h2>
          <span class="section-link">tap to add</span>
        </header>
        <p v-if="loadingMyArts" class="text-xs text-muted">Loading your artworks…</p>
        <p v-else-if="!addableArts.length" class="text-xs text-muted">
          {{ myArts.length ? 'All your artworks are already in this collection.' : 'You have no cloud artworks yet.' }}
        </p>
        <div v-else class="cl-manage-add-grid no-scrollbar">
          <button
              v-for="a in addableArts"
              :key="a.id"
              class="cl-manage-add-item"
              :title="`Add ${a.name || 'artwork'}`"
              @click="addItem(a)"
          >
            <img
                v-if="a.id_string && !failedThumb[a.id]"
                :src="thumbUrl(a)"
                :alt="a.name || 'Pixel art'"
                class="cl-manage-add-img"
                loading="lazy"
                @error="failedThumb[a.id] = true"
            />
            <div v-else class="cl-manage-add-empty"><span class="icon icon-rhombus"/></div>
            <span class="cl-manage-add-plus"><span class="icon icon-plus"/></span>
          </button>
        </div>
      </section>

      <div class="cl-detail-actions">
        <nuxt-link to="/arts" class="btn">
          <span class="icon icon-grid"/>
          <span>Browse all pixel art</span>
        </nuxt-link>
        <nuxt-link to="/editor?new=true" class="btn">
          <span class="icon icon-pen"/>
          <span>Create your own</span>
        </nuxt-link>
      </div>

      <CollectionEditModal
          v-if="showEditModal && isOwner"
          :collection="data"
          @close="showEditModal = false"
          @updated="onCollectionUpdated"
      />
    </template>
  </div>
</template>

<style scoped>
.cl-detail-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}

.cl-detail-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  flex: 1 1 280px;
}

.cl-detail-eyebrow {
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--primary);
}

.cl-detail-desc {
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
  color: var(--muted);
  max-width: 60ch;
}

.cl-detail-meta {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-top: var(--space-1);
}

.cl-detail-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-3);
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--border);
}

.cl-detail-pill-private {
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  color: var(--primary);
  border-color: color-mix(in oklab, var(--primary) 40%, transparent);
}

.cl-detail-actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: var(--space-6);
}

.cl-detail-actions .btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.cl-hero-actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-shrink: 0;
  margin-left: auto;
}

/* Square icon-only button, same height as .btn */
.cl-icon-btn {
  padding: 0.5rem;
}

.cl-detail-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(2, 1fr);
}

@media (min-width: 480px) {
  .cl-detail-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 768px) {
  .cl-detail-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* ===== Manage mode ===== */
.cl-manage-cell {
  position: relative;
}

.cl-manage-trash {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: color var(--transition), border-color var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .cl-manage-trash:hover {
    color: var(--danger, #e5484d);
  }
}

.cl-manage-add .section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.cl-manage-add .section-title {
  font-size: var(--text-sm);
  font-weight: 700;
}

.cl-manage-add .section-link {
  font-size: var(--text-2xs);
  color: var(--muted);
}

.cl-manage-add-grid {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: var(--space-1);
}

.cl-manage-add-item {
  position: relative;
  flex: 0 0 auto;
  width: 72px;
  height: 72px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--transition);
}



.cl-manage-add-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.cl-manage-add-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: color-mix(in oklab, var(--muted) 45%, transparent);
}

.cl-manage-add-plus {
  position: absolute;
  right: 3px;
  bottom: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--primary);
  color: var(--primary-foreground);
}

.cl-manage-add-plus .icon {
  width: 12px;
  height: 12px;
}

.cl-detail-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-4);
  padding-top: 4rem;
  padding-bottom: 4rem;
}
</style>
