<script setup lang="ts">
import {toast} from "vue-sonner";

/* Give an artist some of your credits, from their art page or their
   profile. `page` is the piece the tip is for, when there is one. */
const props = defineProps<{ username: string; page?: string }>()

const AMOUNTS = [5, 10, 25, 50]

const {t} = useI18n()
const auth = useAuthStore()
const loginModal = useLoginModal()
const {balance, setBalance} = useCredits()

const open = ref(false)
const amount = ref(10)
const busy = ref(false)

async function show() {
  if (!auth.isLogged) { loginModal.show(show); return }
  open.value = true
  try {
    const res = await useNativeFetch<{ balance?: number }>('/coloring/economy/')
    setBalance(res.balance)
  } catch { /* the wallet line just stays as it was */ }
}

const ERRORS: Record<string, string> = {
  INSUFFICIENT_CREDITS: 'c_TipButton.notEnough',
  TIP_DAILY_LIMIT: 'c_TipButton.dailyLimit',
}

async function send() {
  if (busy.value) return
  busy.value = true
  try {
    const res = await useNativeFetch<{ sent: number; balance: number }>(
        `/coloring/creators/${encodeURIComponent(props.username)}/tip/`,
        {method: 'POST', body: {amount: amount.value, page: props.page}},
    )
    setBalance(res.balance)
    open.value = false
    toast.success(t('c_TipButton.sent', {n: res.sent, who: `@${props.username}`}))
  } catch (e: any) {
    const code = e?.response?._data?.[0] || e?.data?.[0]
    toast.error(t(ERRORS[code] || 'c_TipButton.couldNotSend'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <button type="button" class="btn secondary" :title="$t('c_TipButton.tipTitle', {who: `@${username}`})" @click="show">
    <span class="icon icon-gift"/>
    <span>{{ $t('c_TipButton.tip') }}</span>
  </button>
  <UiModal
      v-if="open"
      :title="$t('c_TipButton.tipTitle', {who: `@${username}`})"
      :sub="$t('c_TipButton.sub')"
      @close="open = false"
  >
    <div class="onb-chips" role="group" :aria-label="$t('c_TipButton.amount')">
      <button
          v-for="n in AMOUNTS"
          :key="n"
          type="button"
          class="onb-chip"
          :class="{active: amount === n}"
          :aria-pressed="amount === n"
          :disabled="balance !== null && n > balance"
          @click="amount = n"
      >{{ n }}</button>
    </div>
    <p v-if="balance !== null" class="publish-sub tip-wallet">{{ $t('c_TipButton.youHave', {n: balance}) }}</p>
    <button type="button" class="btn primary tip-send" :disabled="busy || (balance !== null && amount > balance)" @click="send">
      <span class="icon icon-gift"/>
      <span>{{ $t('c_TipButton.send', {n: amount}) }}</span>
    </button>
  </UiModal>
</template>

<style scoped>
.tip-wallet {
  margin: var(--space-3) 0 0;
}

.tip-send {
  width: 100%;
  justify-content: center;
  margin-top: var(--space-4);
}

.onb-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
