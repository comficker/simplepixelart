<script setup lang="ts">
import type {APIResponse, EditorData, SharedPage} from "~/types";
import {getStorageItem, sharedPage2EditorData} from "~/helper/utils";

const auth = useAuthStore()
const workspaces = ref<EditorData[]>([])

async function fetchData() {
  if (auth.logged?.id) {
    const res = await useNativeFetch<APIResponse<SharedPage>>(`/coloring/shared-pages/`, {
      params: {
        user: auth.logged.username,
        full_schema: true,
        page_size: 32,
        is_template: true
      }
    })
    workspaces.value = res.results.map(x => sharedPage2EditorData(x))
  } else {
    workspaces.value = Object.values(getStorageItem('workspaces'))
  }
}

async function destroy(item: EditorData) {
  const currentId = localStorage.getItem('workspace_current')

  if (auth.isLogged) {
    await useNativeFetch<APIResponse<SharedPage>>(`/coloring/shared-pages/${item.id}/`, {
      method: "DELETE",
    })
  } else {
    const data = getStorageItem('workspaces')
    delete data[item.id]
    localStorage.setItem('workspaces', JSON.stringify(data))
  }
  if (currentId === item.id.toString()) {
    localStorage.setItem('workspace_current', "")
  }
  await fetchData()
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <Widget v-if="workspaces.length" title="Current Work">
    <div class="results">
      <div v-for="item in workspaces" class="card">
        <div class="square">
          <nuxt-link class="inside p-2" :to="`/editor?id=${item.id}`">
            <Thumb :data="item"/>
          </nuxt-link>
          <div class="absolute bottom-2 right-2 cursor-pointer" @click="destroy(item)">
            <span class="icon icon-trash"/>
          </div>
        </div>
      </div>
    </div>
  </Widget>
</template>