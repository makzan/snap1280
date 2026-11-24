export const MIN_EDGE = 1280;
export const JPEG_QUALITY = 0.9;
export const PHOTO_PRESETS = {
  camera: { label: "Camera", width: MIN_EDGE, height: Math.round(MIN_EDGE * 16 / 9) },
  a4: { label: "A4", width: MIN_EDGE, height: Math.round(MIN_EDGE * 1280 / 905) },
  square: { label: "Square", width: MIN_EDGE, height: MIN_EDGE },
};

export function resolvePreset(key, landscape = false) {
  if (!Object.hasOwn(PHOTO_PRESETS, key)) throw new Error("Unknown photo preset");
  const preset = PHOTO_PRESETS[key];
  const square = preset.width === preset.height;
  return {
    ...preset,
    label: square ? preset.label : `${preset.label} ${landscape ? "landscape" : "portrait"}`,
    width: landscape ? preset.height : preset.width,
    height: landscape ? preset.width : preset.height,
  };
}

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

export function photoFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `snap1280-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.jpg`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode JPEG"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

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

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return url;
}
