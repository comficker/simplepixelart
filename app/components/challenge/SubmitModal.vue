<script setup lang="ts">
const localePath = useLocalePath()
const artImage = useArtImage()
import {toast} from 'vue-sonner'
import type {LoadItem} from '~/components/editor/LoadBrowser.vue'

const props = defineProps<{ challenge: string }>()
const emit = defineEmits<{ close: []; submitted: [] }>()

const auth = useAuthStore()
const items = ref<LoadItem[]>([])
const loading = ref(false)
const posting = ref(false)

async function load() {
  if (!auth.logged?.username) return
  loading.value = true
  try {
    const res = await useNativeFetch<{ results: any[] }>('/coloring/shared-pages/', {
      params: {user: auth.logged.username, page_size: 100, ordering: '-updated', is_tile: false},
    })
    items.value = (res.results || []).filter(r => r?.id_string).map(r => ({
      id: r.id_string,
      name: r.name || r.id_string,
      previewImgs: [artImage(r)],
      status: r.status,
      updated: r.updated,
    }))
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

async function pick(id: string) {
  if (posting.value) return
  posting.value = true
  try {
    await useNativeFetch(`/coloring/challenges/${props.challenge}/submit/`, {
      method: 'POST', body: {page_id_string: id},
    })
    const it = items.value.find(i => i.id === id)
    if (it && it.status !== 'public') {
      toast.info('Submitted — make it public so it shows in the entries')
    } else {
      toast.success('Entry submitted!')
    }
    emit('submitted')
    emit('close')
  } catch {
    toast.error('Could not submit that art')
  } finally {
    posting.value = false
  }
}

onMounted(load)
</script>

<template>
  <EditorLoadBrowser
      :title="$t('c_SubmitModal.submitAnArtToThisChallenge')"
      :items="items"
      :loading="loading"
      empty-text="You have no saved arts yet — draw one first."
      filterable
      new-label="New canvas"
      @select="pick"
      @create="navigateTo(localePath('/editor?new=true'))"
      @close="emit('close')"
  />
</template>
