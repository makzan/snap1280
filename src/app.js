import {
  MAX_EDGE,
  PHOTO_PRESETS,
  encodeFitted,
  formatBytes,
  triggerDownload,
} from "./photo.js";

const MAX_SHOTS = 8;

const stage = document.getElementById("stage");
const video = document.getElementById("video");
const placeholder = document.getElementById("placeholder");
const statusEl = document.getElementById("status");
const sizeEl = document.getElementById("size");
const flashEl = document.getElementById("flash");
const toastEl = document.getElementById("toast");
const shotsEl = document.getElementById("shots");
const ratioSelect = document.getElementById("ratio");
const btnCapture = document.getElementById("btnCapture");
const btnShutter = document.getElementById("btnShutter");
const btnFlip = document.getElementById("btnFlip");
const btnStart = document.getElementById("btnStart");
const fileInput = document.getElementById("file");

let stream = null;
let facing = "environment";
let presetKey = "camera";
let busy = false;
let shots = [];
let toastTimer = null;

for (const [key, preset] of Object.entries(PHOTO_PRESETS)) {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = `${preset.label} — ${preset.width}×${preset.height}`;
  ratioSelect.append(option);
}
ratioSelect.value = presetKey;

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = "badge left" + (cls ? " " + cls : "");
}

function showToast(text, isErr) {
  toastEl.textContent = text;
  toastEl.className = "toast" + (isErr ? " err" : "");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.textContent = "";
  }, 2400);
}

function setCaptureDisabled(disabled) {
  btnCapture.disabled = disabled;
  btnShutter.disabled = disabled;
}

function syncPreviewFrame() {
  const preset = PHOTO_PRESETS[presetKey];
  stage.style.setProperty("--frame-aspect", String(preset.width / preset.height));
  sizeEl.hidden = false;
  sizeEl.textContent = `${preset.width}×${preset.height}`;
  video.classList.toggle("mirror", facing === "user");
}

function renderShots() {
  shotsEl.replaceChildren();
  for (const shot of shots) {
    const card = document.createElement("div");
    card.className = "shot";
    const img = document.createElement("img");
    img.src = shot.url;
    img.alt = shot.filename;
    img.width = shot.width;
    img.height = shot.height;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${shot.width}×${shot.height} · ${formatBytes(shot.bytes)}`;
    card.append(img, meta);
    shotsEl.append(card);
  }
}

async function savePhoto(photo) {
  const url = triggerDownload(photo.blob, photo.filename);
  const shot = {
    url,
    width: photo.width,
    height: photo.height,
    bytes: photo.blob.size,
    filename: photo.filename,
  };
  const next = [shot, ...shots];
  for (const dropped of next.slice(MAX_SHOTS)) URL.revokeObjectURL(dropped.url);
  shots = next.slice(0, MAX_SHOTS);
  renderShots();
  showToast(`Saved ${photo.width}×${photo.height}`);
}

function stopStream() {
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
  video.srcObject = null;
  video.hidden = true;
  placeholder.hidden = false;
  setCaptureDisabled(true);
  btnFlip.disabled = true;
}

async function startCamera() {
  if (!window.isSecureContext) {
    setStatus("Insecure", "insecure");
    showToast("Camera needs HTTPS.", true);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("No camera", "denied");
    showToast("Camera API unavailable.", true);
    return;
  }
  setStatus("Opening");
  btnStart.disabled = true;
  try {
    stopStream();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: MAX_EDGE },
      },
    });
    video.srcObject = stream;
    video.playsInline = true;
    await video.play();
    syncPreviewFrame();
    video.hidden = false;
    placeholder.hidden = true;
    setStatus("Live", "live");
    setCaptureDisabled(false);
    btnFlip.disabled = false;
  } catch (err) {
    setStatus("Blocked", "denied");
    showToast(err instanceof Error ? err.message : "Camera blocked", true);
  } finally {
    btnStart.disabled = false;
  }
}

async function captureLive() {
  if (busy || video.readyState < 2) return;
  busy = true;
  setCaptureDisabled(true);
  flashEl.classList.add("on");
  setTimeout(() => flashEl.classList.remove("on"), 90);
  try {
    const photo = await encodeFitted(video, video.videoWidth, video.videoHeight, PHOTO_PRESETS[presetKey]);
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
  busy = true;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const photo = await encodeFitted(bitmap, bitmap.width, bitmap.height, PHOTO_PRESETS[presetKey]);
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

btnStart.addEventListener("click", () => {
  void startCamera();
});
btnCapture.addEventListener("click", () => {
  void captureLive();
});
btnShutter.addEventListener("click", () => {
  void captureLive();
});
btnFlip.addEventListener("click", () => {
  facing = facing === "environment" ? "user" : "environment";
  void startCamera();
});
ratioSelect.addEventListener("change", () => {
  presetKey = ratioSelect.value;
  syncPreviewFrame();
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) void handleFile(file);
});
video.addEventListener("loadedmetadata", syncPreviewFrame);

syncPreviewFrame();
if (!window.isSecureContext) setStatus("Insecure", "insecure");
else setStatus("Ready");
