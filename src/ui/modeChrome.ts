// Mode switches dismiss floating chrome that belongs to the surface being
// left. Menus, the range card, and the song guide listen for this rather
// than each mode shell knowing about the others.

export const CLOSE_MODE_POPOVERS = 'midee-close-popovers'

export function closeModePopovers(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CLOSE_MODE_POPOVERS))
}
