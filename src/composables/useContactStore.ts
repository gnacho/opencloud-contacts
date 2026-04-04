import { ref, computed } from 'vue'
import type { Contact } from '../types/contact'

// Shared state between list and detail view
const contacts = ref<Contact[]>([])

// The sorted/filtered list at the time a contact was opened — used for prev/next navigation
const navigationList = ref<Contact[]>([])

// All unique group names across all contacts, sorted alphabetically
const knownGroups = computed<string[]>(() => {
  const groups = new Set<string>()
  for (const c of contacts.value) {
    for (const g of c.categories ?? []) {
      if (g.trim()) groups.add(g.trim())
    }
  }
  return [...groups].sort()
})

export function useContactStore() {
  function findByUid(uid: string): Contact | undefined {
    return contacts.value.find((c) => c.uid === uid)
  }

  function setContacts(list: Contact[]) {
    contacts.value = list
  }

  function setNavigationList(list: Contact[]) {
    navigationList.value = list
  }

  return { contacts, navigationList, knownGroups, findByUid, setContacts, setNavigationList }
}
