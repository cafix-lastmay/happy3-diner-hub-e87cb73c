// Client-side image validation, resizing and compression for menu uploads.
// Keeps memory low and prevents huge files from breaking the app.

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15MB raw input cap

export interface ProcessedImage {
  blob: Blob;
  ext: string;
  width: number;
  height: number;
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    return "unsupported_type";
  }
  if (file.size > MAX_INPUT_BYTES) {
    return "file_too_large";
  }
  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image_load_failed")); };
    img.src = url;
  });
}

/**
 * Resize image to fit within maxDim (preserving aspect ratio) and compress to WEBP/JPEG.
 * Returns a Blob ready to upload. Always succeeds or throws — never crashes the app.
 */
export async function processMenuImage(file: File, maxDim = 1200, quality = 0.82): Promise<ProcessedImage> {
  const img = await loadImage(file);
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unsupported");
  ctx.drawImage(img, 0, 0, width, height);

  // Prefer WEBP when supported (smaller), fallback to JPEG.
  const mime = "image/webp";
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b && b.size > 0) return resolve(b);
      // Fallback to JPEG
      canvas.toBlob((j) => j ? resolve(j) : reject(new Error("encode_failed")), "image/jpeg", quality);
    }, mime, quality);
  });
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return { blob, ext, width, height };
}
