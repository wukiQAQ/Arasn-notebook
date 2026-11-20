
const maxPixels = 32_000_000;

function canvasFor(width, height, max) {
  if (!(width > 0 && height > 0) || width * height > maxPixels) throw new Error("Image size limit");
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return canvas;
}

function raster(source, width, height, max, video = false) {
  const canvas = canvasFor(width, height, max);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(video ? "image/jpeg" : "image/webp", .87);
}

async function fetchBytes(url) {
  const result = await fetch(url);
  if (!result.ok) throw new Error("Preview read failed");
  return new Uint8Array(await result.arrayBuffer());
}

function eventOnce(target, event) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      target.removeEventListener(event, ready);
      target.removeEventListener("error", fail);
    }
    function ready() { cleanup(); resolve(); }
    function fail() { cleanup(); reject(new Error("Media read failed")); }
    target.addEventListener(event, ready, { once: true });
    target.addEventListener("error", fail, { once: true });
  });
}

async function videoPreview(video, duration, max) {
  if (video.readyState < 2) await eventOnce(video, "loadeddata");
  const width = video.videoWidth, height = video.videoHeight;
  const sample = canvasFor(width, height, 32);
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  let bestScore = -1, image;
  const positions = [0.14, 0.33, 0.61, 0.84, 0];
  for (const fraction of positions) {
    // Limit how far seeking goes when metadata reports an unusually long duration.
    const position = Math.min(duration * fraction, 180);
    if (Math.abs(video.currentTime - position) > .035) {
      const ready = eventOnce(video, "seeked");
      video.currentTime = position;
      await ready;
    }
    ctx.drawImage(video, 0, 0, sample.width, sample.height);
    const rgba = ctx.getImageData(0, 0, sample.width, sample.height).data;
    let score = 0;
    for (let i = 0; i < rgba.length; i += 4)
      score += Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) >= 26;
    score /= rgba.length / 4;
    if (score > bestScore) {
      bestScore = score;
      image = raster(video, width, height, max, true);
    }
    if (bestScore > .6) break;
  }
  return { kind: "video", duration, width, height, image };
}

async function waveform(url, duration) {
  if (duration > 240) return;
  const context = new OfflineAudioContext(1, 1, 8000);
  const bytes = await fetchBytes(url);
  const decoded = await context.decodeAudioData(bytes.buffer);
  if (!decoded.length) return;
  const samples = decoded.getChannelData(0);
  return Array.from({ length: 56 }, (_, index) => {
    const start = Math.floor(index * samples.length / 56);
    const end = Math.floor((index + 1) * samples.length / 56);
    let peak = 0;
    for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
    return Math.min(1, peak);
  });
}

async function media({ url, mime, max, size }) {
  const isVideo = mime.startsWith("video/");
  const element = document.createElement(isVideo ? "video" : "audio");
  element.muted = true;
  element.preload = isVideo ? "auto" : "metadata";
  const ready = eventOnce(element, "loadedmetadata");
  element.src = url;
  await ready;
  const duration = element.duration;
  if (!(duration > 0 && Number.isFinite(duration))) return null;
  if (isVideo) return videoPreview(element, duration, max);
  const peaks = size <= 12 * 1024 * 1024 ? await waveform(url, duration).catch(() => undefined) : undefined;
  return { kind: "audio", peaks, duration };
}

async function psd(bytes) {
  const data = new DataView(bytes.buffer);
  const width = data.getUint32(18), height = data.getUint32(14);
  canvasFor(width, height, 1);
  const { readPsd, initializeCanvas } = await import("ag-psd");
  initializeCanvas((w, h) => canvasFor(w, h, Math.max(w, h)));
  const decoded = readPsd(bytes, { skipLayerImageData: true, skipThumbnail: true, useImageData: true });
  if (!decoded.imageData || decoded.imageResources?.versionInfo?.hasRealMergedData === false) return null;
  return new ImageData(new Uint8ClampedArray(decoded.imageData.data), width, height);
}

async function tiff(bytes) {
  const { default: UTIF } = await import("utif");
  const [page] = UTIF.decode(bytes.buffer);
  if (!page) return null;
  const width = page.t256?.[0], height = page.t257?.[0];
  canvasFor(width, height, 1);
  UTIF.decodeImage(bytes.buffer, page);
  return new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(page)), width, height);
}

async function pdf(bytes, page, max) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const task = pdfjs.getDocument({
    data: bytes, isEvalSupported: false, useWasm: false, enableXfa: false, maxImageSize: maxPixels,
    cMapUrl: "/preview-pdf/cmaps/", cMapPacked: true, standardFontDataUrl: "/preview-pdf/standard_fonts/",
  });
  try {
    const document = await task.promise;
    if (page > document.numPages) return null;
    const sheet = await document.getPage(page);
    const original = sheet.getViewport({ scale: 1 });
    const viewport = sheet.getViewport({ scale: max / Math.max(original.width, original.height) });
    const canvas = canvasFor(viewport.width, viewport.height, max);
    await sheet.render({
      canvas, viewport, annotationMode: pdfjs.AnnotationMode.DISABLE,
      background: "#ffffff",
    }).promise;
    return { kind: "document", count: document.numPages, image: canvas.toDataURL("image/webp", .89) };
  } finally {
    await task.destroy();
  }
}

window.generateFilePreview = async function (input) {
  const { url, extension, mime, max, original, page } = input;
  if (/^(audio|video)\//.test(mime ?? "")) return media(input);
  if (mime?.startsWith("image/")) {
    // SVG is loaded strictly as an image, with a deny-all resource policy on its response.
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth, height = image.naturalHeight;
    if (original) {
      canvasFor(width, height, 1);
      return { kind: "image", width, height, original };
    }
    return { kind: "image", width, height, image: raster(image, width, height, max) };
  }
  const bytes = await fetchBytes(url);
  if (input.text) {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" :
      bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
    const text = new TextDecoder(encoding).decode(bytes, { stream: bytes.length < input.size });
    if (text.includes("\0") || !text.trim()) return null;
    if (extension === "csv") {
      const { csv } = await import("./file-preview-office.js");
      const table = csv(text);
      return table.length ? { kind: "table", table } : null;
    }
    return { kind: "text", text: text.slice(0, 16_000), truncated: bytes.length < input.size || text.length > 16_000 };
  }
  if (extension === "pdf") return pdf(bytes, page, max);
  if (extension === "xls") {
    const { legacySheet } = await import("./file-preview-office.js");
    return legacySheet(bytes);
  }
  if (["docx", "pptx", "xlsx"].includes(extension)) {
    const { office } = await import("./file-preview-office.js");
    return office(bytes, extension);
  }
  const pixels = await (["psd", "psb"].includes(extension) ? psd(bytes) : tiff(bytes));
  if (!pixels) return null;
  const { width, height } = pixels;
  const originalCanvas = canvasFor(width, height, Math.max(width, height));
  originalCanvas.getContext("2d").putImageData(pixels, 0, 0);
  return { kind: "image", width, height, image: raster(originalCanvas, width, height, max) };
};
