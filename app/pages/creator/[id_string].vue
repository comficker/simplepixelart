<script setup lang="ts">
import type {APIResponse, Collection, ResponseSharedPage, SharedPage} from "~/types";
import {PROFILE_LINKS, linkHost} from '~/helper/profileLinks'
import {tileImageUrl} from '~/helper/tilemap'
import {toast} from 'vue-sonner'

const {t, locale} = useI18n()

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

const collectionsFetch = useAuthFetch<APIResponse<CreatorCollection>>(
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

const worksCountFetch = useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
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
  badges?: string[]
  is_bot?: boolean
  links_follow?: boolean
  claimable?: boolean
  claim_url?: string | null
  claimed_by?: string | null
}

const profileFetch = useAuthFetch<CreatorProfile>(
    `/coloring/creators/${username.value}/`,
    {key: `creator-profile-${username.value}`},
)

const auth = useAuthStore()
const apiBase = useRuntimeConfig().public.api as string

// The creator's three best-liked pieces, shown large above all their work.
const featuredFetch = useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
  params: {user: username.value, status: 'public', is_tile: false, ordering: '-score,-id', page_size: 3},
  key: `creator-featured-${username.value}`,
})

// The four requests don't depend on each other: fire them together.
await Promise.all([collectionsFetch, worksCountFetch, profileFetch, featuredFetch])
const {data: collectionsRes} = collectionsFetch
const {data: worksCount} = worksCountFetch
const {data: profile, refresh: refreshProfile} = profileFetch
const {data: featuredRes} = featuredFetch
const featured = computed(() => (featuredRes.value?.results || []).slice(0, 3))
const followBusy = ref(false)
const loginModal = useLoginModal()

async function toggleFollow() {
  if (!auth.isLogged) { loginModal.show(followAfterLogin); return }
  if (followBusy.value || !profile.value) return
  followBusy.value = true
  try {
    const res = await useNativeFetch<{ following: boolean; followers: number }>(
        '/activity/follow/', {method: 'POST', body: {username: username.value}},
    )
    profile.value = {...profile.value, following: res.following, followers: res.followers}
  } catch {
    toast.error(t('p_creator_id_string.couldNotUpdateFollow'))
  } finally {
    followBusy.value = false
  }
}

// The profile was fetched as a guest, so it doesn't know whether the new
// session already follows them; ask first, so "Follow" can't unfollow.
async function followAfterLogin() {
  await refreshProfile()
  if (!profile.value?.following && !isSelf.value) await toggleFollow()
}

const isSelf = computed(() => auth.logged?.username === username.value)
const localePath = useLocalePath()

// A profile its real author has taken over sends visitors to their account.
watch(() => profile.value?.claimed_by, (to) => {
  if (to && to.toLowerCase() !== username.value.toLowerCase()) {
    navigateTo(localePath(`/creator/${to}`), {redirectCode: 301, replace: true})
  }
}, {immediate: true})

/* Claim this profile: an imported profile (a pack brought in under its
   author's name) can be taken over by the author. They put a code on their
   own page (claim_url, e.g. their itch.io profile) and we check it there. */
const showClaim = ref(false)
const claim = ref<{ code: string, url: string } | null>(null)
const claimBusy = ref(false)
const claimError = ref('')
async function openClaim() {
  if (!auth.isLogged) {
    loginModal.show(openClaim)
    return
  }
  claimError.value = ''
  showClaim.value = true
  try {
    claim.value = await useNativeFetch<{ code: string, url: string }>(`/coloring/creators/${username.value}/claim/`)
  } catch (e: any) {
    claimError.value = e?.response?._data?.[0] || 'ERROR'
  }
}
async function copyClaimCode() {
  try { await navigator.clipboard.writeText(claim.value?.code || '') } catch {}
}
async function verifyClaim() {
  claimBusy.value = true
  claimError.value = ''
  try {
    const res = await useNativeFetch<{ username: string, moved: { pieces: number } }>(`/coloring/creators/${username.value}/claim/`, {method: 'POST'})
    track('profile_claim', {pieces: res.moved.pieces})
    toast.success(t('p_creator_id_string.claimDone', {n: res.moved.pieces}))
    showClaim.value = false
    navigateTo(localePath(`/creator/${res.username}`))
  } catch (e: any) {
    claimError.value = e?.response?._data?.[0] || 'ERROR'
  } finally {
    claimBusy.value = false
  }
}

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
  title: t('p_creator_id_string.shareTitle', {user: `@${username.value}`}),
  desc: profile.value?.bio || t('p_creator_id_string.pixelArtByUser', {user: `@${username.value}`}),
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
      .toLocaleDateString(locale.value, {month: 'short', year: 'numeric'})
})

const collections = computed(() => collectionsRes.value?.results || [])
const totalWorks = computed(() => worksCount.value?.count || 0)
const isEmptyCreator = computed(() => totalWorks.value === 0 && collections.value.length === 0)

const {covers, mosaics, coverFailed, loadCovers} = useCollectionCovers(() => collections.value)

onMounted(loadCovers)
watch(collections, loadCovers)

const canonicalUrl = computed(() => {
  const base = `https://simplepixelart.com/creator/${username.value}`
  if (hasFilterQuery.value) return base
  return page.value > 1 ? `${base}?page=${page.value}` : base
})

const seoTitle = computed(() =>
    page.value > 1
        ? `Pixel art by @${username.value} — Page ${page.value}`
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
  <!-- Works in the main column, the person in the rail: the same split as an
       art page, so the profile reads as one panel rather than a banner the
       works had to scroll past. -->
  <ToolLayout class="creator-page">

    <div class="screen">
      <Widget v-if="featured.length" :title="$t('p_creator_id_string.bestWork')">
        <div class="cp-featured" :class="`n-${featured.length}`">
          <NuxtLinkLocale
              v-for="(f, i) in featured"
              :key="f.id"
              :to="`/art/${f.id_string}`"
              class="cp-feat"
              :class="{'is-lead': i === 0}"
              :title="f.name"
          >
            <img :src="tileImageUrl(apiBase, f.id_string)" :alt="f.name || $t('p_creator_id_string.pixelArtAlt')" :loading="i === 0 ? 'eager' : 'lazy'">
            <span class="cp-feat-name">{{ f.name || $t('common.untitled') }}</span>
          </NuxtLinkLocale>
        </div>
      </Widget>

      <Widget v-if="collections.length" :title="$t('p_creator_id_string.collections')" class="creator-colls">
        <div class="results">
          <ItemCollectionTile
              v-for="c in collections"
              :key="c.id"
              :value="c"
              :cover="covers[c.id as number]"
              :mosaic="mosaics[c.id as number]"
              :failed="coverFailed[c.id as number]"
              @error="coverFailed[c.id as number] = true"
          />
        </div>
      </Widget>

      <Widget :title="$t('p_creator_id_string.allWorkN', {n: totalWorks || 0})">
        <item-list :limit="24"/>
      </Widget>
    </div>

    <template #aside>
      <Widget class="cp-profile" :title="$t('p_art_id_string.creator')">
        <template #ctl>
          <SocialSharing :meta="shareMeta" position="right" icon-only/>
        </template>
        <div class="cp-id">
          <div class="cp-avatar">
            <img v-if="profile?.avatar" :src="profile.avatar" :alt="`@${username}`">
            <span v-else>{{ username.slice(0, 1).toUpperCase() }}</span>
          </div>
          <div class="cp-name">
            <h1 class="cp-handle">@{{ username }}</h1>
            <CreatorBadges :badges="profile?.badges"/>
            <span v-if="joinedText" class="cp-joined">{{ $t('p_creator_id_string.joined') }} {{ joinedText }}</span>
          </div>
        </div>
        <p v-if="profile?.bio" class="cp-bio">{{ profile.bio }}</p>
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
          <TipButton v-if="!isSelf && !profile.is_bot" :username="username"/>
        </div>
        <div v-if="profile?.claimable && !isSelf" class="cp-claim">
          <span class="icon icon-check-decagram"/>
          <span>{{ $t('p_creator_id_string.claimPrompt') }}</span>
          <button type="button" class="btn" @click="openClaim">{{ $t('p_creator_id_string.claimButton') }}</button>
        </div>
      </Widget>

      <Widget v-if="profile" :title="$t('p_creator_id_string.creatorStats')">
        <dl class="cp-stats">
          <div><dd>{{ profile.arts }}</dd><dt>{{ $t('p_creator_id_string.stat_artworks') }}</dt></div>
          <div>
            <dd>{{ profile.likes }}<span v-if="thisWeek?.likes" class="cp-up" :title="$t('p_creator_id_string.thisWeek')">+{{ thisWeek.likes }}</span></dd>
            <dt>{{ $t('p_creator_id_string.stat_likes') }}</dt>
          </div>
          <div>
            <dd>{{ profile.followers }}<span v-if="thisWeek?.followers" class="cp-up" :title="$t('p_creator_id_string.thisWeek')">+{{ thisWeek.followers }}</span></dd>
            <dt>{{ $t('p_creator_id_string.stat_followers') }}</dt>
          </div>
          <div>
            <dd>{{ profile.remixes || 0 }}<span v-if="thisWeek?.remixes" class="cp-up" :title="$t('p_creator_id_string.thisWeek')">+{{ thisWeek.remixes }}</span></dd>
            <dt>{{ $t('p_creator_id_string.stat_remixed') }}</dt>
          </div>
        </dl>
      </Widget>

      <!-- The same label / value rows as an art page's details. Followed once
           the creator has enough hand-made public work (links_follow, decided
           by the API); nofollow until then, so a new account cannot farm
           links. -->
      <Widget v-if="profileLinks.length" :title="$t('p_art_id_string.creatorLinks')">
        <dl class="art-meta-side">
          <div v-for="l in profileLinks" :key="l.key" class="art-meta-row">
            <dt>{{ l.label }}</dt>
            <dd>
              <a :href="l.url" target="_blank" :rel="profile?.links_follow ? 'noopener' : 'nofollow ugc noopener noreferrer'" class="art-meta-link cp-link">
                <span class="icon icon-link"/>{{ l.host }}
              </a>
            </dd>
          </div>
        </dl>
      </Widget>
    </template>
    <UiModal v-if="showClaim" :title="$t('p_creator_id_string.claimTitle')" @close="showClaim = false">
      <div class="cp-claim-modal">
        <p>{{ $t('p_creator_id_string.claimStep1') }}</p>
        <div v-if="claim" class="cp-claim-code">
          <code>{{ claim.code }}</code>
          <button type="button" class="btn" @click="copyClaimCode"><span class="icon icon-content-copy"/></button>
        </div>
        <p v-if="claim">
          {{ $t('p_creator_id_string.claimStep2') }}
          <a :href="claim.url" target="_blank" rel="nofollow noopener">{{ claim.url }}</a>
        </p>
        <p class="text-xs text-muted">{{ $t('p_creator_id_string.claimStep3') }}</p>
        <p v-if="claimError" class="cp-claim-err">{{ $t('p_creator_id_string.claimErr_' + claimError, $t('p_creator_id_string.claimErr_ERROR')) }}</p>
        <button type="button" class="btn primary" :disabled="!claim || claimBusy" @click="verifyClaim">
          {{ claimBusy ? $t('p_creator_id_string.claimChecking') : $t('p_creator_id_string.claimVerify') }}
        </button>
      </div>
    </UiModal>
  </ToolLayout>
</template>

<style scoped>
/* ── profile (rail) ───────────────────────────────────────────────── */
.cp-profile :deep(.widget-body) {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* The avatar is as tall as the name block beside it (handle, labels,
   joined), square by its aspect ratio rather than a fixed size. A grid
   row, since a flex row will not size a stretched item's width from it. */
.cp-id {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-3);
}

.cp-name {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  min-width: 0;
}

.cp-handle {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 800;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.cp-joined {
  font-size: var(--text-xs);
  color: var(--muted);
}

.cp-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  height: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--primary-fill);
  color: var(--primary-foreground);
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 800;
}

.cp-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Follow takes the row; Tip sits beside it as the second ask. */
.cp-actions {
  display: flex;
  gap: var(--space-2);
}

.cp-actions > :first-child {
  flex: 1;
  justify-content: center;
}

.cp-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.cp-link .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
  color: var(--muted);
}

.cp-bio {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--muted);
}


.cp-claim {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3);
  border: 1px dashed var(--primary);
  border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--primary) 6%, var(--surface));
  font-size: var(--text-sm);
}
.cp-claim .icon { color: var(--primary); }
.cp-claim .btn { margin-left: auto; }
.cp-claim-modal { display: flex; flex-direction: column; gap: var(--space-3); font-size: var(--text-sm); }
.cp-claim-code { display: flex; align-items: center; gap: var(--space-2); }
.cp-claim-code code {
  flex: 1; padding: var(--space-2) var(--space-3); border: 1px solid var(--border);
  border-radius: var(--radius-sm); background: var(--surface-2); font-size: var(--text-base); font-weight: 700;
}
.cp-claim-err { color: var(--danger); }

/* ── stats (rail): a 2×2 of quiet tiles, label over figure ───────── */
.cp-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
}

.cp-stats > div {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.cp-stats dd {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.cp-stats dt {
  font-size: var(--text-xs);
  color: var(--muted);
}

/* Only the owner sees how the week went, beside the total it adds to. */
.cp-up {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--success);
}

/* ── best work: the most liked piece large, the next two beside it ── */
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
  background: var(--card);
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

/* Stacked (below 1280, where the rail drops under the tool), the person
   comes first: below thirty pieces nobody would find who made them. Moved
   up under the site header, the rail gives its top rule to the works. */
@media (max-width: 1279px) {
  .creator-page {
    display: flex;
    flex-direction: column;
  }

  .main-wrapper.dash .creator-page > :deep(.tool-doc) {
    order: -1;
    margin-top: 0;
    border-top: 0;
  }

  .main-wrapper.dash .creator-page > :deep(.tool-main) {
    margin-top: 0;
    border-top: 1px solid var(--border);
  }
}

/* ── phones ───────────────────────────────────────────────────────── */
@media (max-width: 767px) {
  /* One row of equal squares: the lead at full width took a whole screen
     before the rest of the page. */
  .cp-featured,
  .cp-featured.n-1,
  .cp-featured.n-2 {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: auto;
  }

  .cp-feat {
    aspect-ratio: 1;
    padding: var(--space-2);
  }

  .cp-featured:not(.n-1):not(.n-2) .cp-feat.is-lead { grid-row: auto; }

  /* Too small to caption without covering the piece. */
  .cp-feat-name { display: none; }
}
</style>
