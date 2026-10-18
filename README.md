# Play notes, see them bloom

A piano trainer for a MIDI keyboard. Open a `.mid` file, play live, or practise
with learn mode. A small keyboard can use a range inside the full 88-key piano,
and the Golden Hour and Rainy Study scenes set the room.

Everything runs in the browser. Nothing is uploaded.

```bash
npm install
npm run dev
```

`npm test` runs the unit suite. `npm run test:e2e` builds the app and runs Playwright.

The link-preview image is `public/og.png` (and `public/og.svg`). Favicons live in
`public/icons/`. `npm run icons` rasterises `design/icons/`, and `node scripts/build-og.mjs`
redraws the link-preview card.

Saved settings use `midee.*` keys in localStorage and an IndexedDB named `midee`.
Those names stay so existing range, key-light, and learn data keep working.
