import type { Contact } from '../types/contact'

/**
 * Two resources are the same contact only when their href matches. Sharing a
 * vCard UID across different hrefs (an import that copied UIDs, a rename on
 * the server) used to silently drop one contact from the list; the collision
 * is now logged so it can be fixed on the server instead of hiding data.
 */
export function dedupeContacts(contacts: Contact[]): Contact[] {
  const seenHref = new Set<string>()
  const uidHref = new Map<string, string>()
  const out: Contact[] = []

  for (const c of contacts) {
    const href = c.href ?? ''
    if (seenHref.has(href)) continue
    seenHref.add(href)

    const prev = uidHref.get(c.uid)
    if (prev !== undefined && prev !== href) {
      console.warn(
        `[contacts] duplicate UID "${c.uid}" on ${href || '(no href)'} (already on ${prev}); keeping both so none is hidden`
      )
    } else {
      uidHref.set(c.uid, href)
    }
    out.push(c)
  }

  return out
}
