import type { Contact, ContactEmail, ContactPhone } from '../types/contact'

export interface DuplicateGroup {
  key: string
  contacts: Contact[]
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

export function findDuplicates(contacts: Contact[]): DuplicateGroup[] {
  const groups = new Map<string, Contact[]>()

  for (const contact of contacts) {
    const key = normalize(contact.displayName)
    if (!key) continue
    const group = groups.get(key)
    if (group) {
      group.push(contact)
    } else {
      groups.set(key, [contact])
    }
  }

  return Array.from(groups.entries())
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({ key, contacts: members }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Merge selected contacts into one. The first contact in the array is the
 * base: its uid, href and name fields are kept. Multi-value fields are
 * unioned and deduplicated; scalar fields take the first non-empty value.
 */
export function mergeContacts(selected: Contact[]): Contact {
  const base = selected[0]

  const emailsSeen = new Set<string>()
  const emails: ContactEmail[] = []
  for (const c of selected) {
    for (const e of c.emails) {
      const key = e.value.toLowerCase()
      if (!emailsSeen.has(key)) { emailsSeen.add(key); emails.push(e) }
    }
  }

  const phonesSeen = new Set<string>()
  const phones: ContactPhone[] = []
  for (const c of selected) {
    for (const p of c.phones) {
      const key = p.value.replace(/\D/g, '')
      if (!phonesSeen.has(key)) { phonesSeen.add(key); phones.push(p) }
    }
  }

  const categoriesSet = new Set<string>()
  for (const c of selected) for (const cat of c.categories ?? []) categoriesSet.add(cat)

  const websitesSet = new Set<string>()
  for (const c of selected) for (const w of c.websites ?? []) websitesSet.add(w)

  // Addresses: keep all (no reliable dedup key)
  const addresses = selected.flatMap((c) => c.addresses)

  function first<K extends keyof Contact>(key: K): Contact[K] | undefined {
    for (const c of selected) {
      const v = c[key]
      if (v !== undefined && v !== null && v !== '') return v as Contact[K]
    }
    return undefined
  }

  return {
    ...base,
    emails,
    phones,
    addresses,
    categories: [...categoriesSet],
    websites: [...websitesSet],
    organization: first('organization'),
    department: first('department'),
    title: first('title'),
    nickname: first('nickname'),
    note: first('note'),
    birthday: first('birthday'),
    photoUrl: first('photoUrl'),
    custom1: first('custom1'),
    custom2: first('custom2'),
    custom3: first('custom3'),
    custom4: first('custom4'),
  }
}
