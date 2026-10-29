import {
  MAX_EDGE,
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
const btnCapture = document.getElementById("btnCapture");
const btnFlip = document.getElementById("btnFlip");
const btnStart = document.getElementById("btnStart");
const fileInput = document.getElementById("file");

let stream = null;
let facing = "environment";
let busy = false;
let shots = [];
let toastTimer = null;

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

function syncPreviewFrame() {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return;
  stage.style.setProperty("--frame-aspect", String(width / height));
  const longest = Math.max(width, height);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  sizeEl.hidden = false;
  sizeEl.textContent = `${outW}×${outH}`;
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
  sizeEl.hidden = true;
  btnCapture.disabled = true;
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
      },
    });
    video.srcObject = stream;
    video.playsInline = true;
    await video.play();
    syncPreviewFrame();
    video.hidden = false;
    placeholder.hidden = true;
    setStatus("Live", "live");
    btnCapture.disabled = false;
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
  btnCapture.disabled = true;
  flashEl.classList.add("on");
  setTimeout(() => flashEl.classList.remove("on"), 90);
  try {
    const photo = await encodeFitted(video, video.videoWidth, video.videoHeight);
    await savePhoto(photo);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Capture failed", true);
  } finally {
    busy = false;
    btnCapture.disabled = !(stream && video.readyState >= 2);
  }
}

async function handleFile(file) {
  if (!file || busy) return;
  busy = true;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const photo = await encodeFitted(bitmap, bitmap.width, bitmap.height);
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
btnFlip.addEventListener("click", () => {
  facing = facing === "environment" ? "user" : "environment";
  void startCamera();
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) void handleFile(file);
});
video.addEventListener("loadedmetadata", syncPreviewFrame);

if (!window.isSecureContext) setStatus("Insecure", "insecure");
else setStatus("Ready");
