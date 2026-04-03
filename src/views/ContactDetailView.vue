<template>
  <div class="detail-page">

    <!-- Not found -->
    <div v-if="!contact" class="detail-notfound">
      <oc-icon name="contacts-book" size="xxlarge" color="var(--oc-color-text-muted)" />
      <p>{{ $gettext('Contact not found.') }}</p>
      <oc-button @click="goBack">{{ $gettext('Back to contacts') }}</oc-button>
    </div>

    <template v-else>

      <!-- Topbar: back + prev/next -->
      <div class="detail-topbar">
        <oc-button appearance="raw" :aria-label="$gettext('Back')" @click="goBack">
          <oc-icon name="arrow-left-s" />
          {{ $gettext('Contacts') }}
        </oc-button>
        <div class="detail-nav">
          <oc-button appearance="raw" :disabled="currentIndex <= 0" @click="goPrev">
            <oc-icon name="arrow-up-s" />
          </oc-button>
          <span class="detail-nav-pos">{{ currentIndex + 1 }} / {{ navList.length }}</span>
          <oc-button appearance="raw" :disabled="currentIndex >= navList.length - 1" @click="goNext">
            <oc-icon name="arrow-down-s" />
          </oc-button>
        </div>
      </div>

      <!-- Two-column layout -->
      <div class="detail-layout">

        <!-- LEFT: identity panel -->
        <aside class="detail-sidebar">
          <div class="detail-avatar" :style="avatarStyle(contact)">
            <img v-if="contact.photoUrl" :src="contact.photoUrl" :alt="contact.displayName" class="avatar-img" />
            <span v-else class="avatar-initials">{{ initials(contact) }}</span>
          </div>

          <h1 class="detail-name">{{ contact.displayName }}</h1>
          <p v-if="contact.title" class="detail-subtitle">{{ contact.title }}</p>
          <p v-if="contact.organization" class="detail-subtitle detail-org">{{ contact.organization }}</p>

          <div class="detail-actions">
            <a
              v-if="contact.emails.length"
              :href="`mailto:${contact.emails[0].value}`"
              class="detail-action-btn detail-action-link"
              style="display:inline-flex;align-items:center;justify-content:center;gap:0.4rem;width:100%;padding:0.5rem 0.75rem;border:1px solid currentColor;border-radius:0.25rem;text-decoration:none;font-size:0.875rem;box-sizing:border-box;"
            >
              <oc-icon name="mail" size="small" />
              {{ $gettext('Email') }}
            </a>
            <a
              v-if="contact.phones.length"
              :href="`tel:${contact.phones[0].value}`"
              class="detail-action-btn detail-action-link"
              style="display:inline-flex;align-items:center;justify-content:center;gap:0.4rem;width:100%;padding:0.5rem 0.75rem;border:1px solid currentColor;border-radius:0.25rem;text-decoration:none;font-size:0.875rem;box-sizing:border-box;"
            >
              <oc-icon name="phone" size="small" />
              {{ $gettext('Call') }}
            </a>
            <oc-button appearance="outline" class="detail-action-btn" @click="downloadVCard">
              <oc-icon name="download" size="small" />
              {{ $gettext('Download vCard') }}
            </oc-button>
            <oc-button appearance="outline" class="detail-action-btn" @click="showEdit = true">
              <oc-icon name="edit" size="small" />
              {{ $gettext('Edit') }}
            </oc-button>
            <oc-button appearance="outline" variation="danger" class="detail-action-btn" @click="confirmDelete">
              <oc-icon name="delete-bin" size="small" />
              {{ $gettext('Delete') }}
            </oc-button>
          </div>
        </aside>

        <!-- RIGHT: detail cards -->
        <div class="detail-body">

          <!-- Contact info -->
          <div class="detail-card">
            <h2 class="detail-card-title">{{ $gettext('Contact information') }}</h2>

            <div v-if="contact.emails.length" class="detail-field-group">
              <div v-for="(email, i) in contact.emails" :key="i" class="detail-field">
                <div class="detail-field-label">{{ emailLabel(email.type) }}</div>
                <a :href="`mailto:${email.value}`" class="contact-link detail-field-value">{{ email.value }}</a>
              </div>
            </div>

            <div v-if="contact.phones.length" class="detail-field-group">
              <div v-for="(phone, i) in contact.phones" :key="i" class="detail-field">
                <div class="detail-field-label">{{ phoneLabel(phone.type) }}</div>
                <a :href="`tel:${phone.value}`" class="contact-link detail-field-value">{{ phone.value }}</a>
              </div>
            </div>

            <div v-if="contact.organization" class="detail-field">
              <div class="detail-field-label">{{ $gettext('Organisation') }}</div>
              <div class="detail-field-value">{{ contact.organization }}</div>
            </div>

            <div v-if="contact.title" class="detail-field">
              <div class="detail-field-label">{{ $gettext('Title') }}</div>
              <div class="detail-field-value">{{ contact.title }}</div>
            </div>
          </div>

          <!-- Name details -->
          <div
            v-if="contact.firstName || contact.lastName || contact.prefix || contact.suffix || contact.middleName"
            class="detail-card"
          >
            <h2 class="detail-card-title">{{ $gettext('Name') }}</h2>
            <div v-if="contact.prefix" class="detail-field">
              <div class="detail-field-label">{{ $gettext('Prefix') }}</div>
              <div class="detail-field-value">{{ contact.prefix }}</div>
            </div>
            <div v-if="contact.firstName" class="detail-field">
              <div class="detail-field-label">{{ $gettext('First name') }}</div>
              <div class="detail-field-value">{{ contact.firstName }}</div>
            </div>
            <div v-if="contact.middleName" class="detail-field">
              <div class="detail-field-label">{{ $gettext('Middle name') }}</div>
              <div class="detail-field-value">{{ contact.middleName }}</div>
            </div>
            <div v-if="contact.lastName" class="detail-field">
              <div class="detail-field-label">{{ $gettext('Last name') }}</div>
              <div class="detail-field-value">{{ contact.lastName }}</div>
            </div>
            <div v-if="contact.suffix" class="detail-field">
              <div class="detail-field-label">{{ $gettext('Suffix') }}</div>
              <div class="detail-field-value">{{ contact.suffix }}</div>
            </div>
          </div>

          <!-- Addresses -->
          <div v-if="contact.addresses.length" class="detail-card">
            <h2 class="detail-card-title">{{ $gettext('Addresses') }}</h2>
            <div v-for="(addr, i) in contact.addresses" :key="i" class="detail-field">
              <div class="detail-field-label">
                {{ $gettext('Address') }}
                <span v-if="addr.type" class="contact-badge">{{ addr.type }}</span>
              </div>
              <address class="detail-field-value detail-address">
                <span v-if="addr.street">{{ addr.street }}<br /></span>
                <span v-if="addr.postalCode || addr.city">{{ [addr.postalCode, addr.city].filter(Boolean).join(' ') }}<br /></span>
                <span v-if="addr.region">{{ addr.region }}<br /></span>
                <span v-if="addr.country">{{ addr.country }}</span>
              </address>
            </div>
          </div>

          <!-- Notes -->
          <div v-if="contact.note" class="detail-card">
            <h2 class="detail-card-title">{{ $gettext('Notes') }}</h2>
            <p class="detail-note">{{ contact.note }}</p>
          </div>

        </div>
      </div>

      <!-- Edit dialog -->
      <edit-contact-dialog
        v-if="showEdit"
        :contact="contact"
        @close="showEdit = false"
        @saved="onSaved"
      />

    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from '@opencloud-eu/web-pkg'
import { useGettext } from 'vue3-gettext'
import { useContactStore } from '../composables/useContactStore'
import { useCardDAV } from '../composables/useCardDAV'
import { contactToVCard } from '../utils/vcard-builder'
import EditContactDialog from '../components/EditContactDialog.vue'
import type { Contact } from '../types/contact'

const { $gettext } = useGettext()
const router = useRouter()
const { navigationList, contacts, findByUid, setContacts } = useContactStore()
const { deleteContactEntry } = useCardDAV()

const showEdit = ref(false)
const deleting = ref(false)

function extractUid(): string {
  const parts = window.location.pathname.split('/contact/')
  return parts.length > 1 ? decodeURIComponent(parts[1].split('/')[0]) : ''
}

// Use a writable ref so navigation updates trigger reactivity
const currentUid = ref(extractUid())

const contact = computed<Contact | undefined>(() => findByUid(currentUid.value))

// Navigate in the same order as the list (sorted/filtered at time of opening)
const navList = computed(() => navigationList.value)
const currentIndex = computed(() => navList.value.findIndex((c) => c.uid === currentUid.value))

function goBack() {
  router.push('/contacts-test/list')
}

function onSaved(updated: Contact) {
  showEdit.value = false
  // currentUid stays the same, contact computed will re-read from store
}

function downloadVCard() {
  const c = contact.value
  if (!c) return
  const vcard = contactToVCard(c)
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${c.displayName.replace(/[/\\?%*:|"<>]/g, '_')}.vcf`
  a.click()
  URL.revokeObjectURL(url)
}


async function confirmDelete() {
  const c = contact.value
  if (!c) return
  if (!window.confirm($gettext('Delete "%{name}"?', { name: c.displayName }))) return

  deleting.value = true
  try {
    if (!c.href) throw new Error('No CardDAV URL')
    await deleteContactEntry(c.href)
    // Remove from store
    setContacts(contacts.value.filter((x) => x.uid !== c.uid))
    router.push('/contacts-test/list')
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err))
  } finally {
    deleting.value = false
  }
}

function goPrev() {
  const idx = currentIndex.value
  if (idx > 0) {
    const target = navList.value[idx - 1]
    currentUid.value = target.uid
    router.push(`/contacts-test/contact/${encodeURIComponent(target.uid)}`)
  }
}

function goNext() {
  const idx = currentIndex.value
  if (idx < navList.value.length - 1) {
    const target = navList.value[idx + 1]
    currentUid.value = target.uid
    router.push(`/contacts-test/contact/${encodeURIComponent(target.uid)}`)
  }
}

function phoneLabel(type?: string): string {
  if (!type) return $gettext('Phone')
  const t = type.toUpperCase()
  if (t.includes('CELL') || t.includes('MOBILE')) return $gettext('Mobile')
  if (t.includes('WORK')) return $gettext('Phone (work)')
  if (t.includes('HOME')) return $gettext('Phone (home)')
  if (t.includes('FAX')) return $gettext('Fax')
  if (t.includes('PAGER')) return $gettext('Pager')
  return $gettext('Phone')
}

function emailLabel(type?: string): string {
  if (!type || type.toUpperCase() === 'INTERNET') return $gettext('Email')
  const t = type.toUpperCase()
  if (t.includes('WORK')) return $gettext('Email (work)')
  if (t.includes('HOME')) return $gettext('Email (home)')
  return $gettext('Email')
}

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

function initials(c: Contact): string {
  const first = c.firstName?.charAt(0) ?? c.displayName.charAt(0)
  const last = c.lastName?.charAt(0) ?? c.displayName.charAt(1) ?? ''
  return (first + last).toUpperCase()
}

function avatarStyle(c: Contact): Record<string, string> {
  if (c.photoUrl) return {}
  return { backgroundColor: stringToColor(c.displayName) }
}
</script>

<style scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 2rem 2rem 8rem;
  overflow-y: auto;
}

/* --- Topbar --- */
.detail-topbar {
  padding: 1rem 0;
  border-bottom: 1px solid var(--oc-color-border);
  margin-bottom: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.detail-nav-pos {
  font-size: 0.85rem;
  color: var(--oc-color-text-muted);
  min-width: 4rem;
  text-align: center;
}

/* --- Two-column layout --- */
.detail-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 2rem;
  align-items: start;
  flex: 1;
  min-height: 0;
}

/* --- Left sidebar --- */
.detail-sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1.5rem 1rem;
  background: var(--oc-color-background-highlight);
  border: 1px solid var(--oc-color-border);
  border-radius: 0.5rem;
  position: sticky;
  top: 0;
}

.detail-avatar {
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  margin-bottom: 1rem;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initials {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.detail-name {
  font-size: 1.2rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
  word-break: break-word;
  color: var(--oc-color-text-default);
  line-height: 1.3;
}

.detail-subtitle {
  font-size: 0.85rem;
  color: var(--oc-color-text-muted);
  margin: 0.1rem 0 0;
}

.detail-org {
  font-weight: 600;
}

.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  margin-top: 1.25rem;
}

.detail-action-btn {
  width: 100%;
  justify-content: center;
}

.detail-action-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--oc-color-swatch-brand-default);
  border-radius: 0.25rem;
  text-decoration: none;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 400;
  color: var(--oc-color-swatch-brand-default);
  background: transparent;
  box-sizing: border-box;
  cursor: pointer;
}

.detail-action-link:hover {
  background: color-mix(in srgb, var(--oc-color-swatch-brand-default) 10%, transparent);
}

/* --- Right: cards --- */
.detail-body {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
}

.detail-card {
  background: var(--oc-color-background-highlight);
  border: 1px solid var(--oc-color-border);
  border-radius: 0.5rem;
  padding: 1.5rem;
}

.detail-card-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--oc-color-text-muted);
  margin: 0 0 1.25rem;
}

/* --- Fields --- */
.detail-field-group {
  margin-bottom: 0.75rem;
}

.detail-field {
  display: grid;
  grid-template-columns: 9rem 1fr;
  gap: 0.5rem 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--oc-color-border);
}

.detail-field:last-child {
  border-bottom: none;
}

.detail-field-label {
  font-size: 0.85rem;
  color: var(--oc-color-text-muted);
  padding-top: 0.1rem;
}

.detail-field-value {
  font-size: 0.95rem;
  color: var(--oc-color-text-default);
  word-break: break-word;
}

.detail-address {
  font-style: normal;
  line-height: 1.6;
}

.contact-link {
  color: var(--oc-color-swatch-brand-default);
  text-decoration: none;
}

.contact-link:hover {
  text-decoration: underline;
}

.contact-badge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  background: var(--oc-color-background-default);
  color: var(--oc-color-text-muted);
  vertical-align: middle;
}

.detail-note {
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--oc-color-text-default);
  margin: 0;
  white-space: pre-wrap;
}

/* --- Not found --- */
.detail-notfound {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex: 1;
  padding: 4rem 0;
  color: var(--oc-color-text-muted);
}
</style>
