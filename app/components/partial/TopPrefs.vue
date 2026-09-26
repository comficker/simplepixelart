<script setup lang="ts">
const {current, setTheme, themes} = useTheme() as any
const {locale, locales} = useI18n()
const switchLocalePath = useSwitchLocalePath()
const router = useRouter()
const veil = useRebuildVeil()
const {t} = useI18n()

function pickTheme(id: string, name: string) {
  setTheme(id)
  veil.run(t('c_TopPrefs.applyingTheme', {name}))
}

function pickLocale(code: string, name: string) {
  // The navigation refetches the page in the new language; the veil stays up
  // until that lands, even if it outruns the floor.
  veil.run(t('c_TopPrefs.switchingTo', {name}), () => router.push(switchLocalePath(code)))
}

const localeList = computed(() => locales.value as { code: string; name: string }[])
const currentLocale = computed(() =>
    localeList.value.find(l => l.code === locale.value)?.name || locale.value)
</script>

<template>
  <ui-dropdown-menu position="right" :label="$t('c_TopPrefs.theme')">
    <button type="button" class="hdr-link" :title="$t('c_TopPrefs.theme')">
      <span class="icon icon-palette"/>
    </button>
    <template #menu>
      <div class="file-menu">
        <div class="file-menu-item file-menu-heading">{{ $t('c_TopPrefs.theme') }}</div>
        <button v-for="t in themes" :key="t.id" class="file-menu-item" @click="pickTheme(t.id, $t(t.i18n))">
          <span class="file-menu-label">
            <span>{{ $t(t.i18n) }}</span>
            <span v-if="current === t.id" class="icon icon-check"/>
          </span>
        </button>
      </div>
    </template>
  </ui-dropdown-menu>

  <ui-dropdown-menu position="right" :label="$t('c_TopPrefs.language')">
    <button type="button" class="hdr-link" :title="`${$t('c_TopPrefs.language')}: ${currentLocale}`">
      <span class="icon icon-earth"/>
    </button>
    <template #menu>
      <div class="file-menu">
        <div class="file-menu-item file-menu-heading">{{ $t('c_TopPrefs.language') }}</div>
        <!-- switchLocalePath keeps the visitor on the page they are reading. -->
        <button
            v-for="l in localeList"
            :key="l.code"
            class="file-menu-item"
            @click="pickLocale(l.code, l.name)"
        >
          <span class="file-menu-label">
            <span>{{ l.name }}</span>
            <span v-if="l.code === locale" class="icon icon-check"/>
          </span>
        </button>
      </div>
    </template>
  </ui-dropdown-menu>
</template>
