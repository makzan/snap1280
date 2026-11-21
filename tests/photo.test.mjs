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
