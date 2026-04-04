<template>
  <oc-modal
    :title="$gettext('Edit contact')"
    :button-cancel-text="$gettext('Cancel')"
    :button-confirm-text="saving ? $gettext('Saving…') : $gettext('Save')"
    :button-confirm-disabled="saving"
    size="medium"
    @cancel="$emit('close')"
    @confirm="save"
  >
    <template #content>
      <div class="edit-form">

        <!-- Photo -->
        <div class="edit-avatar-row">
          <avatar-upload v-model="form.photoUrl" :display-name="form.displayName || '?'" />
        </div>

        <!-- Name -->
        <fieldset class="edit-section">
          <legend class="edit-section-title">{{ $gettext('Name') }}</legend>
          <div class="edit-row edit-row-2">
            <div class="edit-field">
              <label>{{ $gettext('First name') }}</label>
              <input v-model="form.firstName" type="text" class="oc-text-input" />
            </div>
            <div class="edit-field">
              <label>{{ $gettext('Last name') }}</label>
              <input v-model="form.lastName" type="text" class="oc-text-input" />
            </div>
          </div>
          <div class="edit-row edit-row-2">
            <div class="edit-field">
              <label>{{ $gettext('Display name') }}</label>
              <input v-model="form.displayName" type="text" class="oc-text-input" />
            </div>
            <div class="edit-field">
              <label>{{ $gettext('Nickname') }}</label>
              <input v-model="form.nickname" type="text" class="oc-text-input" />
            </div>
          </div>
        </fieldset>

        <!-- Organisation -->
        <fieldset class="edit-section">
          <legend class="edit-section-title">{{ $gettext('Organisation') }}</legend>
          <div class="edit-row edit-row-2">
            <div class="edit-field">
              <label>{{ $gettext('Organisation') }}</label>
              <input v-model="form.organization" type="text" class="oc-text-input" />
            </div>
            <div class="edit-field">
              <label>{{ $gettext('Title') }}</label>
              <input v-model="form.title" type="text" class="oc-text-input" />
            </div>
          </div>
        </fieldset>

        <!-- Emails -->
        <fieldset class="edit-section">
          <legend class="edit-section-title">{{ $gettext('Emails') }}</legend>
          <div v-for="(email, i) in form.emails" :key="i" class="edit-row edit-row-dynamic">
            <select v-model="email.type" class="oc-select edit-type-select">
              <option value="INTERNET">{{ $gettext('Email') }}</option>
              <option value="WORK">{{ $gettext('Work') }}</option>
              <option value="HOME">{{ $gettext('Home') }}</option>
            </select>
            <input v-model="email.value" type="email" class="oc-text-input edit-grow" :placeholder="$gettext('Email address')" />
            <oc-button appearance="raw" class="edit-remove-btn" @click="form.emails.splice(i, 1)">
              <oc-icon name="close" size="small" />
            </oc-button>
          </div>
          <oc-button appearance="outline" size="small" @click="form.emails.push({ value: '', type: 'INTERNET' })">
            <oc-icon name="add" size="small" />
            {{ $gettext('Add email') }}
          </oc-button>
        </fieldset>

        <!-- Phones -->
        <fieldset class="edit-section">
          <legend class="edit-section-title">{{ $gettext('Phones') }}</legend>
          <div v-for="(phone, i) in form.phones" :key="i" class="edit-row edit-row-dynamic">
            <select v-model="phone.type" class="oc-select edit-type-select">
              <option value="CELL">{{ $gettext('Mobile') }}</option>
              <option value="WORK">{{ $gettext('Work') }}</option>
              <option value="HOME">{{ $gettext('Home') }}</option>
              <option value="FAX">{{ $gettext('Fax') }}</option>
            </select>
            <input v-model="phone.value" type="tel" class="oc-text-input edit-grow" :placeholder="$gettext('Phone number')" />
            <oc-button appearance="raw" class="edit-remove-btn" @click="form.phones.splice(i, 1)">
              <oc-icon name="close" size="small" />
            </oc-button>
          </div>
          <oc-button appearance="outline" size="small" @click="form.phones.push({ value: '', type: 'CELL' })">
            <oc-icon name="add" size="small" />
            {{ $gettext('Add phone') }}
          </oc-button>
        </fieldset>

        <!-- Addresses -->
        <fieldset class="edit-section">
          <legend class="edit-section-title">{{ $gettext('Addresses') }}</legend>
          <div v-for="(addr, i) in form.addresses" :key="i" class="edit-address-block">
            <div class="edit-address-header">
              <select v-model="addr.type" class="oc-select edit-type-select">
                <option value="HOME">{{ $gettext('Home') }}</option>
                <option value="WORK">{{ $gettext('Work') }}</option>
              </select>
              <oc-button appearance="raw" class="edit-remove-btn" @click="form.addresses.splice(i, 1)">
                <oc-icon name="close" size="small" />
              </oc-button>
            </div>
            <input v-model="addr.street" type="text" class="oc-text-input" :placeholder="$gettext('Street')" />
            <div class="edit-row edit-row-2">
              <input v-model="addr.postalCode" type="text" class="oc-text-input" :placeholder="$gettext('Postal code')" />
              <input v-model="addr.city" type="text" class="oc-text-input" :placeholder="$gettext('City')" />
            </div>
            <div class="edit-row edit-row-2">
              <input v-model="addr.region" type="text" class="oc-text-input" :placeholder="$gettext('Region')" />
              <input v-model="addr.country" type="text" class="oc-text-input" :placeholder="$gettext('Country')" />
            </div>
          </div>
          <oc-button appearance="outline" size="small" @click="form.addresses.push({ type: 'HOME' })">
            <oc-icon name="add" size="small" />
            {{ $gettext('Add address') }}
          </oc-button>
        </fieldset>

        <!-- Groups -->
        <fieldset class="edit-section">
          <legend class="edit-section-title">{{ $gettext('Groups') }}</legend>
          <datalist id="known-groups-edit">
            <option v-for="g in knownGroups" :key="g" :value="g" />
          </datalist>
          <div v-for="(cat, i) in form.categories" :key="i" class="edit-row edit-row-dynamic" style="margin-top: 0.5rem">
            <input v-model="form.categories[i]" type="text" list="known-groups-edit" class="oc-text-input edit-grow" :placeholder="$gettext('Group name')" />
            <oc-button appearance="raw" class="edit-remove-btn" @click="form.categories.splice(i, 1)">
              <oc-icon name="close" size="small" />
            </oc-button>
          </div>
          <oc-button appearance="outline" size="small" style="margin-top: 0.5rem" @click="form.categories.push('')">
            <oc-icon name="add" size="small" />
            {{ $gettext('Add group') }}
          </oc-button>
        </fieldset>

        <!-- More -->
        <fieldset class="edit-section">
          <legend class="edit-section-title">{{ $gettext('More') }}</legend>
          <div class="edit-field" style="margin-top: 0.5rem">
            <label>{{ $gettext('Birthday') }}</label>
            <input v-model="form.birthday" type="date" class="oc-text-input" style="max-width: 14rem" />
          </div>
          <div v-for="(url, i) in form.websites" :key="i" class="edit-row edit-row-dynamic" style="margin-top: 0.5rem">
            <input v-model="form.websites[i]" type="url" class="oc-text-input edit-grow" :placeholder="$gettext('https://…')" />
            <oc-button appearance="raw" class="edit-remove-btn" @click="form.websites.splice(i, 1)">
              <oc-icon name="close" size="small" />
            </oc-button>
          </div>
          <oc-button appearance="outline" size="small" style="margin-top: 0.5rem" @click="form.websites.push('')">
            <oc-icon name="add" size="small" />
            {{ $gettext('Add website') }}
          </oc-button>
          <div class="edit-field" style="margin-top: 0.5rem">
            <label>{{ $gettext('Notes') }}</label>
            <textarea v-model="form.note" class="oc-textarea" rows="3" />
          </div>
        </fieldset>

        <p v-if="saveError" class="edit-error">{{ saveError }}</p>
      </div>
    </template>
  </oc-modal>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useGettext } from 'vue3-gettext'
import { useCardDAV } from '../composables/useCardDAV'
import { useContactStore } from '../composables/useContactStore'
import { contactToVCard } from '../utils/vcard-builder'
import type { Contact, ContactEmail, ContactPhone, ContactAddress } from '../types/contact'
import AvatarUpload from './AvatarUpload.vue'

const props = defineProps<{ contact: Contact }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', contact: Contact): void }>()

const { $gettext } = useGettext()
const { updateContact } = useCardDAV()
const { contacts, knownGroups, setContacts } = useContactStore()

const saving = ref(false)
const saveError = ref('')

// Convert birthday from YYYYMMDD to YYYY-MM-DD for <input type="date">
function toDateInput(bday?: string): string {
  if (!bday) return ''
  const b = bday.replace(/-/g, '')
  if (b.length === 8) return `${b.slice(0, 4)}-${b.slice(4, 6)}-${b.slice(6, 8)}`
  return bday
}

const form = reactive({
  firstName: props.contact.firstName ?? '',
  lastName: props.contact.lastName ?? '',
  displayName: props.contact.displayName,
  nickname: props.contact.nickname ?? '',
  organization: props.contact.organization ?? '',
  title: props.contact.title ?? '',
  emails: props.contact.emails.map((e) => ({ ...e })) as ContactEmail[],
  phones: props.contact.phones.map((p) => ({ ...p })) as ContactPhone[],
  addresses: props.contact.addresses.map((a) => ({ ...a })) as ContactAddress[],
  birthday: toDateInput(props.contact.birthday),
  websites: (props.contact.websites ?? []).map((u) => u),
  categories: (props.contact.categories ?? ['Alle']).map((c) => c),
  note: props.contact.note ?? '',
  photoUrl: props.contact.photoUrl ?? ''
})

async function save() {
  saving.value = true
  saveError.value = ''

  // Derive display name if empty
  const displayName =
    form.displayName.trim() ||
    [form.firstName, form.lastName].filter(Boolean).join(' ') ||
    form.organization ||
    form.emails[0]?.value ||
    'Unknown'

  const updated: Contact = {
    ...props.contact,
    firstName: form.firstName.trim() || undefined,
    lastName: form.lastName.trim() || undefined,
    displayName,
    nickname: form.nickname.trim() || undefined,
    organization: form.organization.trim() || undefined,
    title: form.title.trim() || undefined,
    emails: form.emails.filter((e) => e.value.trim()),
    phones: form.phones.filter((p) => p.value.trim()),
    addresses: form.addresses.filter((a) =>
      a.street || a.city || a.postalCode || a.country || a.region
    ),
    birthday: form.birthday || undefined,
    websites: form.websites.map((u) => u.trim()).filter(Boolean) || undefined,
    categories: form.categories.map((c) => c.trim()).filter(Boolean) || undefined,
    note: form.note.trim() || undefined,
    photoUrl: form.photoUrl || undefined
  }

  try {
    if (!updated.href) throw new Error('No CardDAV URL for this contact')
    const vcard = contactToVCard(updated)
    await updateContact(updated.href, vcard)

    // Update store
    const idx = contacts.value.findIndex((c) => c.uid === updated.uid)
    if (idx !== -1) {
      const newList = [...contacts.value]
      newList[idx] = { ...updated, raw: vcard }
      setContacts(newList)
    }

    emit('saved', updated)
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.edit-avatar-row {
  display: flex;
  justify-content: center;
  padding: 0.5rem 0;
}

.edit-section {
  border: 1px solid var(--oc-color-border);
  border-radius: 0.375rem;
  padding: 0.75rem 1rem 1rem;
  margin: 0;
}

.edit-section-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--oc-color-text-muted);
  padding: 0 0.25rem;
}

.edit-row {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
  align-items: center;
}

.edit-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.edit-row-dynamic {
  display: flex;
  align-items: center;
}

.edit-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.edit-field label {
  font-size: 0.8rem;
  color: var(--oc-color-text-muted);
}

.edit-grow {
  flex: 1;
}

.edit-remove-btn {
  flex-shrink: 0;
  color: var(--oc-color-swatch-danger-default);
}

.edit-address-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: var(--oc-color-background-highlight);
  border-radius: 0.25rem;
}

.edit-address-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.oc-text-input,
.oc-textarea,
.edit-type-select {
  border-radius: 0.25rem;
  font-size: 0.9rem;
  padding: 0.4rem 0.6rem;
  font-family: inherit;
  border: 1px solid #999;
  background: #f5f5f5;
  color: #1a1a1a;
}

@media (prefers-color-scheme: dark) {
  .oc-text-input,
  .oc-textarea,
  .edit-type-select {
    background: #2a2a2a;
    color: #e8e8e8;
    border-color: #666;
  }

  .oc-text-input::placeholder,
  .oc-textarea::placeholder {
    color: #888;
  }
}

.oc-text-input { width: 100%; }
.oc-textarea { width: 100%; resize: vertical; }
.edit-type-select { width: 8rem; flex-shrink: 0; }

.oc-text-input:focus,
.oc-textarea:focus,
.edit-type-select:focus {
  outline: none;
  border-color: #4d9de0;
  box-shadow: 0 0 0 2px rgba(77,157,224,0.35);
}

.oc-text-input::placeholder,
.oc-textarea::placeholder {
  color: #aaa;
}

.edit-error {
  color: var(--oc-color-swatch-danger-default);
  font-size: 0.9rem;
  margin: 0;
}
</style>
