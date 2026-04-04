<template>
  <div class="contacts-app">
    <!-- Header -->
    <div class="contacts-header">
      <h1 class="contacts-title">
        <oc-icon name="contacts-book" size="large" />
        {{ $gettext('Contacts') }}
        <span v-if="!loading && contacts.length" class="contacts-count">
          {{ contacts.length }}
        </span>
      </h1>

      <div class="contacts-toolbar">
        <!-- Search -->
        <oc-search-bar
          v-model="searchQuery"
          :label="$gettext('Search contacts')"
          :placeholder="$gettext('Search contacts…')"
          :button-hidden="true"
          :type-ahead="true"
          :is-filter="true"
          class="contacts-search"
        />

        <!-- New contact -->
        <oc-button
          :aria-label="$gettext('New contact')"
          appearance="filled"
          @click="showNew = true"
        >
          <oc-icon name="add" size="small" />
          {{ $gettext('New contact') }}
        </oc-button>

        <!-- Export -->
        <oc-button
          :aria-label="$gettext('Export contacts')"
          appearance="outline"
          :disabled="!contacts.length"
          @click="exportContacts"
        >
          <oc-icon name="download" size="small" />
          {{ $gettext('Export') }}
        </oc-button>

        <!-- Import -->
        <oc-button
          :aria-label="$gettext('Import contacts')"
          appearance="outline"
          @click="showImport = true"
        >
          <oc-icon name="upload" size="small" />
          {{ $gettext('Import') }}
        </oc-button>

        <!-- Set default group -->
        <template v-if="contactsWithoutGroup.length && !settingGroup">
          <datalist id="known-groups-bulk">
            <option v-for="g in knownGroups" :key="g" :value="g" />
          </datalist>
          <input
            v-model="bulkGroup"
            type="text"
            list="known-groups-bulk"
            class="oc-text-input bulk-group-input"
            :placeholder="$gettext('Group name')"
          />
          <oc-button
            :aria-label="$gettext('Set group for contacts without group')"
            appearance="outline"
            :disabled="!bulkGroup.trim()"
            @click="setDefaultGroup"
          >
            <oc-icon name="group" size="small" />
            {{ $gettext('Set group (%{n})', { n: contactsWithoutGroup.length }) }}
          </oc-button>
        </template>
        <span v-if="settingGroup" class="group-progress">
          {{ $gettext('Updating…') }} {{ groupDone }} / {{ groupTotal }}
        </span>

        <!-- Delete all -->
        <oc-button
          v-if="contacts.length"
          :aria-label="$gettext('Delete all contacts')"
          appearance="raw"
          class="contacts-delete-all"
          @click="showDeleteAll = true"
        >
          <oc-icon name="delete-bin" />
        </oc-button>

        <!-- Reload -->
        <oc-button
          :aria-label="$gettext('Reload contacts')"
          appearance="raw"
          class="contacts-reload"
          @click="loadContacts"
        >
          <oc-icon name="restart" />
        </oc-button>
      </div>
    </div>

    <!-- New contact dialog -->
    <new-contact-dialog
      v-if="showNew"
      @close="showNew = false"
      @created="onCreated"
    />

    <!-- Import dialog -->
    <import-dialog
      v-if="showImport"
      @close="showImport = false"
      @done="onImportDone"
    />

    <!-- Delete all confirmation dialog -->
    <oc-modal
      v-if="showDeleteAll"
      :title="$gettext('Delete all contacts')"
      :button-cancel-text="$gettext('Cancel')"
      :button-confirm-text="deleting ? $gettext('Deleting…') : $gettext('Delete all')"
      :button-confirm-disabled="deleting"
      variation="danger"
      @cancel="showDeleteAll = false"
      @confirm="deleteAll"
    >
      <template #content>
        <p>{{ $gettext('This will permanently delete all %{n} contacts. This cannot be undone.', { n: contacts.length }) }}</p>
        <div v-if="deleting" class="delete-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: deleteTotal ? (deleteDone / deleteTotal * 100) + '%' : '0%' }" />
          </div>
          <p class="progress-label">{{ deleteDone }} / {{ deleteTotal }}</p>
        </div>
        <p v-if="deleteError" class="delete-error">{{ deleteError }}</p>
      </template>
    </oc-modal>

    <!-- Error -->
    <oc-info-drop
      v-if="error"
      class="contacts-error"
      variation="danger"
      :title="$gettext('Could not load contacts')"
      :text="error"
    />

    <!-- Loading -->
    <div v-if="loading" class="contacts-loading">
      <oc-spinner :aria-label="$gettext('Loading contacts…')" size="medium" />
      <span>{{ $gettext('Loading contacts…') }}</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="!loading && filteredContacts.length === 0" class="contacts-empty">
      <oc-icon name="contacts-book" size="xxlarge" color="var(--oc-color-text-muted)" />
      <p v-if="searchQuery">
        {{ $gettext('No contacts match your search.') }}
      </p>
      <p v-else>
        {{ $gettext('No contacts found.') }}
      </p>
    </div>

    <!-- Contact table -->
    <div v-else class="contacts-table-wrapper">
      <table class="contacts-table" aria-label="Contacts">
        <thead>
          <tr>
            <th class="col-avatar" aria-hidden="true"></th>
            <th
              v-for="col in columns"
              :key="col.key"
              :class="col.sortable === false ? '' : 'col-sortable'"
              :aria-sort="col.sortable !== false && sortKey === col.key ? (sortAsc ? 'ascending' : 'descending') : 'none'"
              @click="col.sortable !== false && setSort(col.key as typeof sortKey.value)"
            >
              <span class="col-label">
                {{ col.label }}
                <oc-icon
                  v-if="col.sortable !== false && sortKey === col.key"
                  :name="sortAsc ? 'arrow-up-s' : 'arrow-down-s'"
                  size="small"
                  class="col-sort-icon"
                />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="contact in filteredContacts"
            :key="contact.uid"
            class="contact-row"
            tabindex="0"
            @click="openContact(contact)"
            @keyup.enter="openContact(contact)"
          >
            <!-- Avatar -->
            <td class="col-avatar">
              <div class="avatar" :style="avatarStyle(contact)" :aria-hidden="!!contact.photoUrl">
                <img
                  v-if="contact.photoUrl"
                  :src="contact.photoUrl"
                  :alt="contact.displayName"
                  class="avatar-img"
                />
                <span v-else class="avatar-initials">{{ initials(contact) }}</span>
              </div>
            </td>

            <!-- Name -->
            <td class="col-name">
              <span class="contact-name">{{ contact.displayName }}</span>
              <span v-if="contact.title" class="contact-title">{{ contact.title }}</span>
            </td>

            <!-- Groups -->
            <td class="col-groups">
              <span v-if="contact.categories?.length" class="contact-categories">
                <span v-for="cat in contact.categories" :key="cat" class="contact-category-chip">{{ cat }}</span>
              </span>
              <span v-else class="text-muted">–</span>
            </td>

            <!-- Organisation -->
            <td class="col-org">{{ contact.organization ?? '–' }}</td>

            <!-- Primary email -->
            <td class="col-email">
              <a
                v-if="contact.emails.length"
                :href="`mailto:${contact.emails[0].value}`"
                class="contact-link"
                @click.stop
              >
                {{ contact.emails[0].value }}
              </a>
              <span v-else class="text-muted">–</span>
            </td>

            <!-- Primary phone -->
            <td class="col-phone">
              <a
                v-if="contact.phones.length"
                :href="`tel:${contact.phones[0].value}`"
                class="contact-link"
                @click.stop
              >
                {{ contact.phones[0].value }}
              </a>
              <span v-else class="text-muted">–</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useUserStore } from '@opencloud-eu/web-pkg'
import { useGettext } from 'vue3-gettext'
import { useCardDAV } from '../composables/useCardDAV'
import { useContactStore } from '../composables/useContactStore'
import { contactToVCard } from '../utils/vcard-builder'
import { exportContactsToCSV } from '../utils/csv-exporter'
import ImportDialog from '../components/ImportDialog.vue'
import NewContactDialog from '../components/NewContactDialog.vue'
import type { Contact } from '../types/contact'

const { $gettext } = useGettext()
const { loading, error, loadContacts, updateContactsBatch, deleteAllContacts } = useCardDAV()
const { contacts, knownGroups, setNavigationList, setContacts } = useContactStore()
const router = useRouter()

const settingGroup = ref(false)
const groupDone = ref(0)
const groupTotal = ref(0)
const bulkGroup = ref('Alle')

const contactsWithoutGroup = computed(() =>
  contacts.value.filter((c) => !c.categories?.length && c.href)
)

async function setDefaultGroup() {
  settingGroup.value = true
  groupDone.value = 0
  groupTotal.value = contactsWithoutGroup.value.length

  try {
    const updated = contactsWithoutGroup.value.map((c) => ({
      ...c,
      categories: [bulkGroup.value.trim()]
    }))

    const items = updated.map((c) => ({ href: c.href!, vcard: contactToVCard(c) }))
    const results = await updateContactsBatch(items, (done) => { groupDone.value = done })

    // Only apply updates that succeeded on the server
    const succeededHrefs = new Set(results.filter((r) => !r.error).map((r) => r.href))
    const byHref = new Map(updated.filter((c) => succeededHrefs.has(c.href!)).map((c) => [c.href!, c]))
    setContacts(contacts.value.map((c) => byHref.get(c.href!) ?? c))
  } finally {
    settingGroup.value = false
  }
}

const searchQuery = ref('')
const sortKey = ref<'displayName' | 'organization' | 'email' | 'phone'>('displayName')
const sortAsc = ref(true)
const showImport = ref(false)
const showNew = ref(false)
const showDeleteAll = ref(false)
const deleting = ref(false)
const deleteDone = ref(0)
const deleteTotal = ref(0)
const deleteError = ref<string | null>(null)

function exportContacts() {
  const csv = exportContactsToCSV(contacts.value)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function onImportDone() {
  showImport.value = false
  await loadContacts()
}

async function deleteAll() {
  deleting.value = true
  deleteDone.value = 0
  deleteTotal.value = 0
  deleteError.value = null
  try {
    await deleteAllContacts((done, total) => {
      deleteDone.value = done
      deleteTotal.value = total
    })
    // Only clear the store if the server operation completed without throwing
    setContacts([])
    showDeleteAll.value = false
  } catch (err) {
    // Do not clear local store — server state is uncertain
    deleteError.value = err instanceof Error ? err.message : String(err)
  } finally {
    deleting.value = false
  }
}

function onCreated(contact: Contact) {
  showNew.value = false
  openContact(contact)
}

function openContact(contact: Contact) {
  setNavigationList(filteredContacts.value)
  router.push(`/contacts-test/contact/${encodeURIComponent(contact.uid)}`)
}

const columns = computed(() => [
  { key: 'displayName' as const, label: $gettext('Name') },
  { key: 'groups' as const, label: $gettext('Groups'), sortable: false },
  { key: 'organization' as const, label: $gettext('Organisation') },
  { key: 'email' as const, label: $gettext('Email') },
  { key: 'phone' as const, label: $gettext('Phone') }
])

function setSort(key: typeof sortKey.value) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
}

function contactSortValue(c: Contact): string {
  switch (sortKey.value) {
    case 'displayName':
      return c.displayName.toLowerCase()
    case 'organization':
      return (c.organization ?? '').toLowerCase()
    case 'email':
      return (c.emails[0]?.value ?? '').toLowerCase()
    case 'phone':
      return (c.phones[0]?.value ?? '').toLowerCase()
    default:
      return ''
  }
}

const filteredContacts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()

  let list = q
    ? contacts.value.filter((c) => {
        return (
          c.displayName.toLowerCase().includes(q) ||
          c.organization?.toLowerCase().includes(q) ||
          c.emails.some((e) => e.value.toLowerCase().includes(q)) ||
          c.phones.some((p) => p.value.toLowerCase().includes(q)) ||
          c.categories?.some((g) => g.toLowerCase().includes(q))
        )
      })
    : [...contacts.value]

  list.sort((a, b) => {
    const av = contactSortValue(a)
    const bv = contactSortValue(b)
    const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' })
    return sortAsc.value ? cmp : -cmp
  })

  return list
})

/** Consistent color from string */
function stringToColor(str: string): string {
  const palette = [
    '#0063BE', '#006F67', '#9B4D00', '#7B2D8B', '#C31F39',
    '#00647A', '#4A6741', '#7A4700', '#2B5EA7', '#8A3B6B'
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return palette[Math.abs(hash) % palette.length]
}

function initials(contact: Contact): string {
  const first = contact.firstName?.charAt(0) ?? contact.displayName.charAt(0)
  const last = contact.lastName?.charAt(0) ?? contact.displayName.charAt(1) ?? ''
  return (first + last).toUpperCase()
}

function avatarStyle(contact: Contact): Record<string, string> {
  if (contact.photoUrl) return {}
  return { backgroundColor: stringToColor(contact.displayName) }
}

const userStore = useUserStore()

// Load contacts on first mount if store is empty; reload on user switch
watch(
  () => userStore.user?.id,
  (id, prevId) => {
    if (!id) return
    if (prevId && prevId !== id) {
      // User switched — clear store and token immediately, then reload
      setContacts([])
      sessionStorage.removeItem('oc-contacts-app-token')
      loadContacts()
    } else if (!prevId && contacts.value.length === 0) {
      // Initial mount with no data yet
      loadContacts()
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.contacts-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.5rem 2rem;
  position: relative;
  overflow: hidden;
}

/* --- Header --- */
.contacts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.contacts-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  color: var(--oc-color-text-default);
}

.contacts-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.5rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  background: var(--oc-color-swatch-brand-default);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
}

.contacts-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.contacts-search {
  width: 22rem;
}

/* --- States --- */
.contacts-loading,
.contacts-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex: 1;
  color: var(--oc-color-text-muted);
  padding: 4rem 0;
}

.contacts-error {
  margin-bottom: 1rem;
}

/* --- Table --- */
.contacts-table-wrapper {
  overflow: auto;
  flex: 1;
  border-radius: 0.5rem;
  border: 1px solid var(--oc-color-border);
}

.contacts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.contacts-table thead {
  position: sticky;
  top: 0;
  background: var(--oc-color-background-highlight);
  z-index: 1;
}

.contacts-table th {
  padding: 0.6rem 1rem;
  text-align: left;
  font-weight: 600;
  color: var(--oc-color-text-muted);
  border-bottom: 2px solid var(--oc-color-border);
  white-space: nowrap;
}

.col-sortable {
  cursor: pointer;
  user-select: none;
}

.col-sortable:hover .col-label {
  color: var(--oc-color-swatch-brand-default);
}

.col-label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.col-avatar {
  width: 3rem;
  padding-left: 1rem;
}

/* --- Rows --- */
.contact-row {
  cursor: pointer;
  border-bottom: 1px solid var(--oc-color-border);
  transition: background 0.12s;
}

.contact-row:hover,
.contact-row:focus {
  background: var(--oc-color-background-highlight);
  outline: none;
}

.contact-row td {
  padding: 0.65rem 1rem;
  vertical-align: middle;
}

/* --- Avatar --- */
.avatar {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initials {
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

/* --- Name column --- */
.col-name {
  min-width: 14rem;
}

.contact-name {
  display: block;
  font-weight: 600;
  color: var(--oc-color-text-default);
}

.contact-title {
  display: block;
  font-size: 0.78rem;
  color: var(--oc-color-text-muted);
  margin-top: 0.1rem;
}

.contact-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.2rem;
}

.contact-category-chip {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--oc-color-swatch-brand-default) !important;
  color: #fff !important;
  line-height: 1.6;
}

.contact-link {
  color: var(--oc-color-swatch-brand-default);
  text-decoration: none;
}

.contact-link:hover {
  text-decoration: underline;
}

.group-progress {
  font-size: 0.85rem;
  color: var(--oc-color-text-muted);
  white-space: nowrap;
}

.text-muted {
  color: var(--oc-color-text-muted);
}

.contact-badge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  background: var(--oc-color-background-highlight);
  color: var(--oc-color-text-muted);
  vertical-align: middle;
}

.bulk-group-input {
  width: 10rem;
  height: 2rem;
  font-size: 0.875rem;
}

.delete-progress {
  margin-top: 1rem;
}

.delete-error {
  margin-top: 0.75rem;
  color: var(--oc-color-swatch-danger-default);
  font-size: 0.875rem;
}

.progress-bar {
  height: 6px;
  background: var(--oc-color-border);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--oc-color-swatch-danger-default);
  transition: width 0.2s;
}

.progress-label {
  text-align: center;
  font-size: 0.85rem;
  color: var(--oc-color-text-muted);
  margin: 0.5rem 0 0;
}
</style>
