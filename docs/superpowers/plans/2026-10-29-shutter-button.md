# Preview Shutter Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible 72px circular shutter button at the bottom center of the camera preview while preserving the existing Capture button and capture behavior.

**Architecture:** Add one native button to the existing stage and route it to `captureLive()`. A small state helper keeps both capture controls synchronized; CSS supplies the overlay position and camera-shutter appearance without changing the stage dimensions.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js one-off integration assertions, existing `build.mjs` build.

---

### Task 1: Add the shutter markup and appearance

**Files:**
- Modify: `src/index.html:28-32`
- Modify: `src/styles.css:142-148`

- [ ] **Step 1: Write the failing static UI test**

Run:

```bash
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const html = await readFile('src/index.html', 'utf8');
const css = await readFile('src/styles.css', 'utf8');
assert.match(html, /<button[^>]+id="btnShutter"[^>]+aria-label="Capture photo"[^>]+disabled><\/button>/);
assert.match(css, /button\.shutter\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*16px;[^}]*width:\s*72px;[^}]*height:\s*72px;/s);
console.log('PASS: accessible bottom-center 72px shutter');
NODE
```

- [ ] **Step 2: Run the static UI test and verify RED**

Expected: FAIL because `btnShutter` is absent.

- [ ] **Step 3: Add the button inside the stage**

Add immediately after the size badge in `src/index.html`:

```html
        <button type="button" class="shutter" id="btnShutter" aria-label="Capture photo" disabled></button>
```

- [ ] **Step 4: Add the shutter styles after `button.primary`**

```css
button.shutter {
  position: absolute;
  z-index: 2;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: 72px;
  height: 72px;
  padding: 0;
  border: 3px solid rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
}

button.shutter::after {
  content: "";
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: #fff;
}

button.shutter:active:not(:disabled) {
  transform: translateX(-50%) scale(0.94);
}

button.shutter:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}
```

- [ ] **Step 5: Re-run the static UI test and verify GREEN**

Expected: `PASS: accessible bottom-center 72px shutter`.

- [ ] **Step 6: Commit the UI**

```bash
git add src/index.html src/styles.css
git commit -m "feat: add preview shutter button"
```

### Task 2: Wire synchronized capture behavior

**Files:**
- Modify: `src/app.js:18-20`
- Modify: `src/app.js:41-55`
- Modify: `src/app.js:91-101`
- Modify: `src/app.js:128-157`
- Modify: `src/app.js:181-185`

- [ ] **Step 1: Write the failing behavior test**

Run this one-off integration test against the real app module:

```bash
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const elements = new Map();
const pendingEncoding = [];
const canvases = [];
function element(id = '') {
  return {
    id,
    hidden: false,
    disabled: id === 'btnCapture' || id === 'btnShutter',
    listeners: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    style: { values: {}, setProperty(name, value) { this.values[name] = value; } },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    click() {}, remove() {},
  };
}
function byId(id) {
  if (!elements.has(id)) elements.set(id, element(id));
  return elements.get(id);
}
globalThis.document = {
  getElementById: byId,
  body: { appendChild() {} },
  createElement(tag) {
    if (tag !== 'canvas') return element();
    const canvas = element();
    canvas.getContext = () => ({ drawImage() {}, imageSmoothingEnabled: '', imageSmoothingQuality: '' });
    canvas.toBlob = (callback) => pendingEncoding.push(callback);
    canvases.push(canvas);
    return canvas;
  },
};
globalThis.window = { isSecureContext: true };
const video = byId('video');
video.videoWidth = 960;
video.videoHeight = 1280;
video.readyState = 4;
video.play = async () => {};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { mediaDevices: { async getUserMedia() { return { getTracks: () => [] }; } } },
});
await import('./src/app.js?shutter-behavior-test');
assert.equal(byId('btnCapture').disabled, true);
assert.equal(byId('btnShutter').disabled, true);
byId('btnStart').listeners.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(byId('btnCapture').disabled, false);
assert.equal(byId('btnShutter').disabled, false);
assert.equal(typeof byId('btnShutter').listeners.click, 'function');
for (const id of ['btnShutter', 'btnCapture']) {
  byId(id).listeners.click();
  assert.equal(byId('btnCapture').disabled, true);
  assert.equal(byId('btnShutter').disabled, true);
  assert.equal(pendingEncoding.length, 1);
  pendingEncoding.shift()(new Blob(['jpeg'], { type: 'image/jpeg' }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(byId('btnCapture').disabled, false);
  assert.equal(byId('btnShutter').disabled, false);
}
assert.equal(canvases.length, 2);
assert.equal(byId('toast').textContent, 'Saved 960×1280');
console.log('PASS: both capture controls are synchronized and produce one JPEG each');
NODE
```

- [ ] **Step 2: Run the behavior test and verify RED**

Expected: FAIL because the shutter has no click handler and its disabled state is not synchronized.

- [ ] **Step 3: Add the shutter reference and state helper**

Add beside `btnCapture`:

```js
const btnShutter = document.getElementById("btnShutter");
```

Add after `showToast()`:

```js
function setCaptureDisabled(disabled) {
  btnCapture.disabled = disabled;
  btnShutter.disabled = disabled;
}
```

- [ ] **Step 4: Route all capture state changes through the helper**

Use `setCaptureDisabled(true)` in `stopStream()` and at the start of `captureLive()`.

Use this after the camera starts:

```js
setCaptureDisabled(false);
```

Use this in the `captureLive()` finally block:

```js
setCaptureDisabled(!(stream && video.readyState >= 2));
```

- [ ] **Step 5: Connect the shutter to the existing capture path**

Add beside the existing Capture listener:

```js
btnShutter.addEventListener("click", () => {
  void captureLive();
});
```

- [ ] **Step 6: Re-run the behavior test and verify GREEN**

Expected: `PASS: both capture controls are synchronized and produce one JPEG each`.

- [ ] **Step 7: Commit the behavior**

```bash
git add src/app.js
git commit -m "feat: synchronize preview shutter controls"
```

### Task 3: Build and verify the deployable page

**Files:**
- Modify: `docs/index.html`
- Add: `docs/superpowers/plans/2026-10-29-shutter-button.md`

- [ ] **Step 1: Build and check the final diff**

```bash
node build.mjs
git diff --check
```

Expected: `wrote docs/index.html` and no diff-check errors.

- [ ] **Step 2: Verify the built page contains the feature**

```bash
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const page = await readFile('docs/index.html', 'utf8');
assert.match(page, /id="btnShutter"/);
assert.match(page, /function setCaptureDisabled\(disabled\)/);
assert.match(page, /btnShutter\.addEventListener\("click"/);
console.log('PASS: deployable page contains shutter markup and behavior');
NODE
```

Expected: `PASS: deployable page contains shutter markup and behavior`.

- [ ] **Step 3: Commit the built page and plan, then push**

```bash
git add docs/index.html docs/superpowers/plans/2026-10-29-shutter-button.md
git commit -m "build: publish preview shutter button"
git push
```
