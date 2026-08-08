<script setup lang="ts">
import {toast} from 'vue-sonner'

// Settings — account (username / display name / bio), password, appearance
// (theme) and local data. Appearance + data work for guests too; account
// sections need a session.
const auth = useAuthStore()
const {current, setTheme, themes} = useTheme() as any

useCustomSeoMeta({
  title: 'Settings - Simple Pixel Art',
  description: 'Manage your account, appearance and app data.',
  canonical: 'https://simplepixelart.com/settings',
  robots: 'noindex, follow',
})

// ── Account ──────────────────────────────────────────────────────────
const form = reactive({username: '', first_name: '', last_name: '', bio: ''})
const savingProfile = ref(false)

function fillForm() {
  const u = auth.logged as any
  if (!u) return
  form.username = u.username || ''
  form.first_name = u.first_name || ''
  form.last_name = u.last_name || ''
  form.bio = u.meta?.bio || ''
}

const PROFILE_ERRORS: Record<string, string> = {
  USERNAME_INVALID: 'Username must be 3–30 letters, numbers, . _ or -',
  USERNAME_DUPLICATE: 'That username is taken',
}

async function saveProfile() {
  if (savingProfile.value) return
  savingProfile.value = true
  try {
    await useNativeFetch('/auth/profile', {method: 'PATCH', body: {...form}})
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

// ── Password ─────────────────────────────────────────────────────────
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
          <span>Settings</span>
        </h1>
      </div>

      <div class="set-body">
        <!-- ── Account ── -->
        <section class="set-section">
          <h2 class="set-section-title">Account</h2>
          <div v-if="!auth.isLogged" class="set-signin">
            <p class="text-xs text-muted">Sign in to manage your username, profile and password.</p>
            <nuxt-link to="/auth" class="btn primary">Sign in</nuxt-link>
          </div>
          <form v-else class="set-form" @submit.prevent="saveProfile">
            <label class="set-field">
              <span class="set-label">Username</span>
              <input v-model="form.username" class="set-input" maxlength="30" autocomplete="username">
              <span class="set-help text-xs">Your public handle — changing it changes your profile URL.</span>
            </label>
            <div class="set-row">
              <label class="set-field">
                <span class="set-label">First name</span>
                <input v-model="form.first_name" class="set-input" maxlength="150" autocomplete="given-name">
              </label>
              <label class="set-field">
                <span class="set-label">Last name</span>
                <input v-model="form.last_name" class="set-input" maxlength="150" autocomplete="family-name">
              </label>
            </div>
            <label class="set-field">
              <span class="set-label">Bio</span>
              <textarea v-model="form.bio" class="set-input set-textarea" maxlength="280" rows="3" placeholder="A line about you and your art"/>
            </label>
            <div class="set-actions">
              <button type="submit" class="btn primary" :disabled="savingProfile">
                {{ savingProfile ? 'Saving…' : 'Save profile' }}
              </button>
              <nuxt-link v-if="auth.logged?.username" :to="`/creator/${auth.logged.username}`" class="btn">
                <span class="icon icon-user"/><span>View public profile</span>
              </nuxt-link>
            </div>
          </form>
        </section>

        <!-- ── Password ── -->
        <section v-if="auth.isLogged" class="set-section">
          <h2 class="set-section-title">Password</h2>
          <p v-if="!hasPassword" class="text-xs text-muted">
            You signed in with Google — set a password to also log in directly.
          </p>
          <form class="set-form" @submit.prevent="savePassword">
            <label v-if="hasPassword" class="set-field">
              <span class="set-label">Current password</span>
              <input v-model="pw.current" type="password" class="set-input" autocomplete="current-password">
            </label>
            <div class="set-row">
              <label class="set-field">
                <span class="set-label">New password</span>
                <input v-model="pw.next" type="password" class="set-input" minlength="6" autocomplete="new-password">
              </label>
              <label class="set-field">
                <span class="set-label">Confirm</span>
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

        <!-- ── Appearance ── -->
        <section class="set-section">
          <h2 class="set-section-title">Appearance</h2>
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
              <span>{{ t.name }}</span>
              <span v-if="current === t.id" class="icon icon-check"/>
            </button>
          </div>
        </section>

        <!-- ── Data ── -->
        <section class="set-section">
          <h2 class="set-section-title">App data</h2>
          <p class="text-xs text-muted">
            Local storage holds your guest artwork, undo history and preferences.
            Reset if the app gets stuck — unsynced guest work is lost, your
            signed-in account is not affected.
          </p>
          <div class="set-actions">
            <button class="btn set-danger" @click="resetAppData">
              <span class="icon icon-broom"/><span>Reset app data</span>
            </button>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
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
  line-height: var(--text-base-lh);
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

/* Theme picker — same swatch language as the command palette. */
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
