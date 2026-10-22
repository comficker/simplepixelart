<script setup lang="ts">
import {toast} from 'vue-sonner'

// A small corner card, never a modal: one tap to rate how it went, an
// optional note, send. Opened by the editor after the first export and from
// its toolbar. Goes to the backend (read on the ninosaur dashboard); GA only
// gets the rating and whether a note was written, never the note itself.
const props = defineProps<{ trigger: 'export' | 'menu' }>()
const open = defineModel<boolean>({required: true})

const {t, locale} = useI18n()
const route = useRoute()

const RATINGS = ['easy', 'ok', 'hard'] as const
const rating = ref<typeof RATINGS[number] | ''>('')
const text = ref('')
const sending = ref(false)
const sent = ref(false)

watch(open, (v) => {
  if (!v) return
  rating.value = ''
  text.value = ''
  sent.value = false
})

async function send() {
  if (sending.value || (!rating.value && !text.value.trim())) return
  sending.value = true
  try {
    await useNativeFetch('/coloring/feedback/', {
      method: 'POST',
      body: {
        rating: rating.value,
        text: text.value.trim(),
        context: {
          trigger: props.trigger,
          route: String(route.name ?? '').split('___')[0],
          platform: window.matchMedia('(pointer: coarse)').matches ? 'web_touch' : 'web',
          locale: locale.value,
        },
      },
    })
    track('feedback', {rating: rating.value || 'none', has_text: !!text.value.trim(), trigger: props.trigger})
    sent.value = true
    setTimeout(() => { open.value = false }, 1600)
  } catch (e) {
    track('feedback_failed', {reason: failReason(e)})
    toast.error(t('c_Feedback.sendFailed'))
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <aside v-if="open" class="feedback-card" role="dialog" :aria-label="$t('c_Feedback.title')">
      <button class="feedback-close" :aria-label="$t('common.close')" @click="open = false">
        <span class="icon icon-close"/>
      </button>
      <p v-if="sent" class="feedback-thanks">{{ $t('c_Feedback.thanks') }}</p>
      <template v-else>
        <p class="feedback-question">{{ trigger === 'export' ? $t('c_Feedback.afterExport') : $t('c_Feedback.general') }}</p>
        <div class="feedback-ratings" role="radiogroup">
          <button
              v-for="r in RATINGS" :key="r"
              class="btn" :class="{primary: rating === r}"
              role="radio" :aria-checked="rating === r"
              @click="rating = rating === r ? '' : r"
          >{{ $t('c_Feedback.' + r) }}</button>
        </div>
        <textarea v-model="text" rows="3" maxlength="2000" :placeholder="$t('c_Feedback.notePlaceholder')"/>
        <button class="btn primary feedback-send" :disabled="sending || (!rating && !text.trim())" @click="send">
          {{ $t('c_Feedback.send') }}
        </button>
      </template>
    </aside>
  </Teleport>
</template>

<style scoped>
/* Teleported out of the editor, so every token keeps a fallback. */
.feedback-card {
  position: fixed;
  left: var(--space-4, 1rem);
  bottom: var(--space-4, 1rem);
  z-index: 50;
  width: min(calc(100vw - 2 * var(--space-4, 1rem)), calc(var(--space-6, 1.5rem) * 13));
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 0.75rem);
  padding: var(--space-4, 1rem);
  background: var(--surface, #fff);
  color: var(--foreground, #1c1a17);
  border: 1px solid var(--border, rgba(0, 0, 0, .12));
  border-radius: var(--radius, 6px);
  box-shadow: var(--shadow-modal, 0 8px 24px -12px rgba(0, 0, 0, .22));
}

.feedback-close {
  position: absolute;
  top: var(--space-2, 0.5rem);
  right: var(--space-2, 0.5rem);
  display: flex;
  padding: var(--space-1, 0.25rem);
  color: var(--muted, #6a655b);
}

.feedback-question,
.feedback-thanks {
  margin: 0;
  padding-right: var(--space-6, 1.5rem);
  font-size: var(--text-sm, 0.875rem);
  font-weight: 600;
}

.feedback-ratings {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2, 0.5rem);
}

.feedback-ratings .btn {
  justify-content: center;
}

.feedback-card textarea {
  width: 100%;
  resize: vertical;
  font-size: var(--text-sm, 0.875rem);
}

.feedback-send {
  align-self: flex-end;
}
</style>
