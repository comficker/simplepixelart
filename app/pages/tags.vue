<script setup lang="ts">
import type {HomeTag} from '~~/server/api/home-tags.get'
import type {TagIndexRow} from '~~/server/api/tags-index.get'

const {t, locale} = useI18n()

// Both lists come from cached server routes (one small JSON each), so this
// page renders without walking the tag API itself.
const [{data: popular}, {data: index}] = await Promise.all([
  useFetch<HomeTag[]>('/api/home-tags', {query: {lang: locale}, key: `tags-popular-${locale.value}`}),
  useFetch<TagIndexRow[]>('/api/tags-index', {query: {lang: locale}, key: `tags-index-${locale.value}`}),
])

// The full list, A to Z, grouped by first letter; digits share one "#" group.
const q = ref('')
const groups = computed(() => {
  const needle = q.value.trim().toLocaleLowerCase(locale.value)
  const rows = (index.value || [])
      .filter(r => !needle || r.title.toLocaleLowerCase(locale.value).includes(needle) || r.slug.includes(needle))
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, locale.value, {sensitivity: 'base'}))
  const out: { key: string; rows: TagIndexRow[] }[] = []
  for (const r of rows) {
    const c = r.title.trim().charAt(0).toLocaleUpperCase(locale.value)
    const key = /\d/.test(c) ? '#' : c || '#'
    const last = out[out.length - 1]
    if (last?.key === key) last.rows.push(r)
    else out.push({key, rows: [r]})
  }
  return out
})
const total = computed(() => index.value?.length || 0)
const fmt = (n: number) => new Intl.NumberFormat(locale.value).format(n)

useCustomSeoMeta({
  title: () => t('p_tags.seoTitle'),
  description: () => t('p_tags.seoDescription', {count: fmt(total.value)}),
  canonical: 'https://simplepixelart.com/tags',
  ogType: 'website',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: t('p_tags.h1'),
        url: 'https://simplepixelart.com/tags',
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: (popular.value || []).length,
          itemListElement: (popular.value || []).map((r, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: r.title,
            url: `https://simplepixelart.com/arts/${r.slug}`,
          })),
        },
      }),
    },
  ],
})
</script>

<template>
  <ToolLayout :title="$t('p_tags.h1')" title-tag="h1">
    <div class="screen">
      <!-- No head of its own: it sits right under the page's title band. -->
      <Widget v-if="popular?.length">
        <TagTileGrid :tags="popular" :eager="8"/>
      </Widget>

      <Widget :title="$t('p_tags.allTags', {count: fmt(total)})">
        <template #ctl>
          <NuxtLinkLocale to="/arts" class="widget-ctl-btn">
            <span class="widget-ctl-name">{{ $t('p_tags.browseArt') }}</span><span class="icon icon-angle-right"/>
          </NuxtLinkLocale>
        </template>
        <input
            v-model="q"
            type="search"
            class="input tags-search"
            :placeholder="$t('p_arts.searchTags')"
            :aria-label="$t('p_arts.searchTags')"
        >
        <div v-if="groups.length" class="tags-az">
          <section v-for="g in groups" :key="g.key" class="tags-group">
            <h2 class="tags-letter">{{ g.key }}</h2>
            <ul>
              <li v-for="r in g.rows" :key="r.slug">
                <NuxtLinkLocale :to="`/arts/${r.slug}`">{{ r.title }}</NuxtLinkLocale>
              </li>
            </ul>
          </section>
        </div>
        <p v-else class="text-xs text-muted">{{ $t('p_arts.noTagsMatch', {q}) }}</p>
      </Widget>
    </div>

    <template #status>
      <PartialFooterBar/>
    </template>

    <template #doc>
      <h2>{{ $t('p_tags.h1') }}</h2>
      <p>{{ $t('p_tags.intro') }}</p>
      <p>
        <NuxtLinkLocale to="/editor?new=true" class="btn">{{ $t('p_ideas.startDrawing') }}</NuxtLinkLocale>
      </p>
    </template>
  </ToolLayout>
</template>

<style scoped>
.tags-search {
  width: 100%;
  max-width: 20rem;
  margin-bottom: var(--space-3);
}

.tags-az {
  columns: 4 11rem;
  column-gap: var(--space-5);
}

.tags-group {
  break-inside: avoid;
  margin-bottom: var(--space-3);
}

.tags-letter {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--muted);
}

.tags-group ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.tags-group li {
  padding: 1px 0;
  font-size: var(--text-sm);
}

.tags-group a {
  color: inherit;
}

@media (hover: hover) and (pointer: fine) {
  .tags-group a:hover {
    color: var(--primary);
  }
}
</style>
