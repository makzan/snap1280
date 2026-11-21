# Aspect Ratio Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Camera 9:16, A4 portrait, and Square presets with matching center-cropped previews and exact-size JPEG output.

**Architecture:** Keep preset definitions and pure crop geometry in `src/photo.js`; pass the selected preset through the existing capture and upload paths. Use one selector and one preview synchronization function in `src/app.js` so all visible dimensions derive from the same configuration.

**Tech Stack:** Browser JavaScript modules, Canvas 2D, native HTML controls, Node.js built-in test runner.

---

### Task 1: Crop Geometry and Exact-Size Encoding

**Files:**
- Create: `tests/photo.test.mjs`
- Modify: `src/photo.js`

- [ ] **Step 1: Write failing geometry and encoder tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { PHOTO_PRESETS, centerCrop, encodeFitted } from "../src/photo.js";

test("presets define the approved exact output sizes", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PHOTO_PRESETS).map(([key, preset]) => [key, [preset.width, preset.height]])),
    { camera: [720, 1280], a4: [905, 1280], square: [1280, 1280] },
  );
});

test("centerCrop crops a landscape source to a portrait target", () => {
  const crop = centerCrop(1600, 900, 720, 1280);
  assert.equal(crop.x, 546.875);
  assert.equal(crop.y, 0);
  assert.equal(crop.width, 506.25);
  assert.equal(crop.height, 900);
});

test("centerCrop crops a portrait source to a square target", () => {
  assert.deepEqual(centerCrop(900, 1600, 1280, 1280), { x: 0, y: 350, width: 900, height: 900 });
});

test("centerCrop rejects invalid dimensions", () => {
  assert.throws(() => centerCrop(0, 100, 720, 1280), /Invalid image size/);
});

test("encodeFitted uses exact preset dimensions and centered source geometry", async () => {
  const originalDocument = globalThis.document;
  const drawCalls = [];
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            imageSmoothingEnabled: false,
            imageSmoothingQuality: "",
            drawImage(...args) { drawCalls.push(args); },
          };
        },
        toBlob(callback, type) { callback(new Blob(["jpeg"], { type })); },
      };
    },
  };
  try {
    for (const [key, preset] of Object.entries(PHOTO_PRESETS)) {
      const photo = await encodeFitted({}, 1600, 900, preset);
      assert.equal(photo.width, preset.width, key);
      assert.equal(photo.height, preset.height, key);
      assert.equal(photo.blob.type, "image/jpeg", key);
    }
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
  assert.equal(drawCalls.length, 3);
  assert.deepEqual(drawCalls[0].slice(1), [546.875, 0, 506.25, 900, 0, 0, 720, 1280]);
});
```

- [ ] **Step 2: Run tests and confirm the new API is missing**

Run: `node --test tests/photo.test.mjs`
Expected: FAIL because `PHOTO_PRESETS` and `centerCrop` are not exported.

- [ ] **Step 3: Implement presets, crop geometry, and canvas encoding**

Add the shared configuration and pure helper:

```js
export const PHOTO_PRESETS = {
  camera: { label: "Camera 9:16", width: 720, height: 1280 },
  a4: { label: "A4 portrait", width: 905, height: 1280 },
  square: { label: "Square", width: 1280, height: 1280 },
};

export function centerCrop(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    throw new Error("Invalid image size");
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / targetRatio;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}
```

Change `encodeFitted` to accept `preset`, size the canvas from it, and draw using the crop returned by `centerCrop`:

```js
export async function encodeFitted(source, sourceWidth, sourceHeight, preset) {
  const crop = centerCrop(sourceWidth, sourceHeight, preset.width, preset.height);
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, preset.width, preset.height);
  const blob = await canvasToJpeg(canvas);
  return { blob, width: preset.width, height: preset.height, filename: photoFilename() };
}
```

Remove the now-unused `fitMaxEdge`; retain `MAX_EDGE` for the camera constraint.

- [ ] **Step 4: Run tests**

Run: `node --test tests/photo.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit the isolated image-processing change**

```bash
git add src/photo.js tests/photo.test.mjs
git commit -m "feat: add center-cropped photo presets"
```

### Task 2: Ratio Selector and Matching Preview

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles.css`
- Modify: `src/app.js`

- [ ] **Step 1: Add the native selector**

Place this labeled control at the start of the existing `.bar` toolbar:

```html
<label class="ratio-control" for="ratio">Ratio</label>
<select id="ratio" aria-label="Photo aspect ratio"></select>
```

- [ ] **Step 2: Style the selector and crop the preview**

Add `select` to the existing control appearance rule and add a flex rule for `.ratio-control`. Change the stage fallback ratio to `0.5625` and change `video` from `object-fit: contain` to `object-fit: cover`.

- [ ] **Step 3: Connect the shared presets to every path**

Import `PHOTO_PRESETS`, obtain the `ratio` element, and initialize `presetKey` to `camera`. Populate one option per preset:

```js
for (const [key, preset] of Object.entries(PHOTO_PRESETS)) {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = `${preset.label} — ${preset.width}×${preset.height}`;
  ratioSelect.append(option);
}
ratioSelect.value = presetKey;
```

Make `syncPreviewFrame()` derive `--frame-aspect` and the size badge solely from `PHOTO_PRESETS[presetKey]`; it must no longer read video dimensions for sizing. Keep the mirror update and remove the size badge hiding in `stopStream()`.

Pass `PHOTO_PRESETS[presetKey]` as the fourth argument in both `encodeFitted` calls. Add a `change` listener that updates `presetKey` and calls `syncPreviewFrame()`, and call `syncPreviewFrame()` once during startup.

- [ ] **Step 4: Verify the integrated source**

Run: `node --test tests/photo.test.mjs && node build.mjs`
Expected: all tests PASS and `wrote docs/index.html` is printed.

In a browser, confirm the selector has three options, switching updates the preview and dimensions immediately, the preview fills without distortion, and capture/upload use the selected dimensions.

- [ ] **Step 5: Commit the UI integration**

```bash
git add src/index.html src/styles.css src/app.js docs/index.html
git commit -m "feat: add selectable aspect ratio presets"
```

### Task 3: Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-11-21-aspect-ratio-presets-design.md` only if implementation reveals a spec discrepancy

- [ ] **Step 1: Update the user-facing sizing description**

Replace the opening sizing sentence with:

```markdown
Camera page that saves a center-cropped JPEG in Camera 9:16 (720×1280), A4 portrait (905×1280), or Square (1280×1280). The preview frame uses the same aspect ratio and crop as the photo that is saved.
```

- [ ] **Step 2: Run all automated checks**

Run: `node --test tests/photo.test.mjs && node build.mjs && git diff --check`
Expected: 5 tests PASS, successful build, and no whitespace errors.

- [ ] **Step 3: Exercise real browser flows**

Serve `docs/` over HTTP. For each preset, upload landscape, portrait, and square images and verify the downloaded JPEG dimensions and center crop. Start a real camera where available, switch presets, capture with both Capture buttons, flip the camera, and confirm the saved dimensions and mirrored preview behavior.

- [ ] **Step 4: Commit documentation and the plan**

```bash
git add README.md docs/superpowers/plans/2026-11-21-aspect-ratio-presets.md
git commit -m "docs: document aspect ratio presets"
```

- [ ] **Step 5: Push the completed branch**

Run: `git push`
Expected: the remote `main` branch includes the spec, implementation, tests, generated site, and documentation.
