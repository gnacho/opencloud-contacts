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

        <!-- Layout switch: table (list) or cards -->
        <div class="view-switch" role="group" :aria-label="$gettext('Layout')">
          <button
            type="button"
            class="view-switch-button"
            :class="{ 'is-active': viewMode === 'list' }"
            :aria-pressed="viewMode === 'list'"
            :title="$gettext('List')"
            @click="setViewMode('list')"
          >
            {{ $gettext('List') }}
          </button>
          <button
            type="button"
            class="view-switch-button"
            :class="{ 'is-active': viewMode === 'cards' }"
            :aria-pressed="viewMode === 'cards'"
            :title="$gettext('Cards')"
            @click="setViewMode('cards')"
          >
            {{ $gettext('Cards') }}
          </button>
        </div>

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
        <span v-if="groupError" class="group-error">
          {{ groupError }}
        </span>

        <!-- Find duplicates -->
        <oc-button
          v-if="contacts.length"
          :aria-label="$gettext('Find duplicate contacts')"
          :title="$gettext('Find duplicate contacts')"
          appearance="raw"
          @click="openDuplicates"
        >
          <oc-icon name="git-merge" />
        </oc-button>

        <!-- Delete all -->
        <oc-button
          v-if="contacts.length"
          :aria-label="$gettext('Delete all contacts')"
          :title="$gettext('Delete all contacts')"
          appearance="raw"
          class="contacts-delete-all"
          @click="showDeleteAll = true"
        >
          <oc-icon name="delete-bin" />
        </oc-button>

        <!-- Reload -->
        <oc-button
          :aria-label="$gettext('Reload contacts')"
          :title="$gettext('Reload contacts')"
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

    <!-- Duplicates dialog -->
    <duplicates-dialog
      v-if="showDuplicates"
      :groups="duplicateGroups"
      @close="showDuplicates = false"
      @merged="onMerged"
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

    <!-- Card grid -->
    <div
      v-else-if="viewMode === 'cards'"
      class="contacts-cards"
      role="list"
      aria-label="Contacts"
    >
      <article
        v-for="contact in filteredContacts"
        :key="contact.uid"
        class="contact-card"
        role="listitem"
        tabindex="0"
        @click="openContact(contact)"
        @keyup.enter="openContact(contact)"
      >
        <div class="card-head">
          <div class="avatar avatar-lg" :style="avatarStyle(contact)" :aria-hidden="!!contact.photoUrl">
            <img
              v-if="contact.photoUrl"
              :src="contact.photoUrl"
              :alt="contact.displayName"
              class="avatar-img"
            />
            <span v-else class="avatar-initials">{{ initials(contact) }}</span>
          </div>
          <div class="card-title-block">
            <span class="contact-name">{{ contact.displayName }}</span>
            <span v-if="contact.title" class="contact-title">{{ contact.title }}</span>
            <span v-if="contact.organization" class="card-org">{{ contact.organization }}</span>
          </div>
        </div>

        <div v-if="contact.emails.length || contact.phones.length" class="card-lines">
          <a
            v-if="contact.emails.length"
            :href="mailtoHref(contact.emails[0].value)"
            class="contact-link card-line"
            @click.stop
          >
            <oc-icon name="mail" size="small" />
            <span class="card-line-text">{{ contact.emails[0].value }}</span>
          </a>
          <a
            v-if="contact.phones.length"
            :href="telHref(contact.phones[0].value)"
            class="contact-link card-line"
            @click.stop
          >
            <oc-icon name="phone" size="small" />
            <span class="card-line-text">{{ contact.phones[0].value }}</span>
          </a>
        </div>

        <div v-if="contact.categories?.length" class="contact-categories card-categories">
          <span v-for="cat in contact.categories" :key="cat" class="contact-category-chip">{{ cat }}</span>
        </div>
      </article>
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
              @click="col.sortable !== false && setSort(col.key as typeof sortKey)"
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
                :href="mailtoHref(contact.emails[0].value)"
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
                :href="telHref(contact.phones[0].value)"
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

    <footer class="contacts-footer">
      © 2026 <a href="https://linux-nerds.org" target="_blank" rel="noopener noreferrer">linux-nerds.org</a> · {{ $gettext('Contacts') }} v{{ appVersion }}
    </footer>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { version as appVersion } from '../../package.json'
import { useRouter, useUserStore, useAuthStore } from '@opencloud-eu/web-pkg'
import { useGettext } from 'vue3-gettext'
import { useCardDAV } from '../composables/useCardDAV'
import { useContactStore } from '../composables/useContactStore'
import { contactToVCard } from '../utils/vcard-builder'
import { mailtoHref, telHref } from '../utils/links'
import { exportContactsToCSV } from '../utils/csv-exporter'
import ImportDialog from '../components/ImportDialog.vue'
import NewContactDialog from '../components/NewContactDialog.vue'
import DuplicatesDialog from '../components/DuplicatesDialog.vue'
import type { Contact } from '../types/contact'
import { APP_ID } from '../config'
import { findDuplicates } from '../utils/duplicates'
import type { DuplicateGroup } from '../utils/duplicates'

const { $gettext } = useGettext()
const { loading, error, loadContacts, updateContactsBatch, deleteAllContacts, discardAppTokens } = useCardDAV()
const { contacts, knownGroups, setNavigationList, setContacts } = useContactStore()
const router = useRouter()

const settingGroup = ref(false)
const groupDone = ref(0)
const groupTotal = ref(0)
const groupError = ref<string | null>(null)
const bulkGroup = ref('Alle')

const contactsWithoutGroup = computed(() =>
  contacts.value.filter((c) => !c.categories?.length && c.href)
)

async function setDefaultGroup() {
  settingGroup.value = true
  groupDone.value = 0
  groupTotal.value = contactsWithoutGroup.value.length
  groupError.value = null

  try {
    const updated = contactsWithoutGroup.value.map((c) => ({
      ...c,
      categories: [bulkGroup.value.trim()]
    }))

    const items = updated.map((c) => ({ href: c.href!, vcard: contactToVCard(c), etag: c.etag }))
    const results = await updateContactsBatch(items, (done) => { groupDone.value = done })

    // Only apply updates that succeeded on the server
    const succeeded = results.filter((r) => !r.error && !r.conflict)
    const failed = results.filter((r) => r.error)
    const conflicts = results.filter((r) => r.conflict)
    const byHref = new Map(updated.filter((c) => succeeded.some((r) => r.href === c.href!)).map((c) => [c.href!, c]))
    const etagByHref = new Map(succeeded.filter((r) => r.etag).map((r) => [r.href, r.etag!]))
    setContacts(
      contacts.value.map((c) => {
        const u = byHref.get(c.href!)
        if (!u) return c
        // Keep the fresh ETag so the next edit is protected too.
        return { ...u, etag: etagByHref.get(c.href!) ?? u.etag }
      })
    )
    if (conflicts.length) {
      groupError.value = $gettext(
        '%{n} contact(s) were changed on the server or on another device. Reload the contacts to get their current version.',
        { n: conflicts.length }
      )
    } else if (failed.length) {
      groupError.value = $gettext('%{n} contact(s) could not be updated.', { n: failed.length })
    }
  } finally {
    settingGroup.value = false
  }
}

const showDuplicates = ref(false)
const duplicateGroups = ref<DuplicateGroup[]>([])

function openDuplicates() {
  duplicateGroups.value = findDuplicates(contacts.value)
  showDuplicates.value = true
}

async function onMerged() {
  await loadContacts()
  duplicateGroups.value = findDuplicates(contacts.value)
}

const searchQuery = ref('')
const sortKey = ref<'displayName' | 'organization' | 'email' | 'phone'>('displayName')
const sortAsc = ref(true)

// The layout choice is per browser and remembered: the table stays the default,
// cards are opt-in.
const VIEW_MODE_STORAGE_KEY = 'opencloud-contacts.view-mode'
type ViewMode = 'list' | 'cards'

function storedViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'cards' ? 'cards' : 'list'
  } catch {
    return 'list'
  }
}

const viewMode = ref<ViewMode>(storedViewMode())

function setViewMode(mode: ViewMode) {
  viewMode.value = mode
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // Storage unavailable (private mode, quota): the choice simply is not remembered.
  }
}
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
  router.push(`/${APP_ID}/contact/${encodeURIComponent(contact.uid)}`)
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
const authStore = useAuthStore()

// Track which user's contacts are currently loaded so we can detect switches
// reliably regardless of whether userId or accessToken changes first.
const lastLoadedUserId = ref<string | null>(null)

watch(
  () => [userStore.user?.id, authStore.accessToken] as const,
  ([userId, token]) => {
    if (!userId) {
      // Logged out — clear contacts and drop/revoke the app token
      setContacts([])
      discardAppTokens()
      lastLoadedUserId.value = null
      return
    }
    if (!token) return // access token not yet available — wait for next tick
    if (userId !== lastLoadedUserId.value) {
      if (lastLoadedUserId.value) {
        // Different user — clear stale contacts and the previous user's app token
        setContacts([])
        discardAppTokens()
        lastLoadedUserId.value = userId
        loadContacts()
      } else {
        // Fresh mount or re-login — only reload if store is empty
        lastLoadedUserId.value = userId
        if (contacts.value.length === 0) loadContacts()
      }
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

.contacts-footer {
  margin-top: auto;
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  color: var(--oc-color-text-muted);
  text-align: center;
}

.contacts-footer a {
  color: var(--oc-color-text-muted);
  text-decoration: none;
}

.contacts-footer a:hover {
  text-decoration: underline;
}

/* --- Layout switch --- */
.view-switch {
  display: inline-flex;
  border: 1px solid var(--oc-color-border);
  border-radius: 0.375rem;
  overflow: hidden;
}

.view-switch-button {
  border: 0;
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  color: var(--oc-color-text-muted);
  transition: background 0.12s, color 0.12s;
}

.view-switch-button:hover {
  color: var(--oc-color-text-default);
}

.view-switch-button.is-active {
  background: var(--oc-color-swatch-brand-default);
  color: #fff;
}

.view-switch-button:focus-visible {
  outline: 2px solid var(--oc-color-swatch-brand-default);
  outline-offset: -2px;
}

/* --- Card grid --- */
.contacts-cards {
  flex: 1;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.75rem;
  align-content: start;
  padding-bottom: 0.5rem;
}

.contact-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem;
  border: 1px solid var(--oc-color-border);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.contact-card:hover,
.contact-card:focus {
  background: var(--oc-color-background-highlight);
  border-color: var(--oc-color-swatch-brand-default);
  outline: none;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.avatar-lg {
  width: 3rem;
  height: 3rem;
}

.avatar-lg .avatar-initials {
  font-size: 1.05rem;
}

.card-title-block {
  min-width: 0;
}

.card-title-block .contact-name,
.card-title-block .contact-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-org {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.78rem;
  color: var(--oc-color-text-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-lines {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.card-line {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  min-width: 0;
}

.card-line-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-categories {
  margin-top: auto;
}
</style>
