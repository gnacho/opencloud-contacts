<template>
  <oc-modal
    :title="$gettext('Import contacts')"
    :button-cancel-text="done ? $gettext('Close') : $gettext('Cancel')"
    :button-confirm-text="importing ? $gettext('Importing…') : $gettext('Import')"
    :button-confirm-disabled="!parsedContacts.length || importing || done"
    @cancel="onClose"
    @confirm="startImport"
  >
    <template #content>
      <!-- Import options (always visible before import) -->
      <div v-if="!importing" class="import-options">
        <label class="import-option-label">{{ $gettext('Default group for contacts without a group') }}</label>
        <datalist id="known-groups-import">
          <option v-for="g in knownGroups" :key="g" :value="g" />
        </datalist>
        <input
          v-model="defaultGroup"
          type="text"
          list="known-groups-import"
          class="oc-text-input"
          :placeholder="$gettext('Group name (leave empty to skip)')"
        />
      </div>

      <!-- File picker -->
      <div v-if="!parsedContacts.length" class="import-drop" @dragover.prevent @drop.prevent="onDrop">
        <oc-icon name="upload" size="xlarge" color="var(--oc-color-text-muted)" />
        <p>{{ $gettext('Drag a Thunderbird CSV file here or') }}</p>
        <oc-button @click="fileInput?.click()">{{ $gettext('Select file') }}</oc-button>
        <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden-input" @change="onFileChange" />
      </div>

      <!-- Preview -->
      <div v-else class="import-preview">
        <p class="import-summary">
          {{ $gettext('%{count} contacts found in file', { count: parsedContacts.length }) }}
        </p>

        <!-- Progress during import -->
        <div v-if="importing" class="import-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
          </div>
          <p class="progress-label">{{ doneCount }} / {{ parsedContacts.length }}</p>
        </div>

        <!-- Errors -->
        <div v-if="errors.length" class="import-errors">
          <p class="import-errors-title">{{ $gettext('Errors:') }}</p>
          <ul>
            <li v-for="(e, i) in errors" :key="i">{{ e }}</li>
          </ul>
        </div>

        <!-- Preview table -->
        <div v-if="!importing" class="import-table-wrap">
          <table class="import-table">
            <thead>
              <tr>
                <th>{{ $gettext('Name') }}</th>
                <th>{{ $gettext('Email') }}</th>
                <th>{{ $gettext('Organisation') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, i) in parsedContacts.slice(0, 10)" :key="i">
                <td>{{ displayName(c) }}</td>
                <td>{{ c.email1 || '–' }}</td>
                <td>{{ c.organization || '–' }}</td>
              </tr>
              <tr v-if="parsedContacts.length > 10">
                <td colspan="3" class="import-more">
                  {{ $gettext('… and %{n} more', { n: parsedContacts.length - 10 }) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Done state -->
      <div v-if="done" class="import-done">
        <oc-icon name="checkbox-circle" size="xlarge" color="var(--oc-color-swatch-success-default)" />
        <p>{{ $gettext('Import completed: %{ok} imported, %{err} errors', { ok: doneCount - errors.length, err: errors.length }) }}</p>
      </div>
    </template>
  </oc-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGettext } from 'vue3-gettext'
import { parseThunderbirdCSV, csvContactToVCard, type CsvContact } from '../utils/csv-importer'
import { useCardDAV } from '../composables/useCardDAV'
import { useContactStore } from '../composables/useContactStore'

const emit = defineEmits<{ (e: 'close'): void; (e: 'done'): void }>()

const { $gettext } = useGettext()
const { putContactsBatch } = useCardDAV()
const { knownGroups } = useContactStore()

const fileInput = ref<HTMLInputElement | null>(null)
const parsedContacts = ref<CsvContact[]>([])
const importing = ref(false)
const done = ref(false)
const doneCount = ref(0)
const errors = ref<string[]>([])
const defaultGroup = ref('Alle')

const progressPercent = computed(() =>
  parsedContacts.value.length ? Math.round((doneCount.value / parsedContacts.value.length) * 100) : 0
)

function displayName(c: CsvContact): string {
  return c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email1 || '?'
}

function loadFile(file: File) {
  const reader = new FileReader()
  reader.onerror = () => {
    errors.value = [$gettext('Could not read file.')]
  }
  reader.onload = (e) => {
    const text = e.target?.result as string
    try {
      parsedContacts.value = parseThunderbirdCSV(text)
    } catch (err) {
      errors.value = [err instanceof Error ? err.message : $gettext('Could not parse CSV file.')]
      parsedContacts.value = []
      return
    }
    errors.value = []
    done.value = false
    doneCount.value = 0
  }
  reader.readAsText(file, 'utf-8')
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) loadFile(file)
}

function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0]
  if (file) loadFile(file)
}

function onClose() {
  if (done.value) {
    emit('done')
  } else {
    emit('close')
  }
}

async function startImport() {
  importing.value = true
  done.value = false
  doneCount.value = 0
  errors.value = []

  try {
    const group = defaultGroup.value.trim() || undefined
    const items = parsedContacts.value.map((csvContact) =>
      csvContactToVCard(csvContact, group)
    )

    const results = await putContactsBatch(items, (done) => {
      doneCount.value = done
    })

    for (let i = 0; i < results.length; i++) {
      if (results[i].error) {
        errors.value.push(`${displayName(parsedContacts.value[i])}: ${results[i].error}`)
      }
    }
  } catch (err) {
    errors.value.push(err instanceof Error ? err.message : String(err))
  } finally {
    importing.value = false
    done.value = true
  }
}
</script>

<style scoped>
.hidden-input {
  display: none;
}

.import-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2.5rem;
  border: 2px dashed var(--oc-color-border);
  border-radius: 0.5rem;
  color: var(--oc-color-text-muted);
  text-align: center;
}

.import-summary {
  font-weight: 600;
  margin: 0 0 1rem;
}

.import-table-wrap {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--oc-color-border);
  border-radius: 0.375rem;
}

.import-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.import-table th {
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-weight: 600;
  background: var(--oc-color-background-highlight);
  border-bottom: 1px solid var(--oc-color-border);
  position: sticky;
  top: 0;
}

.import-table td {
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--oc-color-border);
}

.import-more {
  color: var(--oc-color-text-muted);
  font-style: italic;
  text-align: center;
}

.import-options {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.75rem 0;
}

.import-option-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
}

.import-progress {
  margin: 1rem 0;
}

.progress-bar {
  height: 6px;
  background: var(--oc-color-border);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--oc-color-swatch-brand-default);
  transition: width 0.2s;
}

.progress-label {
  text-align: center;
  font-size: 0.85rem;
  color: var(--oc-color-text-muted);
  margin: 0.5rem 0 0;
}

.import-errors {
  margin: 1rem 0;
  padding: 0.75rem;
  background: var(--oc-color-swatch-danger-muted);
  border-radius: 0.375rem;
  font-size: 0.85rem;
}

.import-errors-title {
  font-weight: 600;
  margin: 0 0 0.5rem;
}

.import-errors ul {
  margin: 0;
  padding-left: 1.25rem;
}

.import-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 0;
  text-align: center;
}
</style>
