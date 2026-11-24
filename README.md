# Snap1280

Camera page that saves a center-cropped JPEG with a shortest edge of 1280px. Camera outputs 1280×2276 portrait or 2276×1280 landscape, A4 outputs 1280×1810 portrait or 1810×1280 landscape, and Square remains 1280×1280. On compact touch devices, rotating to landscape moves controls to the right of the preview and saves a landscape photo; the preview frame uses the same aspect ratio and crop as the saved JPEG.

## Layout

- `src/` — app source (`index.html`, `styles.css`, `app.js`, `photo.js`)
- `docs/` — built static site for GitHub Pages

```bash
node build.mjs
```

Built by grok.

Live site: https://makzan.github.io/snap1280/
