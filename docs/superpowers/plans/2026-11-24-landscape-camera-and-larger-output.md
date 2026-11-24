# Landscape Camera and Larger Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 1280px the shortest output edge and add a phone landscape layout whose preview and saved JPEG both switch to landscape dimensions.

**Architecture:** `photo.js` owns portrait base dimensions and resolves them into a final preset for the current orientation. `app.js` owns the media-query state and passes one resolved preset through preview, upload, and capture; `index.html` and `styles.css` turn the same compact-phone media query into a left-preview/right-controls layout.

**Tech Stack:** Browser JavaScript modules, Canvas 2D, CSS Grid and media queries, Node.js built-in test runner.

---

## File structure

- Modify `src/photo.js`: minimum-edge dimensions, orientation resolver, existing crop/JPEG encoding.
- Modify `src/app.js`: shared orientation state, dynamic selector labels, resolved preset at capture time.
- Modify `src/index.html`: explicit camera layout and controls containers; move the shutter out of the stage.
- Modify `src/styles.css`: portrait control layout and compact-phone landscape grid.
- Modify `tests/photo.test.mjs`: exact portrait/landscape dimensions and crop coverage.
- Modify `tests/app.test.mjs`: fake media query, rotation, upload, and live-capture behavior.
- Modify `README.md`: current output sizes and landscape behavior.
- Modify `docs/index.html`: regenerate the deployable inline build with `node build.mjs`.

### Task 1: Resolve minimum-edge portrait and landscape presets

**Files:**
- Modify: `src/photo.js:1-7`
- Test: `tests/photo.test.mjs`

- [ ] **Step 1: Replace the preset test with failing portrait and landscape assertions**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { MIN_EDGE, PHOTO_PRESETS, centerCrop, encodeFitted, resolvePreset } from "../src/photo.js";

test("presets use a 1280px shortest edge in portrait and landscape", () => {
  assert.equal(MIN_EDGE, 1280);
  assert.deepEqual(
    Object.fromEntries(Object.keys(PHOTO_PRESETS).map((key) => {
      const portrait = resolvePreset(key);
      const landscape = resolvePreset(key, true);
      return [key, {
        portrait: [portrait.width, portrait.height],
        landscape: [landscape.width, landscape.height],
      }];
    })),
    {
      camera: { portrait: [1280, 2276], landscape: [2276, 1280] },
      a4: { portrait: [1280, 1810], landscape: [1810, 1280] },
      square: { portrait: [1280, 1280], landscape: [1280, 1280] },
    },
  );
  assert.equal(resolvePreset("camera").label, "Camera portrait");
  assert.equal(resolvePreset("camera", true).label, "Camera landscape");
  assert.equal(resolvePreset("square", true).label, "Square");
  assert.throws(() => resolvePreset("missing"), /Unknown photo preset/);
});
```

Keep the existing crop validation tests. Replace the dimensions in `encodeFitted uses exact preset dimensions and centered source geometry` with resolved presets:

```js
for (const key of Object.keys(PHOTO_PRESETS)) {
  for (const landscape of [false, true]) {
    const preset = resolvePreset(key, landscape);
    const photo = await encodeFitted({}, 1600, 900, preset);
    assert.equal(photo.width, preset.width, key);
    assert.equal(photo.height, preset.height, key);
    assert.equal(photo.blob.type, "image/jpeg", key);
  }
}
```

After the loop, assert six draws and check the first portrait camera crop against its new target ratio by comparing the actual crop to `centerCrop(1600, 900, 1280, 2276)` rather than hard-coding the old crop:

```js
assert.equal(drawCalls.length, 6);
const crop = centerCrop(1600, 900, 1280, 2276);
assert.deepEqual(drawCalls[0].slice(1), [crop.x, crop.y, crop.width, crop.height, 0, 0, 1280, 2276]);
```

- [ ] **Step 2: Run the photo tests and confirm the new API is missing**

Run: `node --test tests/photo.test.mjs`

Expected: FAIL before application code loads because `resolvePreset` is not exported.

- [ ] **Step 3: Implement minimum-edge presets and orientation resolution**

Replace the constants and preset declarations at the top of `src/photo.js` with:

```js
export const MIN_EDGE = 1280;
export const JPEG_QUALITY = 0.9;
export const PHOTO_PRESETS = {
  camera: { label: "Camera", width: MIN_EDGE, height: Math.round(MIN_EDGE * 16 / 9) },
  a4: { label: "A4", width: MIN_EDGE, height: Math.round(MIN_EDGE * 1280 / 905) },
  square: { label: "Square", width: MIN_EDGE, height: MIN_EDGE },
};

export function resolvePreset(key, landscape = false) {
  const preset = PHOTO_PRESETS[key];
  if (!preset) throw new Error("Unknown photo preset");
  const square = preset.width === preset.height;
  return {
    ...preset,
    label: square ? preset.label : `${preset.label} ${landscape ? "landscape" : "portrait"}`,
    width: landscape ? preset.height : preset.width,
    height: landscape ? preset.width : preset.height,
  };
}
```

Leave `centerCrop`, `encodeFitted`, and download behavior unchanged.

- [ ] **Step 4: Run the photo tests**

Run: `node --test tests/photo.test.mjs`

Expected: all photo tests PASS, including six encode calls and exact `1280×2276`, `1280×1810`, and `1280×1280` portrait outputs.

- [ ] **Step 5: Commit the isolated photo sizing change**

```bash
git add src/photo.js tests/photo.test.mjs
git commit -m "feat: make 1280px the shortest photo edge"
```

### Task 2: Synchronize orientation, preview, upload, and capture

**Files:**
- Modify: `src/app.js`
- Test: `tests/app.test.mjs`

- [ ] **Step 1: Add a controllable media query to the app test setup**

Before importing `src/app.js`, replace the current `globalThis.window` assignment with:

```js
const mediaListeners = new Set();
const landscapeMedia = {
  matches: false,
  addEventListener(type, listener) {
    if (type === "change") mediaListeners.add(listener);
  },
};
globalThis.window = {
  isSecureContext: true,
  matchMedia(query) {
    assert.equal(query, "(orientation: landscape) and (max-height: 600px) and (pointer: coarse)");
    return landscapeMedia;
  },
};
async function setLandscape(matches) {
  landscapeMedia.matches = matches;
  for (const listener of mediaListeners) listener({ matches });
  await new Promise((resolve) => setImmediate(resolve));
}
```

Update the selector test to use the new portrait dimensions, then add rotation assertions:

```js
test("selector, preview, and badge share the selected preset and orientation", async () => {
  assert.deepEqual(elements.ratio.children.map((option) => option.value), ["camera", "a4", "square"]);
  assert.equal(elements.ratio.value, "camera");
  assert.equal(elements.stage.style.values.get("--frame-aspect"), String(1280 / 2276));
  assert.equal(elements.size.textContent, "1280×2276");

  await setLandscape(true);
  assert.equal(elements.stage.style.values.get("--frame-aspect"), String(2276 / 1280));
  assert.equal(elements.size.textContent, "2276×1280");
  assert.equal(elements.ratio.children[0].textContent, "Camera landscape — 2276×1280");

  elements.ratio.value = "a4";
  await elements.ratio.dispatch("change");
  assert.equal(elements.stage.style.values.get("--frame-aspect"), String(1810 / 1280));
  assert.equal(elements.size.textContent, "1810×1280");

  elements.ratio.value = "square";
  await elements.ratio.dispatch("change");
  assert.equal(elements.stage.style.values.get("--frame-aspect"), "1");
  assert.equal(elements.size.textContent, "1280×1280");
  await setLandscape(false);
});
```

- [ ] **Step 2: Update upload and live-capture expectations and add a rotation capture**

Use these source and expected values in the upload test:

```js
const sources = { camera: [1600, 900], a4: [900, 1600], square: [1000, 1000] };
const expected = { camera: [1280, 2276], a4: [1280, 1810], square: [1280, 1280] };
```

After the existing three-iteration upload loop, replace its old download count with this landscape upload check:

```js
await setLandscape(true);
elements.ratio.value = "camera";
await elements.ratio.dispatch("change");
elements.file.files = [new Blob(["image"], { type: "image/png" })];
await elements.file.dispatch("change");
assert.deepEqual([canvases.at(-1).width, canvases.at(-1).height], [2276, 1280]);
assert.equal(downloads.length, 4);
await setLandscape(false);
```

In the camera test, change the final output loop to:

```js
for (const [key, button, width, height] of [
  ["square", elements.btnCapture, 1280, 1280],
  ["a4", elements.btnShutter, 1280, 1810],
]) {
  elements.ratio.value = key;
  await elements.ratio.dispatch("change");
  await button.dispatch("click");
  assert.deepEqual([canvases.at(-1).width, canvases.at(-1).height], [width, height]);
}

await setLandscape(true);
elements.ratio.value = "camera";
await elements.ratio.dispatch("change");
await elements.btnShutter.dispatch("click");
assert.deepEqual([canvases.at(-1).width, canvases.at(-1).height], [2276, 1280]);
assert.equal(elements.shots.children[0].children[1].textContent.startsWith("2276×1280"), true);
assert.equal(downloads.length, 7);
await setLandscape(false);
```

Also assert that the camera request still asks for a high-resolution source:

```js
assert.equal(constraints.video.width.ideal, 2560);
```

Put that assertion inside the existing fake `getUserMedia(constraints)` before returning the stream.

- [ ] **Step 3: Run app tests and confirm the old orientation-independent code fails**

Run: `node --test tests/app.test.mjs`

Expected: FAIL because `window.matchMedia` is not used, dimensions remain the old values, and rotation does not update the stage.

- [ ] **Step 4: Implement one resolved-preset path in `src/app.js`**

Change the import and initialization to:

```js
import {
  MIN_EDGE,
  PHOTO_PRESETS,
  encodeFitted,
  formatBytes,
  resolvePreset,
  triggerDownload,
} from "./photo.js";

const LANDSCAPE_QUERY = "(orientation: landscape) and (max-height: 600px) and (pointer: coarse)";
const landscapeMedia = window.matchMedia(LANDSCAPE_QUERY);
```

Replace the initial option-generation loop and its following `ratioSelect.value = presetKey;` assignment with these function definitions. Do not invoke `renderPresetOptions()` until the listener-registration block below:

```js
function currentPreset() {
  return resolvePreset(presetKey, landscapeMedia.matches);
}

function renderPresetOptions() {
  ratioSelect.replaceChildren();
  for (const key of Object.keys(PHOTO_PRESETS)) {
    const preset = resolvePreset(key, landscapeMedia.matches);
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${preset.label} — ${preset.width}×${preset.height}`;
    ratioSelect.append(option);
  }
  ratioSelect.value = presetKey;
}
```

In `syncPreviewFrame`, replace `PHOTO_PRESETS[presetKey]` with `currentPreset()`. In `startCamera`, request `width: { ideal: MIN_EDGE * 2 }`.

At the beginning of each capture/upload operation, freeze the selected dimensions for that operation. Replace both complete functions with:

```js
async function captureLive() {
  if (busy || video.readyState < 2) return;
  const preset = currentPreset();
  busy = true;
  setCaptureDisabled(true);
  flashEl.classList.add("on");
  setTimeout(() => flashEl.classList.remove("on"), 90);
  try {
    const photo = await encodeFitted(video, video.videoWidth, video.videoHeight, preset);
    await savePhoto(photo);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Capture failed", true);
  } finally {
    busy = false;
    setCaptureDisabled(!(stream && video.readyState >= 2));
  }
}

async function handleFile(file) {
  if (!file || busy) return;
  const preset = currentPreset();
  busy = true;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const photo = await encodeFitted(bitmap, bitmap.width, bitmap.height, preset);
      await savePhoto(photo);
    } finally {
      bitmap.close();
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Upload failed", true);
  } finally {
    busy = false;
    fileInput.value = "";
  }
}
```

Register orientation handling near the other listeners and initialize in this order:

```js
landscapeMedia.addEventListener("change", () => {
  renderPresetOptions();
  syncPreviewFrame();
});

renderPresetOptions();
syncPreviewFrame();
if (!window.isSecureContext) setStatus("Insecure", "insecure");
else setStatus("Ready");
```

- [ ] **Step 5: Run all tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests PASS; orientation changes update options and preview without another `getUserMedia` call, and the final landscape capture is `2276×1280`.

- [ ] **Step 6: Commit orientation behavior**

```bash
git add src/app.js tests/app.test.mjs
git commit -m "feat: synchronize camera output with phone orientation"
```

### Task 3: Put landscape controls beside the preview

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles.css`

- [ ] **Step 1: Add the shared camera and controls containers**

Wrap the existing stage and controls as follows. Keep all existing IDs and element types unchanged so app behavior and tests remain valid:

```html
<div class="camera-layout">
  <div class="stage-slot">
    <div class="stage" id="stage">
      <div class="placeholder" id="placeholder">
        <div>
          <div>Camera preview</div>
          <div>Allow camera, or upload an image</div>
        </div>
      </div>
      <video id="video" playsinline muted autoplay hidden></video>
      <div class="flash" id="flash"></div>
      <div class="badge left" id="status">Idle</div>
      <div class="badge right" id="size" hidden></div>
    </div>
  </div>

  <div class="controls">
    <button type="button" class="shutter" id="btnShutter" aria-label="Capture photo" disabled></button>
    <div class="bar">
      <label class="ratio-control" for="ratio">Ratio</label>
      <select id="ratio" aria-label="Photo aspect ratio"></select>
      <button type="button" class="primary" id="btnCapture" disabled>Capture</button>
      <button type="button" id="btnFlip" disabled>Flip camera</button>
      <button type="button" id="btnStart">Start camera</button>
      <label class="file-btn" for="file">Upload image</label>
      <input type="file" id="file" accept="image/*" />
    </div>
    <div class="toast" id="toast" aria-live="polite"></div>
  </div>
</div>
<div class="shots" id="shots"></div>
```

Update the metadata text from longest side to shortest side:

```html
<meta name="description" content="Auto-save JPEG · shortest side 1280px. Preview matches the saved photo." />
<p class="tagline">Auto-save JPEG · shortest side 1280px</p>
```

- [ ] **Step 2: Adapt the shutter to its new controls container**

Replace the absolute positioning declarations in `button.shutter` with:

```css
button.shutter {
  display: block;
  width: 72px;
  height: 72px;
  margin: 16px auto 0;
  padding: 0;
  border: 3px solid rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
}
```

Change the active transform to `transform: scale(0.94);`. Keep the existing circular `::after` and focus-visible styles. Add `.controls { min-width: 0; }` beside the `.bar` rule.

- [ ] **Step 3: Add the compact-phone landscape layout**

Append this exact media query to `src/styles.css`:

```css
@media (orientation: landscape) and (max-height: 600px) and (pointer: coarse) {
  .wrap {
    --safe-top: max(8px, env(safe-area-inset-top));
    --safe-right: max(8px, env(safe-area-inset-right));
    --safe-bottom: max(8px, env(safe-area-inset-bottom));
    --safe-left: max(8px, env(safe-area-inset-left));
    max-width: none;
    padding: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left);
  }

  header,
  footer { display: none; }

  .camera-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(132px, 180px);
    gap: 12px;
    height: calc(100dvh - var(--safe-top) - var(--safe-bottom));
  }

  .stage-slot {
    align-items: center;
    min-width: 0;
    min-height: 0;
  }

  .stage {
    width: auto;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
  }

  .controls {
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow-y: auto;
    min-height: 0;
  }

  button.shutter { flex: 0 0 72px; }

  .bar {
    flex-direction: column;
    align-items: stretch;
    flex-wrap: nowrap;
    gap: 8px;
    margin-top: 12px;
  }

  .bar button,
  .bar select,
  .bar .file-btn {
    justify-content: center;
    width: 100%;
    padding: 9px 8px;
    text-align: center;
  }

  .ratio-control { text-align: center; }
  .toast { text-align: center; }
  .shots { margin-top: 16px; }
}
```

The page may scroll to existing thumbnails below the full-height camera layout. The controls themselves scroll independently if a short screen cannot fit them.

- [ ] **Step 4: Run regression tests and inspect responsive CSS**

Run: `node --test tests/*.test.mjs && git diff --check`

Expected: all tests PASS and no whitespace errors. Inspect the page at a touch-enabled landscape viewport no taller than 600px: preview is left, every control including the shutter is right, and no control overlaps the video. Rotate to portrait and confirm the single-column layout returns.

- [ ] **Step 5: Commit the responsive interface**

```bash
git add src/index.html src/styles.css
git commit -m "feat: add phone landscape camera layout"
```

### Task 4: Update documentation, build, and verify the deliverable

**Files:**
- Modify: `README.md`
- Modify: `docs/index.html` (generated)

- [ ] **Step 1: Document the new output behavior**

Replace the opening README paragraph with:

```md
Camera page that saves a center-cropped JPEG with a shortest edge of 1280px. Camera outputs 1280×2276 portrait or 2276×1280 landscape, A4 outputs 1280×1810 portrait or 1810×1280 landscape, and Square remains 1280×1280. On compact touch devices, rotating to landscape moves controls to the right of the preview and saves a landscape photo; the preview frame uses the same aspect ratio and crop as the saved JPEG.
```

- [ ] **Step 2: Run the complete automated verification**

Run: `node --test tests/*.test.mjs && node build.mjs && git diff --check`

Expected: all tests PASS, build prints `wrote docs/index.html`, and the diff has no whitespace errors. Confirm the built file contains the new layout and dimensions:

```bash
node --input-type=module -e 'import { readFile } from "node:fs/promises"; const html = await readFile("docs/index.html", "utf8"); for (const text of ["camera-layout", "2276×1280", "shortest side 1280px", "pointer: coarse"]) { if (!html.includes(text)) throw new Error(`Missing ${text}`); } console.log("built landscape output verified");'
```

Expected: `built landscape output verified`.

- [ ] **Step 3: Exercise the browser scenario on the generated deliverable**

Serve the repository with `python3 -m http.server 8000` and open `http://localhost:8000/docs/` in a touch-enabled mobile device emulator. Use a camera or upload a known landscape image, rotate from portrait to landscape, and capture. Confirm the preview changes to 16:9, controls remain on the right, the downloaded JPEG decodes as `2276×1280`, and returning to portrait restores `1280×2276`. Camera permission requires localhost or HTTPS; do not claim device verification if no browser/device is available.

- [ ] **Step 4: Review generated files and commit the finished change**

Run `git status --short` and ensure only intentional source, test, README, plan, and generated `docs/index.html` changes remain. Remove only temporary artifacts created by this verification. Then commit:

```bash
git add README.md docs/index.html docs/superpowers/plans/2026-11-24-landscape-camera-and-larger-output.md
git commit -m "docs: publish landscape camera output"
```
