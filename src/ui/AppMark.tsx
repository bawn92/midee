import { icons } from './icons'

// The header and the landing hero share one mark. The Golden Hour drawing
// stays the inline wordmark. Rainy Study is the designed header tile, shown
// by the scene token on <html>.
export function AppMark(props: { variant?: 'header' | 'landing' }) {
  return (
    <span class="app-mark" classList={{ 'landing-mark': props.variant === 'landing' }}>
      <span class="app-mark__layer app-mark__golden" innerHTML={icons.wordmark()} />
      <img class="app-mark__layer app-mark__rainy" src="/icons/rainy/header-mark.svg" alt="" />
      <img
        class="app-mark__layer app-mark__after"
        src="/icons/after-hours/header-mark.svg"
        alt=""
      />
      <img class="app-mark__layer app-mark__night" src="/icons/night/header-mark.svg" alt="" />
    </span>
  )
}
