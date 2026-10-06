<script setup lang="ts">
const artImage = useArtImage()
import type {APIResponse, Collection, ResponseSharedPage, SharedPage} from "~/types";
import {PROFILE_LINKS, linkHost} from '~/helper/profileLinks'
import {tileImageUrl} from '~/helper/tilemap'

const route = useRoute()
const username = computed(() => route.params.id_string?.toString() || '')
const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const hasFilterQuery = computed(() =>
    !!(route.query.width || route.query.height || route.query.is_iso || route.query.is_anim || route.query.license || route.query.sort || route.query.search),
)

interface CreatorCollection extends Collection {
  status: string
  items: SharedPage[] | number[]
}

const {data: collectionsRes} = await useAuthFetch<APIResponse<CreatorCollection>>(
    '/coloring/collections/',
    {
      params: {
        owners__username: username.value,
        status: 'public',
        page_size: 12,
        ordering: '-updated',
      },
    },
)

const {data: worksCount} = await useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
  params: {
    slug: `/creator/${username.value}`,
    status: 'public',
    page_size: 1,
  },
  key: `creator-works-count-${username.value}`,
})

interface CreatorProfile {
  username: string
  avatar: string | null
  bio?: string
  links?: Record<string, string>
  joined: string | null
  arts: number
  likes: number
  followers: number
  remixes?: number
  following_count: number
  following: boolean
}

const {data: profile} = await useAuthFetch<CreatorProfile>(
    `/coloring/creators/${username.value}/`,
    {key: `creator-profile-${username.value}`},
)

const auth = useAuthStore()
const apiBase = useRuntimeConfig().public.api as string

// The creator's best-liked pieces: the first three shown large as the page's
// centrepiece, and up to a dozen laid out as the cover, so every profile
// looks like its owner's work without them uploading a banner.
const {data: featuredRes} = await useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
  params: {user: username.value, status: 'public', is_tile: false, ordering: '-score,-id', page_size: 12},
  key: `creator-featured-${username.value}`,
})
const coverPieces = computed(() => featuredRes.value?.results || [])
const featured = computed(() => coverPieces.value.slice(0, 3))
const followBusy = ref(false)

async function toggleFollow() {
  if (!auth.isLogged) { auth.authOAUTH(); return }
  if (followBusy.value || !profile.value) return
  followBusy.value = true
  try {
    const res = await useNativeFetch<{ following: boolean; followers: number }>(
        '/activity/follow/', {method: 'POST', body: {username: username.value}},
    )
    profile.value = {...profile.value, following: res.following, followers: res.followers}
  } catch {  } finally {
    followBusy.value = false
  }
}

const isSelf = computed(() => auth.logged?.username === username.value)

// The owner's own numbers. Fetched in the browser only: they are private, and
// the HTML of this page is cached and served to everyone.
interface CreatorStats {
  totals: { likes: number; remixes: number; followers: number; published: number }
  weeks: { week: string; likes: number; remixes: number; followers: number }[]
  top: { id_string: string; name: string; likes: number }[]
}
const stats = ref<CreatorStats | null>(null)
const thisWeek = computed(() => stats.value?.weeks.at(-1) || null)
async function loadStats() {
  if (!isSelf.value) { stats.value = null; return }
  try {
    stats.value = await useNativeFetch<CreatorStats>(`/coloring/creators/${username.value}/stats/`)
  } catch { stats.value = null }
}
onMounted(loadStats)
watch(isSelf, loadStats)
// A portfolio link worth posting: the profile, not one piece.
const shareMeta = computed(() => ({
  title: `@${username.value} on SimplePixelArt`,
  desc: profile.value?.bio || `Pixel art by @${username.value}`,
}))

/** Only the platforms this creator filled in, in the shared display order. */
const profileLinks = computed(() => {
  const saved = profile.value?.links || {}
  return PROFILE_LINKS
      .filter(l => saved[l.key])
      .map(l => ({...l, url: saved[l.key], host: linkHost(saved[l.key])}))
})

const joinedText = computed(() => {
  if (!profile.value?.joined) return ''
  return new Date(`${profile.value.joined}T00:00:00`)
      .toLocaleDateString('en-US', {month: 'short', year: 'numeric'})
})

const collections = computed(() => collectionsRes.value?.results || [])
const totalWorks = computed(() => worksCount.value?.count || 0)
const isEmptyCreator = computed(() => totalWorks.value === 0 && collections.value.length === 0)

function itemCount(c: CreatorCollection): number {
  return Array.isArray(c.items) ? c.items.length : 0
}

/** Cover image per collection, keyed by collection id.
 *
 *  The list endpoint sends `items` as bare row ids, so there is nothing here
 *  to build an image URL from -- the old code read `items[0].id_string` off a
 *  number and fell through to the placeholder every single time. The ids are
 *  resolved in one request for the whole page rather than one per card.
 */
const covers = ref<Record<number, string>>({})
const coverFailed = reactive<Record<number, boolean>>({})

async function loadCovers() {
  const wanted = collections.value
      .map(c => (Array.isArray(c.items) ? c.items : [])
          .find((i): i is number => typeof i === 'number'))
      .filter((i): i is number => typeof i === 'number')
  if (!wanted.length) return
  try {
    const ids = [...new Set(wanted)]
    const res = await useNativeFetch<ResponseSharedPage>('/coloring/shared-pages/', {
      params: {ids: ids.join(','), page_size: ids.length},
    })
    const byId = new Map((res.results || []).map(a => [a.id, a]))
    const next: Record<number, string> = {}
    for (const c of collections.value) {
      const first = (Array.isArray(c.items) ? c.items : [])
          .find((i): i is number => typeof i === 'number')
      const art = first != null ? byId.get(first) : undefined
      if (art) next[c.id as number] = artImage(art as any)
    }
    covers.value = next
  } catch {
    // A cover is decoration; the tile falls back to its placeholder.
  }
}

onMounted(loadCovers)
watch(collections, loadCovers)

const canonicalUrl = computed(() => {
  const base = `https://simplepixelart.com/creator/${username.value}`
  if (hasFilterQuery.value) return base
  return page.value > 1 ? `${base}?page=${page.value}` : base
})

const seoTitle = computed(() =>
    page.value > 1
        ? `Pixel art by @${username.value} — Page ${page.value} | SimplePixelArt`
        : `Pixel art by @${username.value} — Sprites, Designs & Creations`
)

const robotsValue = computed(() => {
  if (isEmptyCreator.value) return 'noindex, follow'
  if (hasFilterQuery.value) return 'noindex, follow'
  if (page.value > 1) return 'noindex, follow'
  return 'index, follow'
})

if (isEmptyCreator.value && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404)
}


useCustomSeoMeta({
  untranslated: true,
  title: seoTitle,
  description: () => `Browse pixel art by @${username.value} on SimplePixelArt.com. Discover their sprites, 8-bit characters, and pixel designs — remix or follow for new releases.`,
  keywords: () => `${username.value} pixel art, @${username.value}, ${username.value} sprites, pixel art creator, ${username.value} 8-bit art, ${username.value} pixel designs`,
  canonical: canonicalUrl,
  robots: robotsValue,
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: `@${username.value}`,
        url: canonicalUrl.value,
        mainEntity: {
          '@type': 'Person',
          name: `@${username.value}`,
          url: `https://simplepixelart.com/creator/${username.value}`
        }
      })
    }
  ]
})
</script>

<template>
  <item-list :limit="24">
    <template #before>
      <section class="cp-hero">
        <div class="cp-cover" aria-hidden="true">
          <img v-for="c in coverPieces" :key="c.id" :src="tileImageUrl(apiBase, c.id_string)" alt="" loading="lazy">
        </div>
        <div class="cp-id">
          <div class="cp-avatar">
            <img v-if="profile?.avatar" :src="profile.avatar" :alt="`@${username}`">
            <span v-else>{{ username.slice(0, 1).toUpperCase() }}</span>
          </div>
          <div class="cp-name">
            <h1 class="cp-handle">@{{ username }}</h1>
            <p v-if="profile?.bio" class="cp-bio">{{ profile.bio }}</p>
            <ul v-if="profileLinks.length" class="cp-links">
              <li v-for="l in profileLinks" :key="l.key">
                <!-- User-supplied and unverified, so it carries no ranking signal
                     and opens without handing over the referrer. -->
                <a :href="l.url" target="_blank" rel="nofollow ugc noopener noreferrer" :title="l.host">
                  <span class="icon icon-link"/><span>{{ l.label }}</span>
                </a>
              </li>
            </ul>
          </div>
          <div v-if="profile" class="cp-actions">
            <button
                v-if="!isSelf"
                class="btn"
                :class="{primary: !profile.following}"
                :disabled="followBusy"
                @click="toggleFollow"
            >
              <span class="icon" :class="profile.following ? 'icon-check' : 'icon-plus'"/>
              <span>{{ profile.following ? $t('p_creator_id_string.following') : $t('p_creator_id_string.follow') }}</span>
            </button>
            <NuxtLinkLocale v-else to="/upload" class="btn primary">
              <span class="icon icon-upload"/><span>{{ $t('p_upload.uploadPixelArt') }}</span>
            </NuxtLinkLocale>
            <SocialSharing :meta="shareMeta" position="right"/>
          </div>
        </div>

        <dl v-if="profile" class="cp-stats" :aria-label="$t('p_creator_id_string.creatorStats')">
          <div><dt>{{ $t('p_creator_id_string.stat_artworks') }}</dt><dd>{{ profile.arts }}</dd></div>
          <div>
            <dt>{{ $t('p_creator_id_string.stat_likes') }}<span v-if="thisWeek?.likes" class="cp-up">+{{ thisWeek.likes }} {{ $t('p_creator_id_string.thisWeek') }}</span></dt>
            <dd>{{ profile.likes }}</dd>
          </div>
          <div>
            <dt>{{ $t('p_creator_id_string.stat_followers') }}<span v-if="thisWeek?.followers" class="cp-up">+{{ thisWeek.followers }} {{ $t('p_creator_id_string.thisWeek') }}</span></dt>
            <dd>{{ profile.followers }}</dd>
          </div>
          <div>
            <dt>{{ $t('p_creator_id_string.stat_remixed') }}<span v-if="thisWeek?.remixes" class="cp-up">+{{ thisWeek.remixes }} {{ $t('p_creator_id_string.thisWeek') }}</span></dt>
            <dd>{{ profile.remixes || 0 }}</dd>
          </div>
          <div v-if="joinedText"><dt>{{ $t('p_creator_id_string.joined') }}</dt><dd>{{ joinedText }}</dd></div>
        </dl>
      </section>


      <section v-if="featured.length" class="cp-sec">
        <h2 class="cp-cap">{{ $t('p_creator_id_string.bestWork') }}</h2>
        <div class="cp-featured" :class="`n-${featured.length}`">
          <NuxtLinkLocale
              v-for="(f, i) in featured"
              :key="f.id"
              :to="`/art/${f.id_string}`"
              class="cp-feat"
              :class="{'is-lead': i === 0}"
              :title="f.name"
          >
            <img :src="tileImageUrl(apiBase, f.id_string)" :alt="f.name || 'Pixel art'" :loading="i === 0 ? 'eager' : 'lazy'">
            <span class="cp-feat-name">{{ f.name || 'Untitled' }}</span>
          </NuxtLinkLocale>
        </div>
      </section>

      <section v-if="collections.length" class="cp-sec creator-colls">
        <h2 class="cp-cap">{{ $t('p_creator_id_string.collections') }}</h2>
        <div class="results">
          <div v-for="c in collections" :key="c.id" class="creator-coll">
            <NuxtLinkLocale class="card" :to="`/collections/${c.id_string}`" :title="c.name || 'Untitled'">
              <div class="square">
                <div class="inside card-pad">
                  <img
                      v-if="covers[c.id as number] && !coverFailed[c.id as number]"
                      :src="covers[c.id as number]"
                      :alt="c.name || 'Collection'"
                      class="size-full"
                      loading="lazy"
                      decoding="async"
                      @error="coverFailed[c.id as number] = true"
                  >
                  <div v-else class="card-empty"><span class="icon icon-rhombus"/></div>
                </div>
              </div>
            </NuxtLinkLocale>
            <NuxtLinkLocale class="creator-coll-name" :to="`/collections/${c.id_string}`">
              {{ c.name || 'Untitled' }}
            </NuxtLinkLocale>
            <span class="creator-coll-count">
              {{ itemCount(c) }} {{ itemCount(c) === 1 ? 'piece' : 'pieces' }}
            </span>
          </div>
        </div>
      </section>

      <h2 v-if="totalWorks" class="cp-cap cp-all">{{ $t('p_creator_id_string.allWorkN', {n: totalWorks}) }}</h2>
    </template>
  </item-list>
</template>

<style scoped>
/* ── hero ─────────────────────────────────────────────────────────── */
.cp-hero {
  position: relative;
  margin-bottom: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}

/* A strip of the creator's own pieces, fading into the panel below. With no
   public work yet it is a wash of the accent colour. */
.cp-cover {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-6) * 4), 1fr));
  grid-auto-rows: calc(var(--space-6) * 4);
  gap: var(--space-4);
  height: calc(var(--space-6) * 6);
  padding: var(--space-4);
  overflow: hidden;
  background: color-mix(in oklab, var(--primary) 18%, var(--surface));
}

.cp-cover img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  opacity: 0.85;
}

.cp-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent 30%, var(--surface));
}

.cp-id {
  display: flex;
  align-items: flex-end;
  gap: var(--space-5);
  margin-top: calc(var(--space-6) * -2);
  padding: 0 var(--space-5);
}

.cp-avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: calc(var(--space-6) * 4);
  height: calc(var(--space-6) * 4);
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--primary-foreground);
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: 800;
  box-shadow: 0 0 0 var(--space-1) var(--surface);
}

.cp-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cp-name {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  padding-bottom: var(--space-1);
}

.cp-handle {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.cp-bio {
  margin: 0;
  max-width: 60ch;
  font-size: var(--text-sm);
  color: var(--muted);
}

.cp-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-xs);
}

.cp-links a {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--muted);
}

.cp-links .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

@media (hover: hover) and (pointer: fine) {
  .cp-links a:hover { color: var(--primary); }
}

.cp-actions {
  display: flex;
  gap: var(--space-2);
  flex: none;
  padding-bottom: var(--space-1);
}

/* Numbers first, labels under them: the figures are what is being shown. */
.cp-stats {
  display: flex;
  flex-wrap: wrap;
  margin: var(--space-5) 0 0;
  border-top: 1px solid var(--border);
}

.cp-stats > div {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-1);
  flex: 1 1 0;
  min-width: calc(var(--space-6) * 4);
  padding: var(--space-4) var(--space-5);
}

.cp-stats > div + div {
  border-left: 1px solid var(--border);
}

.cp-stats dd {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.cp-stats dt {
  font-size: var(--text-xs);
  color: var(--muted);
}

/* ── sections ─────────────────────────────────────────────────────── */
.cp-sec {
  margin-bottom: var(--space-6);
}

.cp-cap {
  margin: 0 0 var(--space-3);
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.cp-all {
  margin-bottom: var(--space-3);
}

/* Best work: the most liked piece large, the next two stacked beside it. */
.cp-featured {
  display: grid;
  grid-template-columns: 2fr 1fr;
  grid-template-rows: repeat(2, calc(var(--space-6) * 8));
  gap: var(--space-3);
}

.cp-featured.n-1 {
  grid-template-columns: 1fr;
  grid-template-rows: calc(var(--space-6) * 12);
}

.cp-featured.n-2 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: calc(var(--space-6) * 12);
}

.cp-feat {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: var(--space-5);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: repeating-conic-gradient(var(--surface-2) 0 25%, var(--surface) 0 50%) 0 0 / var(--space-4) var(--space-4);
}

.cp-featured:not(.n-1):not(.n-2) .cp-feat.is-lead {
  grid-row: span 2;
}

.cp-feat img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.cp-feat-name {
  position: absolute;
  left: var(--space-3);
  bottom: var(--space-3);
  max-width: calc(100% - var(--space-6));
  padding: var(--space-1) var(--space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--surface) 85%, transparent);
}

@media (hover: hover) and (pointer: fine) {
  .cp-feat:hover { border-color: var(--primary); }
}

/* Only the owner sees how the week went, beside the totals it adds to. */
.cp-up {
  margin-left: var(--space-2);
  font-weight: 600;
  color: var(--success);
}

/* ── collections ──────────────────────────────────────────────────── */
.creator-coll-name {
  display: block;
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.creator-coll-count {
  display: block;
  font-size: var(--text-2xs);
  color: var(--muted);
}

/* ── phones ───────────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .cp-cover { height: calc(var(--space-6) * 4); }

  .cp-id {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    margin-top: calc(var(--space-6) * -1.5);
    padding: 0 var(--space-4);
  }

  .cp-avatar {
    width: calc(var(--space-6) * 3);
    height: calc(var(--space-6) * 3);
    font-size: var(--text-3xl);
  }

  .cp-handle { font-size: var(--text-2xl); }

  .cp-stats > div {
    flex-basis: 33%;
    padding: var(--space-3) var(--space-4);
  }

  .cp-stats > div:nth-child(4) { border-left: 0; }
  .cp-stats > div:nth-child(n + 4) { border-top: 1px solid var(--border); }

  .cp-featured,
  .cp-featured.n-1,
  .cp-featured.n-2 {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto;
  }

  .cp-feat { aspect-ratio: 1; }

  .cp-featured:not(.n-1):not(.n-2) .cp-feat.is-lead {
    grid-column: span 2;
    grid-row: auto;
  }

}
</style>
