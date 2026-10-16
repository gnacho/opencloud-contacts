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

      <!-- Business card -->
      <div class="bcard" :style="{ '--bcard-accent': accentColor }">

        <!-- Header: avatar + name -->
        <div class="bcard-header">
          <div class="bcard-avatar" :style="avatarStyle(contact)">
            <img v-if="contact.photoUrl" :src="contact.photoUrl" :alt="contact.displayName" class="avatar-img" />
            <span v-else class="avatar-initials">{{ initials(contact) }}</span>
          </div>
          <div class="bcard-header-info">
            <h1 class="bcard-name">{{ contact.displayName }}</h1>
            <p v-if="contact.title" class="bcard-title">{{ contact.title }}</p>
            <p v-if="contact.organization" class="bcard-org">{{ contact.organization }}</p>
          </div>
        </div>

        <!-- Contact rows -->
        <div class="bcard-body">
          <a v-for="(email, i) in contact.emails" :key="`e${i}`" :href="mailtoHref(email.value)" class="bcard-row bcard-row--link">
            <oc-icon name="mail" size="small" class="bcard-row-icon" />
            <span class="bcard-row-label">{{ emailLabel(email.type) }}</span>
            <span class="bcard-row-value">{{ email.value }}</span>
          </a>
          <a v-for="(phone, i) in contact.phones" :key="`p${i}`" :href="telHref(phone.value)" class="bcard-row bcard-row--link">
            <oc-icon name="phone" size="small" class="bcard-row-icon" />
            <span class="bcard-row-label">{{ phoneLabel(phone.type) }}</span>
            <span class="bcard-row-value">{{ phone.value }}</span>
          </a>
          <div v-for="(addr, i) in contact.addresses" :key="`a${i}`" class="bcard-row">
            <oc-icon name="map-pin" size="small" class="bcard-row-icon" />
            <span class="bcard-row-label">{{ addr.type || $gettext('Address') }}</span>
            <span class="bcard-row-value">{{ [addr.street, [addr.postalCode, addr.city].filter(Boolean).join(' '), addr.country].filter(Boolean).join(', ') }}</span>
          </div>
          <div v-if="contact.note" class="bcard-row">
            <oc-icon name="chat-1" size="small" class="bcard-row-icon" />
            <span class="bcard-row-label">{{ $gettext('Note') }}</span>
            <span class="bcard-row-value bcard-row-value--note">{{ contact.note }}</span>
          </div>
        </div>

        <!-- Action toolbar -->
        <div class="bcard-toolbar">
          <oc-button v-if="contact.emails.length" appearance="outline" @click="openHref(mailtoHref(contact.emails[0].value))">
            <oc-icon name="mail" size="small" />{{ $gettext('Email') }}
          </oc-button>
          <oc-button v-if="contact.phones.length" appearance="outline" @click="openHref(telHref(contact.phones[0].value))">
            <oc-icon name="phone" size="small" />{{ $gettext('Call') }}
          </oc-button>
          <oc-button appearance="outline" @click="downloadVCard">
            <oc-icon name="download" size="small" />{{ $gettext('vCard') }}
          </oc-button>
          <div class="bcard-toolbar-spacer" />
          <oc-button appearance="outline" @click="showEdit = true">
            <oc-icon name="edit" size="small" />{{ $gettext('Edit') }}
          </oc-button>
          <oc-button appearance="outline" variation="danger" @click="confirmDelete">
            <oc-icon name="delete-bin" size="small" />{{ $gettext('Delete') }}
          </oc-button>
        </div>
      </div>

      <!-- Detail cards -->
      <div class="detail-cards">

        <!-- Groups -->
        <div v-if="contact.categories?.length" class="detail-card">
          <h2 class="detail-card-title">{{ $gettext('Groups') }}</h2>
          <div class="detail-categories">
            <span v-for="cat in contact.categories" :key="cat" class="detail-category-chip">{{ cat }}</span>
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

    <footer class="contacts-footer">
      © 2026 <a href="https://linux-nerds.org" target="_blank" rel="noopener noreferrer">linux-nerds.org</a> · {{ $gettext('Contacts') }} v{{ appVersion }}
    </footer>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { version as appVersion } from '../../package.json'
import { useRouter, useRoute, useUserStore } from '@opencloud-eu/web-pkg'
import { useGettext } from 'vue3-gettext'
import { useContactStore } from '../composables/useContactStore'
import { useCardDAV } from '../composables/useCardDAV'
import { contactToVCard } from '../utils/vcard-builder'
import { mailtoHref, telHref } from '../utils/links'
import EditContactDialog from '../components/EditContactDialog.vue'
import type { Contact } from '../types/contact'
import { APP_ID } from '../config'

const { $gettext } = useGettext()
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const { navigationList, contacts, findByUid, setContacts, setNavigationList } = useContactStore()
const { deleteContactEntry } = useCardDAV()

const showEdit = ref(false)
const deleting = ref(false)

function uidFromPath(path: string): string {
  const parts = path.split('/contact/')
  return parts.length > 1 ? decodeURIComponent(parts[1].split('/')[0]) : ''
}

// Keep currentUid in sync with the route so browser navigation always
// shows the correct contact and edit/delete operate on the right record.
const currentUid = ref(uidFromPath(window.location.pathname))
watch(() => route.value.path, (path) => {
  const uid = uidFromPath(path)
  if (uid) currentUid.value = uid
})

// On user switch navigate to the list; ContactsView will reset the store and reload.
watch(() => userStore.user?.id, (id, prevId) => {
  if (prevId && id !== prevId) {
    router.push(`/${APP_ID}/list`)
  }
})

const contact = computed<Contact | undefined>(() => findByUid(currentUid.value))

// Navigate in the same order as the list (sorted/filtered at time of opening)
const navList = computed(() => navigationList.value)
const currentIndex = computed(() => navList.value.findIndex((c) => c.uid === currentUid.value))

const accentColor = computed(() => stringToColor(contact.value?.displayName ?? ''))

const primaryAddress = computed(() => {
  const a = contact.value?.addresses[0]
  if (!a) return null
  return [a.city, a.country].filter(Boolean).join(', ')
})

function goBack() {
  router.push(`/${APP_ID}/list`)
}

function onSaved(updated: Contact) {
  showEdit.value = false
  // Ensure currentUid still matches the saved contact (UID is stable)
  currentUid.value = updated.uid
}

function openHref(url: string) {
  window.location.href = url
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
    // Remove from both stores so prev/next navigation stays consistent
    setContacts(contacts.value.filter((x) => x.uid !== c.uid))
    setNavigationList(navigationList.value.filter((x) => x.uid !== c.uid))
    router.push(`/${APP_ID}/list`)
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
    router.push(`/${APP_ID}/contact/${encodeURIComponent(target.uid)}`)
  }
}

function goNext() {
  const idx = currentIndex.value
  if (idx < navList.value.length - 1) {
    const target = navList.value[idx + 1]
    currentUid.value = target.uid
    router.push(`/${APP_ID}/contact/${encodeURIComponent(target.uid)}`)
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

/* --- Business Card --- */
.bcard {
  max-width: 560px;
  background: var(--oc-color-background-highlight);
  border: 1px solid var(--oc-color-border);
  border-radius: 1rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  margin-bottom: 2rem;
}

@media (prefers-color-scheme: dark) {
  .bcard {
    background: color-mix(in srgb, white 10%, var(--oc-color-background-highlight));
    border: 2px solid color-mix(in srgb, var(--bcard-accent) 50%, transparent);
    box-shadow:
      0 0 24px color-mix(in srgb, var(--bcard-accent) 30%, transparent),
      0 0 48px color-mix(in srgb, var(--bcard-accent) 15%, transparent);
  }
}

/* Header */
.bcard-header {
  background: var(--bcard-accent);
  padding: 1.75rem 2rem;
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.bcard-avatar {
  width: 5rem;
  height: 5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  border: 3px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initials {
  font-size: 1.75rem;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.bcard-header-info {
  min-width: 0;
}

.bcard-name {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0;
  color: #fff;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.bcard-title {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  margin: 0.25rem 0 0;
}

.bcard-org {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin: 0.15rem 0 0;
}

/* Contact rows */
.bcard-body {
  padding: 0.5rem 0;
}

.bcard-row {
  display: grid;
  grid-template-columns: 2rem 6rem 1fr;
  align-items: center;
  gap: 0 0.75rem;
  padding: 0.65rem 2rem;
  border-bottom: 1px solid var(--oc-color-border);
  text-decoration: none;
  color: inherit;
}

.bcard-row:last-child {
  border-bottom: none;
}

.bcard-row--link:hover .bcard-row-value {
  color: var(--bcard-accent);
  text-decoration: underline;
}

.bcard-row-icon {
  color: var(--oc-color-text-muted);
  justify-self: center;
}

.bcard-row-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--oc-color-text-muted);
}

.bcard-row-value {
  font-size: 0.9rem;
  color: var(--oc-color-text-default);
  word-break: break-word;
}

.bcard-row-value--note {
  white-space: pre-wrap;
  font-size: 0.85rem;
}

/* Action toolbar */
.bcard-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 2rem;
  border-top: 1px solid var(--oc-color-border);
  background: color-mix(in srgb, var(--bcard-accent) 5%, var(--oc-color-background-highlight));
}

.bcard-toolbar-spacer {
  flex: 1;
}

/* --- Detail cards --- */
.detail-cards {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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

.detail-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.detail-category-chip {
  display: inline-block;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  background: transparent;
  border: 1.5px solid var(--oc-color-swatch-brand-default);
  color: var(--oc-color-swatch-brand-default);
  line-height: 1.6;
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
</style>
