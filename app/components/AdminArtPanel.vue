<script setup lang="ts">
import type {SharedPage} from "~/types";
import {toast} from "vue-sonner";

interface Props {
  data: SharedPage
}

const props = defineProps<Props>()
const emit = defineEmits<{
  updated: [data: SharedPage]
  deleted: []
}>()

const open = ref(false)
const busy = ref(false)

const ipFlagged = computed(() => !!(props.data.meta && props.data.meta.ip_flag))
const ipFlagSource = computed(() => (props.data.meta && props.data.meta.ip_flag_source) || null)

const form = reactive({
  name: '',
  desc: '',
  status: 'public' as 'public' | 'pending' | 'draft',
  ip_flag: false,
})

const dirty = computed(() =>
    form.name.trim() !== (props.data.name || '') ||
    form.desc.trim() !== (props.data.desc || '') ||
    form.status !== props.data.status ||
    form.ip_flag !== ipFlagged.value
)

function openPanel() {
  form.name = props.data.name || ''
  form.desc = props.data.desc || ''
  form.status = (props.data.status as any) || 'public'
  form.ip_flag = ipFlagged.value
  open.value = true
}

async function moderate(body: Record<string, any>) {
  if (busy.value) return false
  busy.value = true
  try {
    const res = await useNativeFetch<SharedPage>(
        `/coloring/shared-pages/${props.data.id}/moderate/`,
        {method: 'POST', body}
    )
    emit('updated', res)
    return true
  } catch (e: any) {
    console.error(e)
    toast.error(e?.data?.detail || 'Save failed')
    return false
  } finally {
    busy.value = false
  }
}

async function save() {
  if (!dirty.value) {
    open.value = false
    return
  }
  const body: Record<string, any> = {}
  if (form.name.trim() !== (props.data.name || '')) body.name = form.name.trim()
  if (form.desc.trim() !== (props.data.desc || '')) body.desc = form.desc.trim()
  if (form.status !== props.data.status) body.status = form.status
  if (form.ip_flag !== ipFlagged.value) body.ip_flag = form.ip_flag
  const ok = await moderate(body)
  if (ok) {
    toast.success('Saved')
    open.value = false
  }
}

async function destroy() {
  if (busy.value) return
  if (!confirm(`Delete "${props.data.name || props.data.id_string}" permanently?`)) return
  busy.value = true
  try {
    await useNativeFetch(`/coloring/shared-pages/${props.data.id}/`, {method: 'DELETE'})
    toast.success('Deleted')
    open.value = false
    emit('deleted')
  } catch (e: any) {
    console.error(e)
    toast.error('Delete failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>

  <button type="button" class="admin-trigger" @click="openPanel">
    <span class="admin-trigger-tag">ADMIN</span>
    <span class="icon icon-adjust"/>
    <span>Moderate</span>
  </button>

  <Teleport to="body">
    <div v-if="open" class="share-overlay" @click.self="open = false">
      <div class="admin-modal" role="dialog" aria-modal="true" @keydown.escape="open = false">
        <header class="admin-modal-head">
          <div class="admin-modal-titles">
            <h3 class="admin-modal-title">Moderation</h3>
            <span class="admin-modal-id">id {{ data.id }} · {{ data.id_string }}</span>
          </div>
          <button type="button" class="admin-modal-close" aria-label="Close" @click="open = false">
            <span class="icon icon-x"/>
          </button>
        </header>

        <div class="admin-modal-body">

          <div class="admin-group">
            <span class="admin-group-label">Status</span>
            <div class="admin-seg" role="group" aria-label="Status">
              <button
                  v-for="s in (['public','pending','draft'] as const)"
                  :key="s"
                  type="button"
                  class="admin-seg-btn"
                  :class="[`seg-${s}`, {active: form.status === s}]"
                  :disabled="busy"
                  @click="form.status = s"
              >{{ s }}</button>
            </div>
          </div>

          <div class="admin-group">
            <span class="admin-group-label">IP flag</span>
            <div class="admin-flag">
              <button
                  type="button"
                  class="admin-toggle"
                  :class="{on: form.ip_flag}"
                  role="switch"
                  :aria-checked="form.ip_flag"
                  :disabled="busy"
                  @click="form.ip_flag = !form.ip_flag"
              >
                <span class="admin-toggle-knob"/>
              </button>
              <span class="admin-flag-text" :class="{danger: form.ip_flag}">
                {{ form.ip_flag ? 'Flagged' : 'Clean' }}
                <span v-if="ipFlagSource && form.ip_flag" class="admin-flag-src">· {{ ipFlagSource }}</span>
              </span>
            </div>
          </div>

          <label class="admin-group">
            <span class="admin-group-label">Name</span>
            <input
                v-model="form.name"
                type="text"
                class="admin-input"
                placeholder="Artwork name"
                :disabled="busy"
                @keydown.enter="save"
            />
          </label>

          <label class="admin-group">
            <span class="admin-group-label">Description</span>
            <textarea
                v-model="form.desc"
                rows="4"
                class="admin-input admin-textarea"
                placeholder="Describe this artwork…"
                :disabled="busy"
            />
          </label>
        </div>

        <footer class="admin-modal-foot">
          <button type="button" class="admin-delete" :disabled="busy" @click="destroy">
            <span class="icon icon-trash"/>
            <span>Delete</span>
          </button>
          <div class="admin-foot-right">
            <button type="button" class="btn" :disabled="busy" @click="open = false">Cancel</button>
            <button type="button" class="btn primary" :disabled="busy || !dirty" @click="save">
              <span class="icon icon-check"/>
              <span>{{ busy ? 'Saving…' : 'Save changes' }}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>

.admin-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0.4rem 0.75rem 0.4rem 0.4rem;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground);
  background: var(--surface);
  border: 1px solid color-mix(in oklab, var(--primary) 35%, var(--border));
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease;
}

.admin-trigger:hover {
  background: color-mix(in oklab, var(--primary) 6%, var(--surface));
}

.admin-trigger .icon {
  font-size: 15px;
  color: var(--primary);
}

.admin-trigger-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--primary-foreground, #fff);
  background: var(--primary);
  border-radius: calc(var(--radius-sm) - 1px);
}

.admin-modal {
  display: flex;
  flex-direction: column;
  width: 92%;
  max-width: 460px;
  max-height: 90vh;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
  animation: modalIn 240ms cubic-bezier(.34, 1.56, .64, 1);
}

@keyframes modalIn {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.admin-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0.875rem 1rem;
  background: color-mix(in oklab, var(--primary) 7%, var(--surface));
  border-bottom: 1px solid var(--border);
}

.admin-modal-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.admin-modal-title {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--foreground);
  line-height: 1.1;
}

.admin-modal-id {
  font-size: var(--text-2xs);
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.admin-modal-close:hover {
  background: var(--surface-2);
  color: var(--foreground);
}

.admin-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-5);
  overflow-y: auto;
}

.admin-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.admin-group-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.admin-seg {
  display: inline-flex;
  align-self: flex-start;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.admin-seg-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
  color: var(--muted);
  background: var(--surface);
  border: 0;
  border-right: 1px solid var(--border);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.admin-seg-btn:last-child { border-right: 0; }

.admin-seg-btn:hover:not(:disabled):not(.active) {
  color: var(--foreground);
  background: var(--surface-2);
}

.admin-seg-btn.seg-public.active { color: var(--primary-foreground, #fff); background: var(--primary); }
.admin-seg-btn.seg-pending.active { color: #fff; background: #c47b00; }
.admin-seg-btn.seg-draft.active { color: #fff; background: #6b7280; }
.admin-seg-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.admin-flag {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
}

.admin-toggle {
  position: relative;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}

.admin-toggle.on {
  background: var(--danger);
  border-color: var(--danger);
}

.admin-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-pill);
  background: #fff;
  transition: transform 160ms ease;
}

.admin-toggle.on .admin-toggle-knob {
  transform: translateX(18px);
}

.admin-toggle:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-flag-text {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--foreground);
}

.admin-flag-text.danger { color: var(--danger); }

.admin-flag-src {
  font-weight: 500;
  color: var(--muted);
}

.admin-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  background: var(--background);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--foreground);
  font-family: inherit;
}

.admin-input:focus {
  outline: 2px solid color-mix(in oklab, var(--primary) 35%, transparent);
  outline-offset: 0;
  border-color: var(--primary);
}

.admin-textarea {
  resize: vertical;
  min-height: 84px;
  line-height: 1.5;
}

.admin-modal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0.875rem 1rem;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.admin-foot-right {
  display: flex;
  gap: var(--space-3);
}

.admin-delete {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.4rem 0.625rem;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--danger);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}

.admin-delete:hover:not(:disabled) {
  background: color-mix(in oklab, var(--danger) 10%, transparent);
}

.admin-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
