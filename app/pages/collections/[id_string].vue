<script setup lang="ts">
const localePath = useLocalePath()
const artImage = useArtImage()
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
const {t, locale} = useI18n()

const {data, error} = await useAuthFetch<CollectionDetail>(
    `/coloring/collections/${route.params.id_string}/`,
)

if (error.value && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404)
}

const title = computed(() => data.value?.title || data.value?.name || t('p_collections_id_string.untitledCollection'))
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
    return new Date(d).toLocaleDateString(locale.value, {year: 'numeric', month: 'short', day: 'numeric'})
  } catch {
    return null
  }
})


useCustomSeoMeta({
  untranslated: true,
  title: error.value ? 'Collection not found' : `${title.value} — Pixel Art Collection`,
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
      }) : '',
    },
  ],
})

const shareMeta = computed(() => ({
  url: canonicalUrl.value,
  title: title.value,
  desc: desc.value || title.value,
}))

const managing = ref(false)
const savingManage = ref(false)
const myArts = ref<SharedPage[]>([])
const loadingMyArts = ref(false)
const failedThumb = reactive<Record<number, boolean>>({})
let originalItems: SharedPage[] = []

const addableArts = computed<SharedPage[]>(() => {
  const inColl = new Set(items.value.map(i => i.id))
  return myArts.value.filter(a => !inColl.has(a.id))
})

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
    toast.error(t('p_collections_id_string.couldNotLoadYourArtworks'))
  } finally {
    loadingMyArts.value = false
  }
}

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
    const [addRes, removeRes] = await Promise.all([
      Promise.allSettled(added.map(i => useNativeFetch(`/coloring/collections/${data.value!.id}/add-item/`, {
        method: 'POST', body: {page_id: i.id},
      }))),
      Promise.allSettled(removed.map(i => useNativeFetch(`/coloring/collections/${data.value!.id}/remove-item/`, {
        method: 'POST', body: {page_id: i.id},
      }))),
    ])
    // The server state is what actually went through: the original set, minus
    // the removals that succeeded, plus the additions that succeeded.
    const removedOk = new Set(removed.filter((_, k) => removeRes[k].status === 'fulfilled').map(i => i.id))
    const addedOk = added.filter((_, k) => addRes[k].status === 'fulfilled')
    originalItems = [...originalItems.filter(i => !removedOk.has(i.id)), ...addedOk]
    const failed = added.length + removed.length - addedOk.length - removedOk.size
    if (failed) {
      toast.error(t('p_collections_id_string.couldNotSaveNChanges', failed, {count: failed}))
    } else {
      toast.success(t('p_collections_id_string.collectionUpdated'))
      managing.value = false
    }
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
  return artImage(item)
}

const showEditModal = ref(false)

function onCollectionUpdated(updated: Partial<CollectionDetail>) {
  showEditModal.value = false
  if (!data.value) return
  data.value = {...data.value, ...updated, items: items.value}
  if (updated.id_string && updated.id_string !== route.params.id_string) {
    navigateTo(localePath(`/collections/${updated.id_string}`), {replace: true})
  }
}
</script>

<template>
  <div class="page">
    <div v-if="error" class="empty-state">
      <span class="empty-state-icon icon icon-search" aria-hidden="true"/>
      <h1 class="empty-state-title cl-not-found-title">{{ $t('p_collections_id_string.collectionNotFound') }}</h1>
      <p class="empty-state-body" v-html="$t('p_collections_id_string.thisCollectionMayBePrivateOr')"/>
      <NuxtLinkLocale to="/arts" class="btn primary empty-state-action">{{ $t('p_collections_id_string.browsePublicPixelArt') }}</NuxtLinkLocale>
    </div>

    <template v-else-if="data">
      <BrowseLayout>
      <template #head>
        <h1 class="screen-title">{{ title }}</h1>
        <p class="screen-desc">
          {{ $t('p_collections.pieceCount', itemCount, {count: itemCount}) }}
          <template v-if="formattedDate"> · {{ formattedDate }}</template>
          <template v-if="!isPublic"> · {{ $t('common.private') }}</template>
          <template v-if="desc"> — {{ desc }}</template>
        </p>
      </template>

      <template #actions>
          <template v-if="!managing">
            <SocialSharing :meta="shareMeta" position="right" icon-only/>
            <button
                v-if="isOwner"
                class="btn cl-icon-btn"
                :title="$t('p_collections_id_string.manageCollection')"
                :aria-label="$t('p_collections_id_string.manageCollection')"
                @click="startManage"
            >
              <span class="icon icon-pencil"/>
            </button>
          </template>
          <template v-else>
            <button
                class="btn cl-icon-btn"
                :title="$t('p_collections_id_string.collectionSettings')"
                :aria-label="$t('p_collections_id_string.collectionSettings')"
                @click="showEditModal = true"
            >
              <span class="icon icon-cog"/>
            </button>
            <button
                class="btn cl-icon-btn"
                :title="$t('p_collections_id_string.cancelDiscardChanges')"
                :aria-label="$t('p_collections_id_string.cancelAndDiscardChanges')"
                :disabled="savingManage"
                @click="cancelManage"
            >
              <span class="icon icon-x"/>
            </button>
            <button
                class="btn primary cl-icon-btn"
                :title="savingManage ? $t('common.saving') : $t('p_collections_id_string.saveChanges')"
                :aria-label="$t('p_collections_id_string.saveChanges')"
                :disabled="savingManage"
                @click="saveManage"
            >
              <span class="icon icon-save"/>
            </button>
          </template>
      </template>

      <div v-if="items.length" class="results">
          <div v-for="(item, i) in items" :key="item.id" class="cl-manage-cell">
            <ItemCard :value="item" :priority="i < 4"/>
            <button
                v-if="managing"
                class="cl-manage-trash"
                :aria-label="$t('p_collections_id_string.removeXFromCollection', {x: item.name || $t('common.artwork')})"
                @click.prevent.stop="removeItem(item)"
            >
              <span class="icon icon-trash"/>
            </button>
        </div>
      </div>

      <div v-else-if="!managing" class="empty-state">
        <span class="empty-state-icon icon icon-rhombus" aria-hidden="true"/>
        <div class="empty-state-title">{{ $t('p_collections_id_string.emptyCollection') }}</div>
        <p class="empty-state-body" v-html="$t('p_collections_id_string.noPixelArtHasBeenAdded')"/>
        <div class="empty-state-actions">
          <button v-if="isOwner" class="btn primary" @click="startManage">{{ $t('p_collections_id_string.addPixelArt') }}</button>
          <NuxtLinkLocale to="/arts" class="btn">{{ $t('common.browseGallery') }}</NuxtLinkLocale>
        </div>
      </div>

      <section v-if="managing && isOwner" class="cl-manage-add">
        <header class="section-head">
          <h2 class="section-title">{{ $t('p_collections_id_string.addYourArtworks') }}</h2>
          <span class="section-link">{{ $t('p_collections_id_string.tapToAdd') }}</span>
        </header>
        <p v-if="loadingMyArts" class="text-xs text-muted">{{ $t('p_collections_id_string.loadingYourArtworks') }}</p>
        <p v-else-if="!addableArts.length" class="text-xs text-muted">
          {{ myArts.length ? $t('p_collections_id_string.allYourArtworksAlreadyIn') : $t('p_collections_id_string.noCloudArtworksYet') }}
        </p>
        <div v-else class="cl-manage-add-grid no-scrollbar">
          <button
              v-for="a in addableArts"
              :key="a.id"
              class="cl-manage-add-item"
              :title="$t('common.addX', {x: a.name || $t('common.artwork')})"
              @click="addItem(a)"
          >
            <img
                v-if="a.id_string && !failedThumb[a.id]"
                :src="thumbUrl(a)"
                :alt="a.name || $t('p_collections_id_string.pixelArtAlt')"
                class="cl-manage-add-img"
                loading="lazy"
                @error="failedThumb[a.id] = true"
            />
            <div v-else class="cl-manage-add-empty"><span class="icon icon-rhombus"/></div>
            <span class="cl-manage-add-plus"><span class="icon icon-plus"/></span>
          </button>
        </div>
      </section>

      <template #foot>
        <span class="browse-foot-start">
          {{ $t('p_collections.pieceCount', itemCount, {count: itemCount}) }}
        </span>
        <span class="browse-foot-end cl-detail-actions">
        <NuxtLinkLocale to="/arts" class="btn">
          <span class="icon icon-grid"/>
          <span>{{ $t('p_collections_id_string.browseAllPixelArt') }}</span>
        </NuxtLinkLocale>
        <NuxtLinkLocale to="/editor?new=true" class="btn">
          <span class="icon icon-pen"/>
          <span>{{ $t('p_collections_id_string.createYourOwn') }}</span>
        </NuxtLinkLocale>
        </span>
      </template>
      </BrowseLayout>

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
.cl-manage-add {
  padding: var(--space-4) 0 0;
}

/* .browse-foot-end already lays these out; this only lets them wrap. */
.cl-detail-actions {
  flex-wrap: wrap;
}

.cl-detail-actions .btn {
  display: inline-flex;
  gap: var(--space-2);
}

.cl-icon-btn {
  padding: var(--space-2);
}

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
  background: var(--primary-fill);
  color: var(--primary-foreground);
}

.cl-manage-add-plus .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

/* An h1 for the outline, still drawn like every other empty-state title. */
.cl-not-found-title {
  font-family: inherit;
  font-variation-settings: normal;
}
</style>
