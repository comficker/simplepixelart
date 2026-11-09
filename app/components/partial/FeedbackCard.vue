<script setup lang="ts">
import {toast} from 'vue-sonner'

// One tap to rate how it went, an optional note, send -- in the shared modal
// chrome (chips like the tip dialog, fields like the collection editor).
// Mounted once in app.vue and opened through useFeedback(): from the header,
// the command palette, or once after the first export. Goes to the backend
// (read on the ninosaur dashboard); GA only gets the rating and whether a
// note was written, never the note itself.
const {open, trigger} = useFeedback()

const {t, locale} = useI18n()
const route = useRoute()

const RATINGS = ['easy', 'ok', 'hard'] as const
const rating = ref<typeof RATINGS[number] | ''>('')
// "Hard" alone says little; one more tap says where. Kept in the feedback's
// meta (hard_area) so the dashboard can count them.
const HARD_AREAS = ['colors', 'layers', 'mobile', 'finding', 'other'] as const
const hardArea = ref<typeof HARD_AREAS[number] | ''>('')
const text = ref('')
const sending = ref(false)
const sent = ref(false)

watch(open, (v) => {
  if (!v) return
  rating.value = ''
  hardArea.value = ''
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
          trigger: trigger.value,
          route: String(route.name ?? '').split('___')[0],
          platform: window.matchMedia('(pointer: coarse)').matches ? 'web_touch' : 'web',
          locale: locale.value,
          ...(rating.value === 'hard' && hardArea.value ? {hard_area: hardArea.value} : {}),
        },
      },
    })
    track('feedback', {
      rating: rating.value || 'none', has_text: !!text.value.trim(), trigger: trigger.value,
      ...(rating.value === 'hard' && hardArea.value ? {hard_area: hardArea.value} : {}),
    })
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
  <UiModal
      v-if="open"
      :title="trigger === 'export' ? $t('c_Feedback.afterExport') : trigger === 'leave' ? $t('c_Feedback.onLeave') : $t('c_Feedback.general')"
      @close="open = false"
  >
    <p v-if="sent" class="publish-sub">{{ $t('c_Feedback.thanks') }}</p>
    <template v-else>
      <div class="publish-form">
        <div class="onb-chips" role="group" :aria-label="$t('c_Feedback.title')">
          <button
              v-for="r in RATINGS" :key="r"
              type="button"
              class="onb-chip"
              :class="{active: rating === r}"
              :aria-pressed="rating === r"
              @click="rating = rating === r ? '' : r"
          >{{ $t('c_Feedback.' + r) }}</button>
        </div>
        <div v-if="rating === 'hard'">
          <span class="publish-label">{{ $t('c_Feedback.whereHard') }}</span>
          <div class="onb-chips" role="group" :aria-label="$t('c_Feedback.whereHard')">
            <button
                v-for="a in HARD_AREAS" :key="a"
                type="button"
                class="onb-chip"
                :class="{active: hardArea === a}"
                :aria-pressed="hardArea === a"
                @click="hardArea = hardArea === a ? '' : a"
            >{{ $t('c_Feedback.hard_' + a) }}</button>
          </div>
        </div>
        <div>
          <label class="publish-label" for="feedback-note">{{ $t('c_Feedback.note') }}</label>
          <textarea
              id="feedback-note"
              v-model="text"
              rows="3"
              maxlength="2000"
              class="publish-input"
              :placeholder="$t('c_Feedback.notePlaceholder')"
          />
        </div>
      </div>
      <div class="publish-actions">
        <button class="btn block" :disabled="sending" @click="open = false">
          {{ $t('common.cancel') }}
        </button>
        <button class="btn primary block" :disabled="sending || (!rating && !text.trim())" @click="send">
          {{ $t('c_Feedback.send') }}
        </button>
      </div>
    </template>
  </UiModal>
</template>
