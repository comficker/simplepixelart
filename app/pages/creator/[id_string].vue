<script setup lang="ts">
const artImage = useArtImage()
import type {APIResponse, Collection, ResponseSharedPage, SharedPage} from "~/types";
import {PROFILE_LINKS, linkHost} from '~/helper/profileLinks'

const route = useRoute()
const username = computed(() => route.params.id_string?.toString() || '')
const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const hasFilterQuery = computed(() =>
    !!(route.query.width || route.query.height || route.query.is_iso || route.query.search),
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
  following_count: number
  following: boolean
}

const {data: profile} = await useAuthFetch<CreatorProfile>(
    `/coloring/creators/${username.value}/`,
    {key: `creator-profile-${username.value}`},
)

const auth = useAuthStore()
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
  <item-list show-filter :title="`@${username}`">
    <template #head>
      <div class="creator-head">
        <div class="creator-avatar">
          <img v-if="profile?.avatar" :src="profile.avatar" :alt="`@${username}`" loading="lazy">
          <span v-else>{{ username.slice(0, 1).toUpperCase() }}</span>
        </div>
        <div class="creator-id">
          <h1 class="screen-title">@{{ username }}</h1>
          <ul v-if="profile" class="creator-stats" :aria-label="$t('p_creator_id_string.creatorStats')">
            <li><strong>{{ profile.arts }}</strong><span>{{ profile.arts === 1 ? 'art' : 'arts' }}</span></li>
            <li><strong>{{ profile.likes }}</strong><span>{{ profile.likes === 1 ? 'like' : 'likes' }}</span></li>
            <li><strong>{{ profile.followers }}</strong><span>{{ profile.followers === 1 ? 'follower' : 'followers' }}</span></li>
            <li v-if="joinedText"><strong>{{ joinedText }}</strong><span>{{ $t('p_creator_id_string.joined') }}</span></li>
          </ul>
        </div>
      </div>
      <p v-if="profile?.bio" class="creator-bio">{{ profile.bio }}</p>
      <ul v-if="profileLinks.length" class="creator-links">
        <li v-for="l in profileLinks" :key="l.key">
          <!-- User-supplied and unverified, so it carries no ranking signal
               and opens without handing over the referrer. -->
          <a :href="l.url" target="_blank" rel="nofollow ugc noopener noreferrer" :title="l.host">
            <span class="icon icon-link"/><span>{{ l.label }}</span>
          </a>
        </li>
      </ul>
    </template>

    <template v-if="profile && !isSelf" #actions>
      <button
          class="btn"
          :class="{primary: !profile.following}"
          :disabled="followBusy"
          @click="toggleFollow"
      >
        <span class="icon" :class="profile.following ? 'icon-check' : 'icon-plus'"/>
        <span>{{ profile.following ? 'Following' : 'Follow' }}</span>
      </button>
    </template>

    <template v-if="collections.length" #before>
      <div class="creator-colls">
        <h2 class="creator-colls-cap">{{ $t('p_creator_id_string.collections') }}</h2>
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
      </div>
    </template>
  </item-list>
</template>

<style scoped>
/* The head sits where /work puts its title, so it keeps that page's chrome
   -- no panel of its own, no border, no radius. */
.creator-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.creator-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 800;
  color: var(--primary-foreground);
  background: var(--primary);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.creator-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.creator-id {
  min-width: 0;
}

.creator-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  list-style: none;
  padding: 0;
  font-size: var(--text-xs);
}

.creator-stats li {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  white-space: nowrap;
}

.creator-stats strong {
  color: var(--foreground);
}

.creator-stats span {
  color: var(--muted);
}

.creator-bio {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--muted);
  max-width: 68ch;
}

.creator-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  list-style: none;
  padding: 0;
  margin-top: var(--space-2);
}

.creator-links a {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0.125rem var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--muted);
  transition: color var(--transition), border-color var(--transition);
}

.creator-links .icon {
  width: 12px;
  height: 12px;
}

@media (hover: hover) and (pointer: fine) {
  .creator-links a:hover {
    color: var(--primary);
    border-color: var(--primary);
  }
}

/* Collections share the artwork grid, so the two read as one page. */
.creator-colls {
  margin-bottom: var(--space-4);
}

.creator-colls-cap {
  margin-bottom: var(--space-2);
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

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
</style>