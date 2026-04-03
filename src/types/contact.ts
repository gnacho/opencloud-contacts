export interface ContactEmail {
  value: string
  type?: string // WORK, HOME, INTERNET, …
}

export interface ContactPhone {
  value: string
  type?: string // CELL, WORK, HOME, FAX, …
}

export interface ContactAddress {
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
  /** Job title */
  title?: string
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
}
