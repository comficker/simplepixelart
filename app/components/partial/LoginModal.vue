<script setup lang="ts">
import {toast} from 'vue-sonner'

const emit = defineEmits<{ close: []; success: [] }>()

const {t} = useI18n()
const auth = useAuthStore()
const editor = useEditor()
const googleAuthUrl = useGoogleAuthUrl()

const mode = ref<'login' | 'register'>('login')
const form = reactive({username: '', email: '', password: '', repeat: ''})
const reveal = ref(false)
const busy = ref(false)

const isRegister = computed(() => mode.value === 'register')

// The backend answers both endpoints with a list of uppercase codes. Anything
// not listed here is a server-side problem, not something the player can fix,
// so it falls back to the generic line.
const ERRORS: Record<string, string> = {
  LOGIN_INFO_WRONG: t('c_LoginModal.wrongUsernameOrPassword'),
  USERNAME_BLANK: t('c_LoginModal.pickAUsername'),
  USERNAME_INVALID: t('c_LoginModal.usernameInvalid'),
  USERNAME_DUPLICATE: t('c_LoginModal.usernameTaken'),
  PASSWORD_TOO_SHORT: t('c_LoginModal.passwordTooShort'),
  EMAIL_INVALID: t('c_LoginModal.emailInvalid'),
  EMAIL_DUPLICATE: t('c_LoginModal.emailTaken'),
}

function switchMode() {
  mode.value = isRegister.value ? 'login' : 'register'
  form.repeat = ''
}

async function submit() {
  if (busy.value) return
  if (isRegister.value && form.password !== form.repeat) {
    toast.error(t('c_LoginModal.passwordsDoNotMatch'))
    return
  }
  busy.value = true
  try {
    await auth.loginLocal(
        form.username.trim(), form.password, mode.value,
        isRegister.value ? form.email.trim() : undefined,
    )
    // Same tail as the OAuth callback: local work goes to the cloud and a
    // pending referral is claimed. Skipping it here would make signing in
    // with a password quietly lose the drawings Google sign-in keeps.
    try { await editor.syncLocalToCloud() } catch {}
    await attachPendingReferral()
    toast.success(t('c_LoginModal.signedIn'))
    emit('success')
    emit('close')
  } catch (e: any) {
    const codes: string[] = e?.response?._data?.messages || e?.data?.messages || []
    toast.error(ERRORS[codes[0]] || t('c_LoginModal.couldNotSignIn'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiModal
      :title="isRegister ? $t('c_LoginModal.createAnAccount') : $t('c_LoginModal.loginToShare')"
      :sub="$t('c_PXEditor.signInToPublishAndShare')"
      @close="emit('close')"
  >
    <div class="share-stack login-stack">
      <a :href="googleAuthUrl" class="btn secondary wide">
        <span class="icon icon-social"/>
        <span>{{ $t('c_PXEditor.loginWithGoogle') }}</span>
      </a>

      <form class="publish-form login-form" @submit.prevent="submit">
        <div>
          <label class="publish-label" for="login-username">
            {{ isRegister ? $t('p_settings.username') : $t('c_LoginModal.usernameOrEmail') }}
          </label>
          <input
              id="login-username"
              v-model="form.username"
              class="publish-input"
              :autocomplete="isRegister ? 'username' : 'username email'"
              autocapitalize="off"
              spellcheck="false"
              required
          >
        </div>

        <div v-if="isRegister">
          <label class="publish-label" for="login-email">{{ $t('c_LoginModal.emailOptional') }}</label>
          <input
              id="login-email"
              v-model="form.email"
              type="email"
              class="publish-input"
              autocomplete="email"
              autocapitalize="off"
              spellcheck="false"
          >
        </div>

        <div>
          <label class="publish-label" for="login-password">{{ $t('p_settings.password') }}</label>
          <!-- The eye sits inside the field's box rather than beside it, so
               the input keeps the full width the other fields have. -->
          <div class="login-reveal">
            <input
                id="login-password"
                v-model="form.password"
                :type="reveal ? 'text' : 'password'"
                class="publish-input"
                :autocomplete="isRegister ? 'new-password' : 'current-password'"
                :minlength="isRegister ? 8 : undefined"
                required
            >
            <button
                type="button"
                class="login-reveal-btn"
                :aria-label="reveal ? $t('c_LoginModal.hidePassword') : $t('c_LoginModal.showPassword')"
                :title="reveal ? $t('c_LoginModal.hidePassword') : $t('c_LoginModal.showPassword')"
                :aria-pressed="reveal"
                @click="reveal = !reveal"
            >
              <span class="icon" :class="reveal ? 'icon-eye-cross' : 'icon-eye'"/>
            </button>
          </div>
        </div>

        <div v-if="isRegister">
          <label class="publish-label" for="login-repeat">{{ $t('c_LoginModal.repeatPassword') }}</label>
          <input
              id="login-repeat"
              v-model="form.repeat"
              :type="reveal ? 'text' : 'password'"
              class="publish-input"
              autocomplete="new-password"
              minlength="8"
              required
          >
        </div>

        <button class="btn primary wide login-submit" type="submit" :disabled="busy">
          {{ busy ? $t('common.loading') : (isRegister ? $t('c_LoginModal.createAccount') : $t('common.signIn')) }}
        </button>
      </form>

      <button class="share-dismiss" type="button" @click="switchMode">
        {{ isRegister ? $t('c_LoginModal.alreadyHaveAnAccount') : $t('c_LoginModal.noAccountCreateOne') }}
      </button>
    </div>
  </UiModal>
</template>

<style scoped>
/* One rhythm for the whole modal: a label sits tight to its own field, the
   fields sit a step apart, and everything that is not a field -- the
   description above, Google, the submit, the mode switch -- gets the wider
   step, so the form reads as one block. */
.login-stack {
  /* UiModal's description ends on margin-bottom:0 (the publish modal it was
     written for supplies its own leading), so without this the text sits
     flush on the button below it. */
  margin-top: var(--space-5);
  gap: var(--space-5);
}

.login-form {
  gap: var(--space-3);
}

.login-submit {
  margin-top: var(--space-2);
}

/* The stack gap already spaces it; its own margin only made this one step
   wider than every other. */
.login-stack .share-dismiss {
  margin-top: 0;
}

.login-reveal {
  position: relative;
}

.login-reveal .publish-input {
  padding-right: 2.25rem;
}

.login-reveal-btn {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 0 0.625rem;
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.login-reveal-btn .icon {
  width: 15px;
  height: 15px;
}

@media (hover: hover) and (pointer: fine) {
  .login-reveal-btn:hover {
    color: var(--foreground);
  }
}
</style>
