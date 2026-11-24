import test from "node:test";
import assert from "node:assert/strict";

class FakeClassList {
  constructor() { this.names = new Set(); }
  add(...names) { for (const name of names) this.names.add(name); }
  remove(...names) { for (const name of names) this.names.delete(name); }
  toggle(name, force) {
    if (force) this.names.add(name);
    else this.names.delete(name);
  }
  contains(name) { return this.names.has(name); }
}

const canvases = [];
const downloads = [];

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, value),
    };
    this.disabled = false;
    this.hidden = false;
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  async dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener();
    await new Promise((resolve) => setImmediate(resolve));
  }
  click() { if (this.tagName === "a") downloads.push(this); }
  remove() {}
}

const ids = ["stage", "video", "placeholder", "status", "size", "flash", "toast", "shots", "ratio", "btnCapture", "btnShutter", "btnFlip", "btnStart", "file"];
const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id === "video" ? "video" : "div")]));
const body = new FakeElement("body");

globalThis.document = {
  body,
  getElementById(id) { return elements[id]; },
  createElement(tagName) {
    if (tagName !== "canvas") return new FakeElement(tagName);
    const canvas = new FakeElement("canvas");
    canvas.drawCalls = [];
    canvas.getContext = () => ({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "",
      drawImage(...args) { canvas.drawCalls.push(args); },
    });
    canvas.toBlob = (callback, type) => callback(new Blob(["jpeg"], { type }));
    canvases.push(canvas);
    return canvas;
  },
};
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

await import("../src/app.js");

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

test("uploads use the selected dimensions for landscape, portrait, and square sources", async () => {
  const sources = { camera: [1600, 900], a4: [900, 1600], square: [1000, 1000] };
  const expected = { camera: [1280, 2276], a4: [1280, 1810], square: [1280, 1280] };
  globalThis.createImageBitmap = async () => {
    const [width, height] = sources[elements.ratio.value];
    return { width, height, close() {} };
  };

  for (const key of Object.keys(sources)) {
    elements.ratio.value = key;
    await elements.ratio.dispatch("change");
    elements.file.files = [new Blob(["image"], { type: "image/png" })];
    await elements.file.dispatch("change");
    const canvas = canvases.at(-1);
    assert.deepEqual([canvas.width, canvas.height], expected[key]);
    assert.equal(elements.shots.children[0].children[1].textContent.startsWith(`${expected[key][0]}×${expected[key][1]}`), true);
  }
  assert.equal(downloads.length, 3);

  await setLandscape(true);
  elements.ratio.value = "camera";
  await elements.ratio.dispatch("change");
  elements.file.files = [new Blob(["image"], { type: "image/png" })];
  await elements.file.dispatch("change");
  assert.deepEqual([canvases.at(-1).width, canvases.at(-1).height], [2276, 1280]);
  assert.equal(downloads.length, 4);
  await setLandscape(false);
});

test("camera, flip, and both shutter controls preserve the selected output", async () => {
  const stream = { getTracks: () => [{ stop() {} }] };
  const facingModes = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        async getUserMedia(constraints) {
          facingModes.push(constraints.video.facingMode.ideal);
          assert.equal(constraints.video.width.ideal, 2560);
          return stream;
        },
      },
    },
  });
  elements.video.play = async () => {
    elements.video.readyState = 2;
    elements.video.videoWidth = 1600;
    elements.video.videoHeight = 900;
  };

  await elements.btnStart.dispatch("click");
  assert.equal(elements.status.textContent, "Live");
  assert.equal(elements.video.hidden, false);
  assert.equal(elements.btnCapture.disabled, false);

  await elements.btnFlip.dispatch("click");
  assert.deepEqual(facingModes, ["environment", "user"]);
  assert.equal(elements.video.classList.contains("mirror"), true);

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
  assert.deepEqual(facingModes, ["environment", "user"]);
  assert.equal(downloads.length, 7);
  await setLandscape(false);
});
