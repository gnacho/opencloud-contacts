/**
 * Build a mailto: link for a single address. Characters that would start
 * mailto header fields (?, &, #) or add recipients (,) are percent-encoded,
 * so a crafted address cannot prefill cc/bcc/subject/body.
 */
export function mailtoHref(email: string): string {
  return `mailto:${encodeURIComponent(email.trim()).replace(/%40/g, '@')}`
}

/** Build a tel: link; the number is percent-encoded except for a leading '+'. */
export function telHref(phone: string): string {
  return `tel:${encodeURIComponent(phone.trim()).replace(/%2B/g, '+')}`
}
