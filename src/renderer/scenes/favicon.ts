// The document ships the Golden Hour favicon for crawlers. Once the scene is
// known, the icon links follow it. The manifest and the apple-touch icon
// stay on Golden Hour.

const GOLDEN: Record<string, string> = {
  svg: '/icons/favicon.svg',
  '16x16': '/icons/favicon-16.png',
  '32x32': '/icons/favicon-32.png',
  '96x96': '/icons/favicon-96.png',
}

const RAINY: Record<string, string> = {
  svg: '/icons/rainy/favicon.svg',
  '16x16': '/icons/rainy/favicon-16.png',
  '32x32': '/icons/rainy/favicon-32.png',
  '96x96': '/icons/rainy/favicon-96.png',
}

const AFTER: Record<string, string> = {
  svg: '/icons/after-hours/favicon.svg',
  '16x16': '/icons/after-hours/favicon-16.png',
  '32x32': '/icons/after-hours/favicon-32.png',
  '96x96': '/icons/after-hours/favicon-96.png',
}

const NIGHT: Record<string, string> = {
  svg: '/icons/night/favicon.svg',
  '16x16': '/icons/night/favicon-16.png',
  '32x32': '/icons/night/favicon-32.png',
  '96x96': '/icons/night/favicon-96.png',
}

function slot(link: HTMLLinkElement): string | null {
  if (link.type === 'image/svg+xml') return 'svg'
  const sizes = link.getAttribute('sizes')
  if (sizes && sizes in GOLDEN) return sizes
  return null
}

export function applySceneFavicon(scene: string | undefined): void {
  const table =
    scene === 'rainy-study'
      ? RAINY
      : scene === 'after-hours'
        ? AFTER
        : scene === 'night'
          ? NIGHT
          : GOLDEN
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
    const key = slot(link)
    if (!key) continue
    const href = table[key]
    if (href && link.getAttribute('href') !== href) link.setAttribute('href', href)
  }
}
