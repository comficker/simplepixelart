<script setup lang="ts">
import {toast} from "vue-sonner";

const {t} = useI18n()
const auth = useAuthStore()
const loginModal = useLoginModal()

interface ProgramInfo {
  limit: number
  founding: number
  spots_left: number
  credits: number
  me: { status: 'applied' | 'founding' | 'declined'; track: string } | null
}

// Spots and the viewer's own standing. The standing is per account, so it is
// fetched again in the browser once signed in -- the HTML is cached for all.
const {data: info, refresh: refreshInfo} = await useAuthFetch<ProgramInfo>('/coloring/creators/program/', {
  key: 'creator-program-info',
})
onMounted(() => { if (auth.isLogged) refreshInfo() })
watch(() => auth.isLogged, v => { if (v) refreshInfo() })

const PERKS = computed(() => [
  {icon: 'icon-trophy', title: t('p_creator_program.perkBadgeTitle'), body: t('p_creator_program.perkBadgeBody')},
  {icon: 'icon-rocket', title: t('p_creator_program.perkProTitle'), body: t('p_creator_program.perkProBody')},
  {icon: 'icon-gift', title: t('p_creator_program.perkCreditsTitle', {n: info.value?.credits ?? 200}), body: t('p_creator_program.perkCreditsBody')},
  {icon: 'icon-share', title: t('p_creator_program.perkFeatureTitle'), body: t('p_creator_program.perkFeatureBody')},
  {icon: 'icon-flag', title: t('p_creator_program.perkChallengeTitle'), body: t('p_creator_program.perkChallengeBody')},
])

const VALUES = computed(() => [
  {title: t('p_creator_program.valuePixelTitle'), body: t('p_creator_program.valuePixelBody')},
  {title: t('p_creator_program.valueCreditTitle'), body: t('p_creator_program.valueCreditBody')},
  {title: t('p_creator_program.valueYoursTitle'), body: t('p_creator_program.valueYoursBody')},
])

const STEPS = computed(() => [
  {title: t('p_creator_program.step1Title'), body: t('p_creator_program.step1Body')},
  {title: t('p_creator_program.step2Title'), body: t('p_creator_program.step2Body')},
  {title: t('p_creator_program.step3Title'), body: t('p_creator_program.step3Body')},
])

const FAQ = computed(() => [
  {q: t('p_creator_program.faq0q'), a: t('p_creator_program.faq0a'), icon: 'icon-user'},
  {q: t('p_creator_program.faq1q'), a: t('p_creator_program.faq1a'), icon: 'icon-link'},
  {q: t('p_creator_program.faq2q'), a: t('p_creator_program.faq2a'), icon: 'icon-auto-fix'},
  {q: t('p_creator_program.faq3q'), a: t('p_creator_program.faq3a'), icon: 'icon-coin'},
  {q: t('p_creator_program.faq4q'), a: t('p_creator_program.faq4a'), icon: 'icon-trash'},
])

// ---- application form ------------------------------------------------------
const links = ref(['', '', ''])
const note = ref('')
const sending = ref(false)

const ERRORS: Record<string, string> = {
  LINKS_INVALID: 'p_creator_program.errLinks',
  ALREADY_APPLIED: 'p_creator_program.errAlready',
}

async function submit() {
  if (!auth.isLogged) {
    loginModal.show(submit)
    return
  }
  if (sending.value) return
  sending.value = true
  try {
    await useNativeFetch('/coloring/creators/program/apply/', {
      method: 'POST',
      body: {links: links.value.filter(l => l.trim()), note: note.value},
    })
    toast.success(t('p_creator_program.appliedToast'))
    await refreshInfo()
  } catch (e: any) {
    const code = Array.isArray(e?.data) ? e.data[0] : ''
    toast.error(t(ERRORS[code] || 'p_creator_program.errGeneric'))
    if (code === 'ALREADY_APPLIED') refreshInfo()
  } finally {
    sending.value = false
  }
}

function toForm() {
  document.getElementById('apply')?.scrollIntoView({behavior: 'smooth', block: 'start'})
}

useCustomSeoMeta({
  title: () => t('p_creator_program.seoTitle'),
  description: () => t('p_creator_program.seoDescription'),
  canonical: 'https://simplepixelart.com/creator-program',
})
</script>

<template>
  <ToolLayout :title="$t('p_creator_program.title')" no-ad>
    <div class="screen home-stack">
      <section class="cpg-hero">
        <div class="cpg-hero-main">
          <h1 class="cpg-title">
            <span class="cpg-title-main">{{ $t('p_creator_program.heroTitleMain') }}</span>
            <span class="cpg-title-accent">{{ $t('p_creator_program.heroTitleAccent') }}</span>
          </h1>
          <p class="cpg-tagline">{{ $t('p_creator_program.heroTagline') }}</p>
          <div class="cpg-cta">
            <button type="button" class="btn primary" @click="toForm">
              <span class="icon icon-trophy"/><span>{{ $t('p_creator_program.applyCta') }}</span>
            </button>
            <NuxtLinkLocale to="/arts" class="btn">
              <span class="icon icon-explore"/><span>{{ $t('p_creator_program.seeGallery') }}</span>
            </NuxtLinkLocale>
          </div>
          <p v-if="info" class="cpg-spots text-xs text-muted">
            {{ $t('p_creator_program.spotsLeft', {n: info.spots_left, limit: info.limit}) }}
          </p>
        </div>
      </section>

      <!-- What you get for joining, beside the form that gets it. -->
      <div class="screen-row cpg-row">
        <Widget :title="$t('p_creator_program.perksTitle')">
          <ul class="cpg-grid">
            <li v-for="p in PERKS" :key="p.title" class="cpg-item">
              <span class="icon cpg-item-ic" :class="p.icon"/>
              <h3 class="cpg-item-title">{{ p.title }}</h3>
              <p class="cpg-item-body">{{ p.body }}</p>
            </li>
          </ul>
        </Widget>

        <Widget id="apply" :title="$t('p_creator_program.applyTitle')">
          <div v-if="info?.me?.status === 'founding'" class="cpg-state">
            <span class="icon icon-trophy"/>
            <p>{{ $t('p_creator_program.stateFounding') }}</p>
          </div>
          <div v-else-if="info?.me?.status === 'applied'" class="cpg-state">
            <span class="icon icon-clock"/>
            <p>{{ $t('p_creator_program.stateApplied') }}</p>
          </div>
          <div v-else-if="info?.spots_left === 0" class="cpg-state">
            <span class="icon icon-clock"/>
            <p>{{ $t('p_creator_program.stateFull') }}</p>
          </div>
          <form v-else class="cpg-form" @submit.prevent="submit">
            <p v-if="info?.me?.status === 'declined'" class="text-xs text-muted">{{ $t('p_creator_program.stateDeclined') }}</p>
            <div class="cpg-field">
              <label class="publish-label" for="cpg-link-0">{{ $t('p_creator_program.linksLabel') }}</label>
              <input
                  v-for="(_, i) in links"
                  :id="`cpg-link-${i}`"
                  :key="i"
                  v-model="links[i]"
                  type="text"
                  class="publish-input"
                  maxlength="300"
                  :placeholder="i === 0 ? 'x.com/you' : i === 1 ? 'instagram.com/you' : $t('p_creator_program.linkPlaceholder')"
              >
            </div>
            <div class="cpg-field">
              <label class="publish-label" for="cpg-note">{{ $t('p_creator_program.noteLabel') }}</label>
              <textarea id="cpg-note" v-model="note" class="publish-input" rows="3" maxlength="500" :placeholder="$t('p_creator_program.notePlaceholder')"/>
            </div>
            <button type="submit" class="btn primary block" :disabled="sending">
              <span class="icon icon-trophy"/>
              <span>{{ auth.isLogged ? $t('p_creator_program.submit') : $t('p_creator_program.signInToApply') }}</span>
            </button>
          </form>
        </Widget>
      </div>

    </div>

    <template #status>
      <PartialFooterBar/>
    </template>

    <!-- The reading part lives in the readme rail; the main column keeps what
         a visitor decides on: the proof, the perks, the people, the form. -->
    <template #doc>
      <h2>{{ $t('p_creator_program.title') }}</h2>
      <p>{{ $t('p_creator_program.docIntro') }}</p>

      <h2>{{ $t('p_creator_program.whatYouGet') }}</h2>
      <ul>
        <li v-for="v in VALUES" :key="v.title"><strong>{{ v.title }}.</strong> {{ v.body }}</li>
      </ul>

      <h2>{{ $t('p_creator_program.aiTitle') }}</h2>
      <p>{{ $t('p_creator_program.aiBody') }}</p>

      <h2>{{ $t('p_creator_program.howTitle') }}</h2>
      <ol>
        <li v-for="st in STEPS" :key="st.title"><strong>{{ st.title }}.</strong> {{ st.body }}</li>
      </ol>

      <h2>{{ $t('p_creator_program.assetsTitle') }}</h2>
      <p>
        {{ $t('p_creator_program.assetsBody') }}
        <NuxtLinkLocale to="/tilesets/editor">{{ $t('p_creator_program.assetsCta') }}</NuxtLinkLocale>
      </p>

      <QnA :items="FAQ"/>
    </template>
  </ToolLayout>
</template>

<style scoped>
/* The scene is true pixel art at its own 397x159 size (run through the
   site's own image-to-pixel reconstruction), scaled up crisp by the browser.
   The illustration sits bottom-right; a wash of the panel colour runs from
   the top-left corner, under the copy, and clears toward the scene, so the
   text reads in every theme. On phones the scene gets room below the
   buttons. */
.cpg-hero {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-4) calc(var(--space-6) * 7);
  image-rendering: pixelated;
  background:
    linear-gradient(165deg, var(--surface) 0%, var(--surface) 46%, color-mix(in oklab, var(--surface) 80%, transparent) 56%, color-mix(in oklab, var(--surface) 50%, transparent) 66%, color-mix(in oklab, var(--surface) 22%, transparent) 76%, color-mix(in oklab, var(--surface) 0%, transparent) 88%),
    linear-gradient(var(--hero-scrim, transparent), var(--hero-scrim, transparent)),
    url('/images/creator-program-hero.png') 96% 100% / cover no-repeat,
    var(--surface);
}

@media (min-width: 1100px) {
  .cpg-hero {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    align-items: center;
    min-height: calc(var(--space-6) * 13);
    padding-bottom: var(--space-5);
    background:
      linear-gradient(to bottom right, var(--surface) 0%, var(--surface) 34%, color-mix(in oklab, var(--surface) 82%, transparent) 44%, color-mix(in oklab, var(--surface) 55%, transparent) 54%, color-mix(in oklab, var(--surface) 28%, transparent) 64%, color-mix(in oklab, var(--surface) 10%, transparent) 74%, color-mix(in oklab, var(--surface) 0%, transparent) 84%),
      linear-gradient(var(--hero-scrim, transparent), var(--hero-scrim, transparent)),
      url('/images/creator-program-hero.png') 100% 100% / cover no-repeat,
      var(--surface);
  }
}

/* Dark theme: a thin scrim over the whole scene, under the wash, so the
   bright sky sits in the dark page instead of punching out of it. */
:global(html[data-theme="dark"]) .cpg-hero {
  --hero-scrim: color-mix(in oklab, var(--surface) 30%, transparent);
}

/* Same type treatment as the home hero: one heavy two-line title. */
.cpg-title {
  display: flex;
  flex-direction: column;
  font-size: clamp(var(--text-3xl), 4.4vw, var(--text-4xl));
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.035em;
  line-height: 1.02;
  text-wrap: balance;
}

.cpg-title-main {
  color: var(--foreground);
}

.cpg-title-accent {
  color: var(--primary);
}

.cpg-tagline {
  margin-top: var(--space-3);
  max-width: 60ch;
  color: var(--muted);
  font-size: var(--text-sm);
}

.cpg-cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-5);
}

.cpg-spots {
  margin-top: var(--space-3);
}

/* The last thing in the column: it takes the rest of the height, so both
   halves and the rule between them run down to the foot. */
.cpg-row {
  flex: 1 0 auto;
}

.cpg-grid {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Icon in its own column, pinned to the top and level with the title line;
   title and text stacked beside it. */
.cpg-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: var(--space-3);
  row-gap: var(--space-1);
  align-items: start;
}

.cpg-item-ic {
  grid-row: span 2;
  width: var(--icon-lg);
  height: var(--icon-lg);
  color: var(--primary);
}

.cpg-item-title {
  font-size: var(--text-sm);
  font-weight: 700;
  /* One icon tall, so the first line sits level with the icon. */
  line-height: var(--icon-lg);
  color: var(--foreground);
}

.cpg-item-body {
  font-size: var(--text-xs);
  color: var(--muted);
  line-height: 1.5;
}

.cpg-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 560px;
}

.cpg-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.cpg-state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-sm);
}

.cpg-state .icon {
  width: var(--icon-lg);
  height: var(--icon-lg);
  color: var(--primary);
}
</style>
