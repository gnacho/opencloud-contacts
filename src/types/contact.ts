export interface ContactEmail {
  value: string
  type?: string // WORK, HOME, INTERNET, …
}

export interface ContactPhone {
  value: string
  type?: string // CELL, WORK, HOME, FAX, …
}

export interface ContactAddress {
  poBox?: string // RFC 6350 ADR component 1
  extended?: string // RFC 6350 ADR component 2 (unit, floor, …)
  street?: string
  city?: string
  region?: string
  postalCode?: string
  country?: string
  type?: string // HOME, WORK, …
}

export interface Contact {
  /** Unique identifier – the vCard UID or the href path from CardDAV */
  uid: string
  /** Full CardDAV URL – used for PUT/DELETE */
  href?: string
  /** Server ETag of the stored vCard. Sent as If-Match on update so a change
   *  made by another client surfaces as a 412 instead of being overwritten. */
  etag?: string
  /** Formatted / display name (FN field) */
  displayName: string
  /** Structured name parts */
  firstName?: string
  lastName?: string
  middleName?: string
  prefix?: string
  suffix?: string
  /** Nickname */
  nickname?: string
  /** Organisation */
  organization?: string
  /** Department (part of ORG field) */
  department?: string
  /** Job title */
  title?: string
  /** Custom fields (Thunderbird Benutzerdef. 1–4) */
  custom1?: string
  custom2?: string
  custom3?: string
  custom4?: string
  /** Email addresses */
  emails: ContactEmail[]
  /** Phone numbers */
  phones: ContactPhone[]
  /** Postal addresses */
  addresses: ContactAddress[]
  /** Websites */
  websites?: string[]
  /** Birthday (YYYYMMDD or YYYY-MM-DD) */
  birthday?: string
  /** Raw vCard string (for debugging / future use) */
  raw: string
  /** Data URI or URL for the photo */
  photoUrl?: string
  /** Notes */
  note?: string
  /** Contact groups / categories (CATEGORIES field) */
  categories?: string[]
}
