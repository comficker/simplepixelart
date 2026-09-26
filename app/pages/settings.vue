<script setup lang="ts">
import {toast} from 'vue-sonner'
import {PROFILE_LINKS} from '~/helper/profileLinks'

const auth = useAuthStore()
const {current, setTheme, themes} = useTheme() as any
const loginModal = useLoginModal()
const {current: resultsCols, options: resultsColOptions, setResultsCols} = useResultsCols()

useCustomSeoMeta({
  title: 'Settings - Simple Pixel Art',
  description: 'Manage your account, appearance and app data.',
  canonical: 'https://simplepixelart.com/settings',
  robots: 'noindex, follow',
})

const form = reactive({username: '', first_name: '', last_name: '', bio: ''})
const links = reactive<Record<string, string>>(
    Object.fromEntries(PROFILE_LINKS.map(l => [l.key, ''])))
const savingProfile = ref(false)

function fillForm() {
  const u = auth.logged as any
  if (!u) return
  form.username = u.username || ''
  form.first_name = u.first_name || ''
  form.last_name = u.last_name || ''
  form.bio = u.meta?.bio || ''
  const saved = u.meta?.links || {}
  for (const l of PROFILE_LINKS) links[l.key] = saved[l.key] || ''
}

const PROFILE_ERRORS: Record<string, string> = {
  USERNAME_INVALID: 'Username must be 3–30 letters, numbers, . _ or -',
  USERNAME_DUPLICATE: 'That username is taken',
}

async function saveProfile() {
  if (savingProfile.value) return
  savingProfile.value = true
  try {
    // `links` goes as its own object: update_profile takes either shape, and
    // nesting keeps a platform named like a profile field from colliding.
    await useNativeFetch('/auth/profile', {method: 'PATCH', body: {...form, links: {...links}}})
    await auth.fetchInfo()
    fillForm()
    toast.success('Profile saved')
  } catch (e: any) {
    const code = e?.response?._data?.[0] || e?.data?.[0]
    toast.error(PROFILE_ERRORS[code] || 'Could not save profile')
  } finally {
    savingProfile.value = false
  }
}

const pw = reactive({current: '', next: '', confirm: ''})
const savingPw = ref(false)
const hasPassword = computed(() => !!(auth.logged as any)?.has_password)

const PW_ERRORS: Record<string, string> = {
  PASSWORD_TOO_SHORT: 'Password must be at least 6 characters',
  PASSWORD_WRONG: 'Current password is incorrect',
}

async function savePassword() {
  if (savingPw.value) return
  if (pw.next !== pw.confirm) {
    toast.error('Passwords do not match')
    return
  }
  savingPw.value = true
  try {
    await useNativeFetch('/auth/password', {
      method: 'POST',
      body: {current_password: pw.current, new_password: pw.next},
    })
    pw.current = ''; pw.next = ''; pw.confirm = ''
    await auth.fetchInfo()
    toast.success('Password updated')
  } catch (e: any) {
    const code = e?.response?._data?.[0] || e?.data?.[0]
    toast.error(PW_ERRORS[code] || 'Could not update password')
  } finally {
    savingPw.value = false
  }
}

onMounted(fillForm)
watch(() => auth.logged, fillForm)
</script>

<template>
  <div class="page">
    <section class="readme set-panel">
      <div class="readme-head set-head">
        <h1 class="set-title">
          <span class="icon icon-cog"/>
          <span>{{ $t('common.settings') }}</span>
        </h1>
      </div>

      <div class="set-body">

        <section class="set-section">
          <h2 class="set-section-title">{{ $t('p_settings.account') }}</h2>
          <div v-if="!auth.isLogged" class="set-signin">
            <p class="text-xs text-muted" v-html="$t('p_settings.signInToManageYourUsername')"/>
            <button class="btn primary" @click="loginModal.show()">{{ $t('common.signIn') }}</button>
          </div>
          <form v-else class="set-form" @submit.prevent="saveProfile">
            <label class="set-field">
              <span class="set-label">{{ $t('p_settings.username') }}</span>
              <input v-model="form.username" class="set-input" maxlength="30" autocomplete="username">
              <span class="set-help text-xs">{{ $t('p_settings.yourPublicHandleChangingIt') }}</span>
            </label>
            <div class="set-row">
              <label class="set-field">
                <span class="set-label">{{ $t('p_settings.firstName') }}</span>
                <input v-model="form.first_name" class="set-input" maxlength="150" autocomplete="given-name">
              </label>
              <label class="set-field">
                <span class="set-label">{{ $t('p_settings.lastName') }}</span>
                <input v-model="form.last_name" class="set-input" maxlength="150" autocomplete="family-name">
              </label>
            </div>
            <label class="set-field">
              <span class="set-label">{{ $t('p_settings.bio') }}</span>
              <textarea v-model="form.bio" class="set-input set-textarea" maxlength="280" rows="3" :placeholder="$t('p_settings.aLineAboutYouAndYour')"/>
            </label>
            <div class="set-actions">
              <button type="submit" class="btn primary" :disabled="savingProfile">
                {{ savingProfile ? 'Saving…' : 'Save profile' }}
              </button>
              <NuxtLinkLocale v-if="auth.logged?.username" :to="`/creator/${auth.logged.username}`" class="btn">
                <span class="icon icon-user"/><span>{{ $t('p_settings.viewPublicProfile') }}</span>
              </NuxtLinkLocale>
              <!-- The header link that used to do this now points here, so
                   this is the only place outside the command palette that
                   still offers it. -->
              <button type="button" class="btn" @click="auth.logout()">
                <span class="icon icon-x"/><span>{{ $t('common.logOut') }}</span>
              </button>
            </div>
          </form>
        </section>

        <section v-if="auth.isLogged" class="set-section">
          <h2 class="set-section-title">{{ $t('p_settings.password') }}</h2>
          <p v-if="!hasPassword" class="text-xs text-muted" v-html="$t('p_settings.youSignedInWithGoogleSet')"/>
          <form class="set-form" @submit.prevent="savePassword">
            <label v-if="hasPassword" class="set-field">
              <span class="set-label">{{ $t('p_settings.currentPassword') }}</span>
              <input v-model="pw.current" type="password" class="set-input" autocomplete="current-password">
            </label>
            <div class="set-row">
              <label class="set-field">
                <span class="set-label">{{ $t('p_settings.newPassword') }}</span>
                <input v-model="pw.next" type="password" class="set-input" minlength="6" autocomplete="new-password">
              </label>
              <label class="set-field">
                <span class="set-label">{{ $t('p_settings.confirm') }}</span>
                <input v-model="pw.confirm" type="password" class="set-input" autocomplete="new-password">
              </label>
            </div>
            <div class="set-actions">
              <button type="submit" class="btn primary" :disabled="savingPw || !pw.next">
                {{ savingPw ? 'Saving…' : hasPassword ? 'Change password' : 'Set password' }}
              </button>
            </div>
          </form>
        </section>

        <section v-if="auth.isLogged" class="set-section">
          <h2 class="set-section-title">{{ $t('p_settings.links') }}</h2>
          <p class="set-help text-xs">{{ $t('p_settings.whereElseYouPost') }}</p>
          <form class="set-form" @submit.prevent="saveProfile">
            <div class="set-links">
              <!-- Not type="url": the backend adds the scheme, so the field
                   has to accept "artstation.com/you" the way it asks for it.
                   type="url" silently refused to submit the whole form. -->
              <label v-for="l in PROFILE_LINKS" :key="l.key" class="set-field">
                <span class="set-label">{{ l.label }}</span>
                <input
                    v-model="links[l.key]"
                    class="set-input"
                    inputmode="url"
                    autocapitalize="off"
                    spellcheck="false"
                    :placeholder="l.placeholder"
                >
              </label>
            </div>
            <div class="set-actions">
              <button type="submit" class="btn primary" :disabled="savingProfile">
                {{ savingProfile ? $t('common.loading') : $t('p_settings.saveLinks') }}
              </button>
            </div>
          </form>
        </section>

        <section class="set-section">
          <h2 class="set-section-title">{{ $t('p_settings.appearance') }}</h2>
          <div class="set-themes">
            <button
                v-for="t in themes"
                :key="t.id"
                class="set-theme"
                :class="{active: current === t.id}"
                type="button"
                @click="setTheme(t.id)"
            >
              <span class="set-theme-dot" :style="{background: t.colors[0], color: t.colors[2]}">
                <span class="set-theme-ink"/>
              </span>
              <span>{{ $t(t.i18n) }}</span>
              <span v-if="current === t.id" class="icon icon-check"/>
            </button>
          </div>

          <div class="set-field">
            <span class="set-label">{{ $t('p_settings.itemsPerRow') }}</span>
            <div class="settings-row">
              <label class="pill" :class="{active: resultsCols === 'auto'}">
                <input type="radio" value="auto" :checked="resultsCols === 'auto'" @change="setResultsCols('auto')">
                <span>{{ $t('common.auto') }}</span>
              </label>
              <label
                  v-for="n in resultsColOptions"
                  :key="n"
                  class="pill"
                  :class="{active: resultsCols === n}"
              >
                <input type="radio" :value="n" :checked="resultsCols === n" @change="setResultsCols(n)">
                <span>{{ n }}</span>
              </label>
            </div>
            <p class="text-xs text-muted" v-html="$t('p_settings.howManyArtworksEachGalleryRow')"/>
          </div>
        </section>

        <section class="set-section">
          <h2 class="set-section-title">{{ $t('p_settings.appData') }}</h2>
          <p class="text-xs text-muted" v-html="$t('p_settings.localStorageHoldsYourGuestArtwork')"/>
          <div class="set-actions">
            <button class="btn set-danger" @click="resetAppData">
              <span class="icon icon-broom"/><span>{{ $t('p_settings.resetAppData') }}</span>
            </button>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Two per row like .set-row, but for a list of unknown length. */
.set-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.set-panel {
  max-width: 640px;
  margin-inline: auto;
}

.set-head {
  padding: var(--space-3) var(--space-4);
}

.set-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-base);
  font-weight: 700;
}

.set-title .icon {
  color: var(--primary);
}

.set-body {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-5, var(--space-4));
}

.set-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.set-section + .set-section {
  border-top: 1px solid var(--border);
  padding-top: var(--space-4);
}

.set-section-title {
  font-size: var(--text-sm);
  font-weight: 700;
}

.set-signin {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.set-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.set-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.set-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.set-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
}

.set-input {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--background);
  color: var(--foreground);
  font-size: var(--text-sm);
}

.set-input:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.set-textarea {
  resize: vertical;
}

.set-help {
  color: var(--muted);
}

.set-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.set-themes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.set-theme {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--foreground);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.set-theme.active {
  border-color: var(--primary);
}

.set-theme .icon-check {
  margin-left: auto;
  color: var(--primary);
  width: 13px;
  height: 13px;
}

.set-theme-dot {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.set-theme-ink {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-pill);
  background: currentColor;
}

.set-danger {
  color: var(--danger, #dc2626);
  border-color: color-mix(in oklab, var(--danger, #dc2626) 40%, var(--border));
}

@media (max-width: 640px) {
  .set-row,
  .set-themes {
    grid-template-columns: 1fr;
  }
}
</style>
