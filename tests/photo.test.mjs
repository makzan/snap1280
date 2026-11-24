import test from "node:test";
import assert from "node:assert/strict";
import { MIN_EDGE, PHOTO_PRESETS, centerCrop, encodeFitted, resolvePreset } from "../src/photo.js";

test("presets resolve minimum-edge portrait and landscape output sizes", () => {
  assert.equal(MIN_EDGE, 1280);
  for (const [key, portrait, landscape] of [
    ["camera", [1280, 2276], [2276, 1280]],
    ["a4", [1280, 1810], [1810, 1280]],
    ["square", [1280, 1280], [1280, 1280]],
  ]) {
    const portraitPreset = resolvePreset(key);
    const landscapePreset = resolvePreset(key, true);
    assert.deepEqual([portraitPreset.width, portraitPreset.height], portrait, key);
    assert.deepEqual([landscapePreset.width, landscapePreset.height], landscape, key);
  }
  assert.equal(PHOTO_PRESETS.camera.label, "Camera");
  assert.equal(PHOTO_PRESETS.a4.label, "A4");
  assert.equal(PHOTO_PRESETS.square.label, "Square");
  assert.equal(resolvePreset("camera").label, "Camera portrait");
  assert.equal(resolvePreset("camera", true).label, "Camera landscape");
  assert.equal(resolvePreset("a4").label, "A4 portrait");
  assert.equal(resolvePreset("a4", true).label, "A4 landscape");
  assert.equal(resolvePreset("square").label, "Square");
  assert.equal(resolvePreset("square", true).label, "Square");
  assert.throws(() => resolvePreset("unknown"), /Unknown photo preset/);
});

test("presets reject inherited object keys", () => {
  for (const key of ["toString", "constructor", "__proto__"]) {
    assert.throws(() => resolvePreset(key), /Unknown photo preset/, key);
  }
});

test("centerCrop crops a landscape source to a portrait target", () => {
  const crop = centerCrop(1600, 900, 1280, 2276);
  assert.equal(crop.x, 546.9244288224955);
  assert.equal(crop.y, 0);
  assert.equal(crop.width, 506.15114235500886);
  assert.equal(crop.height, 900);
});

test("centerCrop crops a portrait source to a square target", () => {
  assert.deepEqual(centerCrop(900, 1600, 1280, 1280), { x: 0, y: 350, width: 900, height: 900 });
});

test("centerCrop rejects invalid dimensions", () => {
  assert.throws(() => centerCrop(0, 100, 1280, 2276), /Invalid image size/);
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
    for (const key of Object.keys(PHOTO_PRESETS)) {
      for (const landscape of [false, true]) {
        const preset = resolvePreset(key, landscape);
        const photo = await encodeFitted({}, 1600, 900, preset);
        assert.equal(photo.width, preset.width, key);
        assert.equal(photo.height, preset.height, key);
        assert.equal(photo.blob.type, "image/jpeg", key);
      }
    }
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
  assert.equal(drawCalls.length, 6);
  const crop = centerCrop(1600, 900, 1280, 2276);
  assert.deepEqual(drawCalls[0].slice(1), [crop.x, crop.y, crop.width, crop.height, 0, 0, 1280, 2276]);
});
