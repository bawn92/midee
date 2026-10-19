// Top-level layer for tooltips, popovers, dropdowns, and menus. It lives on
// document.body so a backdrop-filter or transform on a glass card cannot
// trap or clip it. The root itself never filters, transforms, or scrolls.

const ROOT_ID = 'overlay-root'

export function overlayRoot(): HTMLElement {
  const existing = document.getElementById(ROOT_ID)
  if (existing) return existing
  const root = document.createElement('div')
  root.id = ROOT_ID
  document.body.appendChild(root)
  return root
}
