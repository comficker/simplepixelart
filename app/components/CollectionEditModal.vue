<template>
  <ui-modal :title="isEdit ? 'Edit collection' : 'New collection'" @close="$emit('close')">
    <div class="publish-form">
        <div>
          <label class="publish-label">Title</label>
          <input
              type="text"
              v-model="form.title"
              placeholder="e.g. Retro RPG sprites"
              maxlength="120"
              class="publish-input"
              @keydown.enter="save"
          />
        </div>
        <div>
          <label class="publish-label">Description</label>
          <input
              type="text"
              v-model="form.desc"
              placeholder="Describe your collection..."
              maxlength="200"
              class="publish-input"
          />
        </div>
        <div v-if="isEdit">
          <label class="publish-label">Slug</label>
          <input
              type="text"
              v-model="form.id_string"
              placeholder="custom-url-slug"
              maxlength="200"
              spellcheck="false"
              class="publish-input"
          />
        </div>
        <div class="h-center gap-2">
          <ui-switch :model-value="form.status === 'public'" @update:model-value="form.status = $event ? 'public' : 'private'"/>
          <span class="text-xs">Public</span>
          <span class="text-xs text-muted">{{ form.status === 'public' ? '— anyone with the link' : '— only you' }}</span>
        </div>
      </div>
    <div class="publish-actions">
      <button class="btn primary block" @click="save" :disabled="saving || !form.title.trim()">
        {{ saving ? 'Saving…' : (isEdit ? 'Save' : 'Create') }}
      </button>
      <button class="btn block" @click="$emit('close')" :disabled="saving">
        Cancel
      </button>
    </div>
  </ui-modal>
</template>

<script setup lang="ts">
import {toast} from 'vue-sonner'

type CollectionLike = {
  id?: number
  title?: string
  name?: string
  desc?: string
  status?: string
  id_string?: string
}

// No `collection` → create mode (POST); with one → edit mode (PATCH).
const props = defineProps<{ collection?: CollectionLike }>()
const emit = defineEmits<{ close: []; updated: [collection: CollectionLike]; created: [collection: CollectionLike] }>()

const isEdit = computed(() => !!props.collection?.id)

const form = ref({
  title: props.collection?.title || props.collection?.name || '',
  desc: props.collection?.desc || '',
  status: (props.collection?.status === 'private' ? 'private' : 'public') as 'public' | 'private',
  id_string: props.collection?.id_string || '',
})
const saving = ref(false)

async function save() {
  const title = form.value.title.trim()
  if (!title) {
    toast.error('Title is required')
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      const slug = form.value.id_string.trim()
      const updated = await useNativeFetch<CollectionLike>(
          `/coloring/collections/${props.collection!.id}/`,
          {
            method: 'PATCH',
            body: {
              title,
              desc: form.value.desc,
              status: form.value.status,
              name: title,
              // Only send when set — the backend re-slugs it (empty would wipe it).
              ...(slug ? {id_string: slug} : {}),
            },
          },
      )
      toast.success('Collection updated')
      emit('updated', updated)
    } else {
      const created = await useNativeFetch<CollectionLike>('/coloring/collections/', {
        method: 'POST',
        body: {
          title,
          desc: form.value.desc,
          status: form.value.status,
          name: title,
          type: 'saved',
        },
      })
      toast.success('Collection created')
      emit('created', created)
    }
  } catch {
    toast.error('Save failed')
  } finally {
    saving.value = false
  }
}
</script>

