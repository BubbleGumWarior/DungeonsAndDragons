/**
 * Downscales/re-encodes an image file client-side before upload, so a full-resolution phone
 * photo (often 8-15MB) comfortably clears the backend's upload size limit without the user
 * having to manually resize anything. Non-image files (or anything the browser can't decode,
 * e.g. an odd HEIC variant) are passed through untouched — the server-side limit still applies
 * as a safety net.
 */
export async function compressImageFile(
  file: File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<File> {
  const { maxDimension = 1600, quality = 0.82 } = options;

  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    // Animated GIFs would lose their animation if we round-tripped them through canvas — leave as-is.
    return file;
  }

  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    if ('close' in bitmap) (bitmap as ImageBitmap).close?.();

    const outputType = file.type === 'image/png' && hasLikelyTransparency(ctx, targetW, targetH) ? 'image/png' : 'image/jpeg';
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, outputType, quality));
    if (!blob) return file;

    // Only use the compressed version if it's actually smaller — a tiny source image
    // re-encoded at quality 0.82 can occasionally end up larger than the original.
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.\w+$/, outputType === 'image/png' ? '.png' : '.jpg');
    return new File([blob], newName, { type: outputType, lastModified: Date.now() });
  } catch {
    // Decoding failed for any reason — fall back to the original file untouched.
    return file;
  }
}

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Cheap heuristic: sample a handful of pixels for a non-opaque alpha channel before
// deciding a PNG needs to stay a PNG (JPEG has no alpha and would flatten transparency to black).
function hasLikelyTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const sampleW = Math.min(w, 64);
    const sampleH = Math.min(h, 64);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return true;
    }
    return false;
  } catch {
    return true; // If we can't inspect it, keep it safe as PNG.
  }
}
