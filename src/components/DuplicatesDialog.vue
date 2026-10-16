<template>
  <oc-modal
    :title="modalTitle"
    :button-cancel-text="cancelLabel"
    :button-confirm-text="state === 'preview' ? confirmLabel : mergeAllLabel"
    :button-confirm-disabled="merging || mergingAll || (state === 'list' && !hasAnyMergeable)"
    :size="'large'"
    @cancel="onCancel"
    @confirm="onConfirm"
  >
    <template #content>

      <!-- LIST -->
      <template v-if="state === 'list'">
        <p v-if="localGroups.length === 0" class="no-duplicates">
          {{ $gettext('No duplicate contacts found.') }}
        </p>
        <template v-else>
          <p class="duplicates-summary">
            {{ $gettext('%{n} group(s) of duplicate contacts found.', { n: localGroups.length }) }}
          </p>
          <div v-for="group in localGroups" :key="group.key" class="duplicate-group">
            <h3 class="group-name">{{ group.contacts[0].displayName }}</h3>
            <table class="dup-table">
              <thead>
                <tr>
                  <th class="col-check"></th>
                  <th>{{ $gettext('Name') }}</th>
                  <th>{{ $gettext('Organisation') }}</th>
                  <th>{{ $gettext('Email') }}</th>
                  <th>{{ $gettext('Phone') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="contact in group.contacts" :key="contact.uid">
                  <td class="col-check">
                    <input
                      type="checkbox"
                      :checked="isChecked(group.key, contact.uid)"
                      @change="toggleCheck(group.key, contact.uid)"
                    />
                  </td>
                  <td>{{ contact.displayName }}</td>
                  <td>{{ contact.organization ?? '–' }}</td>
                  <td>{{ contact.emails[0]?.value ?? '–' }}</td>
                  <td>{{ contact.phones[0]?.value ?? '–' }}</td>
                </tr>
              </tbody>
            </table>
            <div class="group-actions">
              <oc-button
                appearance="filled"
                :disabled="checkedCount(group.key) < 2"
                @click="startMerge(group)"
              >
                {{ $gettext('Merge %{n} contacts', { n: checkedCount(group.key) }) }}
              </oc-button>
            </div>
          </div>
        </template>
      </template>

      <!-- CONFIRM ALL -->
      <template v-else-if="state === 'confirm-all'">
        <p>
          {{
            $gettext(
              'This will merge %{n} group(s) of duplicate contacts. This cannot be undone.',
              { n: localGroups.filter((g) => checkedCount(g.key) >= 2).length }
            )
          }}
        </p>
        <p v-if="mergeError" class="merge-error">{{ mergeError }}</p>
      </template>

      <!-- PREVIEW -->
      <template v-else-if="state === 'preview' && previewMerged">
        <p class="preview-intro">
          {{ $gettext('The following %{n} contacts will be merged into one:', { n: previewSelected.length }) }}
        </p>
        <ul class="preview-sources">
          <li v-for="c in previewSelected" :key="c.uid">{{ c.displayName }}</li>
        </ul>

        <h3 class="preview-result-label">{{ $gettext('Result') }}</h3>
        <table class="preview-table">
          <tbody>
            <tr>
              <td class="field-key">{{ $gettext('Name') }}</td>
              <td>{{ previewMerged.displayName }}</td>
            </tr>
            <tr v-if="previewMerged.organization">
              <td class="field-key">{{ $gettext('Organisation') }}</td>
              <td>{{ previewMerged.organization }}</td>
            </tr>
            <tr v-if="previewMerged.title">
              <td class="field-key">{{ $gettext('Title') }}</td>
              <td>{{ previewMerged.title }}</td>
            </tr>
            <tr v-if="previewMerged.emails.length">
              <td class="field-key">{{ $gettext('Emails') }}</td>
              <td>{{ previewMerged.emails.map((e) => e.value).join(', ') }}</td>
            </tr>
            <tr v-if="previewMerged.phones.length">
              <td class="field-key">{{ $gettext('Phones') }}</td>
              <td>{{ previewMerged.phones.map((p) => p.value).join(', ') }}</td>
            </tr>
            <tr v-if="previewMerged.categories?.length">
              <td class="field-key">{{ $gettext('Groups') }}</td>
              <td>{{ previewMerged.categories.join(', ') }}</td>
            </tr>
            <tr v-if="previewMerged.photoUrl">
              <td class="field-key">{{ $gettext('Photo') }}</td>
              <td>{{ $gettext('Yes') }}</td>
            </tr>
            <tr v-if="previewMerged.note">
              <td class="field-key">{{ $gettext('Note') }}</td>
              <td class="note-cell">{{ previewMerged.note }}</td>
            </tr>
          </tbody>
        </table>

        <p v-if="mergeError" class="merge-error">{{ mergeError }}</p>
      </template>

    </template>
  </oc-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useGettext } from 'vue3-gettext'
import { useCardDAV } from '../composables/useCardDAV'
import { contactToVCard } from '../utils/vcard-builder'
import { mergeContacts } from '../utils/duplicates'
import type { DuplicateGroup } from '../utils/duplicates'
import type { Contact } from '../types/contact'

const props = defineProps<{ groups: DuplicateGroup[] }>()
const emit = defineEmits<{ close: []; merged: [] }>()

const { $gettext } = useGettext()
const { updateContact, deleteContactEntry } = useCardDAV()

// Keep a local mutable copy so we can remove merged groups without closing
const localGroups = ref<DuplicateGroup[]>([])

watch(() => props.groups, (g) => { localGroups.value = [...g] }, { immediate: true })

// ---- Checkbox state ----
const checkedByGroup = ref(new Map<string, Set<string>>())

function initChecked() {
  const map = new Map<string, Set<string>>()
  for (const group of props.groups) {
    map.set(group.key, new Set(group.contacts.map((c) => c.uid)))
  }
  checkedByGroup.value = map
}
onMounted(initChecked)
watch(() => props.groups, initChecked)

function isChecked(groupKey: string, uid: string): boolean {
  return checkedByGroup.value.get(groupKey)?.has(uid) ?? false
}

function toggleCheck(groupKey: string, uid: string) {
  const set = checkedByGroup.value.get(groupKey)
  if (!set) return
  if (set.has(uid)) {
    set.delete(uid)
  } else {
    set.add(uid)
  }
  checkedByGroup.value = new Map(checkedByGroup.value)
}

function checkedCount(groupKey: string): number {
  return checkedByGroup.value.get(groupKey)?.size ?? 0
}

function checkedContacts(group: DuplicateGroup): Contact[] {
  const checked = checkedByGroup.value.get(group.key)
  if (!checked) return []
  return group.contacts.filter((c) => checked.has(c.uid))
}

// ---- State machine ----
type State = 'list' | 'confirm-all' | 'preview'
const state = ref<State>('list')
const previewSelected = ref<Contact[]>([])
const previewMerged = ref<Contact | null>(null)
const merging = ref(false)
const mergingAll = ref(false)
const mergeError = ref<string | null>(null)

const hasAnyMergeable = computed(() =>
  localGroups.value.some((g) => checkedCount(g.key) >= 2)
)

const modalTitle = computed(() => {
  if (state.value === 'preview') return $gettext('Merge contacts - Preview')
  if (state.value === 'confirm-all') return $gettext('Merge all duplicates')
  return $gettext('Duplicate contacts')
})
const cancelLabel = computed(() =>
  state.value === 'list' ? $gettext('Close') : $gettext('Back')
)
const confirmLabel = computed(() =>
  merging.value ? $gettext('Merging…') : $gettext('Confirm merge')
)
const mergeAllLabel = computed(() => {
  if (state.value === 'confirm-all') return mergingAll.value ? $gettext('Merging…') : $gettext('Merge all')
  return $gettext('Merge all')
})

function startMerge(group: DuplicateGroup) {
  const selected = checkedContacts(group)
  if (selected.length < 2) return
  previewSelected.value = selected
  previewMerged.value = mergeContacts(selected)
  mergeError.value = null
  state.value = 'preview'
}

function onCancel() {
  if (state.value === 'preview' || state.value === 'confirm-all') {
    state.value = 'list'
  } else {
    emit('close')
  }
}

async function mergeAll() {
  mergingAll.value = true
  mergeError.value = null
  try {
    for (const group of [...localGroups.value]) {
      const selected = checkedContacts(group)
      if (selected.length < 2) continue
      const merged = mergeContacts(selected)
      if (!merged.href) continue
      await updateContact(merged.href, contactToVCard(merged))
      await Promise.all(
        selected
          .filter((c) => c.uid !== merged.uid && c.href)
          .map((c) => deleteContactEntry(c.href!))
      )
      localGroups.value = localGroups.value.filter((g) => g.key !== group.key)
    }
    emit('merged')
  } catch (err) {
    mergeError.value = err instanceof Error ? err.message : String(err)
  } finally {
    mergingAll.value = false
  }
}

async function onConfirm() {
  if (state.value === 'list') { state.value = 'confirm-all'; return }
  if (state.value === 'confirm-all') { mergeAll(); return }
  if (state.value !== 'preview' || !previewMerged.value) return
  merging.value = true
  mergeError.value = null
  try {
    const merged = previewMerged.value
    const toDelete = previewSelected.value.filter((c) => c.uid !== merged.uid)

    // Update base contact with merged data
    if (!merged.href) throw new Error('Base contact has no href')
    await updateContact(merged.href, contactToVCard(merged))

    // Delete the duplicates
    await Promise.all(
      toDelete
        .filter((c) => c.href)
        .map((c) => deleteContactEntry(c.href!))
    )

    // Remove the merged group from the local list
    const mergedUids = new Set(previewSelected.value.map((c) => c.uid))
    localGroups.value = localGroups.value.filter((g) => {
      const overlap = g.contacts.some((c) => mergedUids.has(c.uid))
      return !overlap
    })

    emit('merged')
    state.value = 'list'
  } catch (err) {
    mergeError.value = err instanceof Error ? err.message : String(err)
  } finally {
    merging.value = false
  }
}
</script>

<style scoped>
.no-duplicates {
  color: var(--oc-color-text-muted);
  text-align: center;
  padding: 2rem 0;
}

.duplicates-summary {
  margin-bottom: 1.25rem;
  font-size: 0.9rem;
  color: var(--oc-color-text-muted);
}

.duplicate-group {
  margin-bottom: 1.5rem;
  border: 1px solid var(--oc-color-border);
  border-radius: 0.5rem;
  overflow: hidden;
}

.group-name {
  margin: 0;
  padding: 0.5rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  background: var(--oc-color-background-highlight);
  border-bottom: 1px solid var(--oc-color-border);
}

.group-actions {
  padding: 0.6rem 1rem;
  background: var(--oc-color-background-default);
  border-top: 1px solid var(--oc-color-border);
  display: flex;
  justify-content: flex-end;
}

.dup-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.dup-table th {
  padding: 0.45rem 1rem;
  text-align: left;
  font-weight: 600;
  color: var(--oc-color-text-muted);
  border-bottom: 1px solid var(--oc-color-border);
}

.dup-table td {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--oc-color-border);
  vertical-align: middle;
}

.dup-table tr:last-child td {
  border-bottom: none;
}

.col-check {
  width: 2.5rem;
  text-align: center;
}

/* ---- Preview ---- */
.preview-intro {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.preview-sources {
  margin: 0 0 1.25rem 1.25rem;
  font-size: 0.875rem;
  color: var(--oc-color-text-muted);
}

.preview-result-label {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  border: 1px solid var(--oc-color-border);
  border-radius: 0.5rem;
  overflow: hidden;
}

.preview-table td {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--oc-color-border);
  vertical-align: top;
}

.preview-table tr:last-child td {
  border-bottom: none;
}

.field-key {
  width: 8rem;
  font-weight: 600;
  color: var(--oc-color-text-muted);
  white-space: nowrap;
}

.note-cell {
  white-space: pre-wrap;
  max-height: 6rem;
  overflow: auto;
}

.merge-error {
  margin-top: 1rem;
  color: var(--oc-color-swatch-danger-default);
  font-size: 0.875rem;
}
</style>
