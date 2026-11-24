import { ImageOff, UtensilsCrossed } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Offline-first product imagery.
 *
 * Product photos are stored as data URLs in `products.image_path` (TEXT), so a
 * shop with no internet still renders its catalogue. Uploading writes nothing to
 * disk outside the SQLite file, which keeps backup/restore to a single artefact.
 *
 * A "local file" value (a bare path or file:// URL) is also accepted for
 * historical rows; those load through the same <img> tag.
 */

const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // reject absurd originals before decode
const MAX_EDGE = 640; // longest edge of the stored thumbnail
const JPEG_QUALITY = 0.82;

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

/** True when a stored value can be handed straight to an <img src>. */
export function isRenderableImage(value: string): boolean {
  const v = value.trim();
  return (
    v.startsWith('data:image/') ||
    v.startsWith('http://') ||
    v.startsWith('https://') ||
    v.startsWith('file://')
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a readable image'));
    img.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Read a picked image and return a downscaled JPEG data URL ready for storage.
 * Throws with a user-facing message on oversized or unreadable files.
 */
export async function readImageFile(file: File): Promise<string> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('Image is larger than 8 MB. Pick a smaller photo.');
  }
  const source = await readAsDataUrl(file);
  const img = await loadImage(source);
  const widest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = widest > MAX_EDGE ? MAX_EDGE / widest : 1;
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not available on this machine');
  // White matte so transparent PNGs do not turn black once flattened to JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/**
 * EAN-13 barcode with a valid check digit. The 12-digit body is random, so a
 * "Generate" press yields a scannable, collision-unlikely code for retail items.
 */
export function generateEan13(): string {
  let body = '';
  for (let i = 0; i < 12; i += 1) body += Math.floor(Math.random() * 10).toString();
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = Number(body[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}

interface ProductThumbProps {
  imagePath: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES: Record<NonNullable<ProductThumbProps['size']>, string> = {
  sm: 'h-9 w-9',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
};

/** Product photo with a branded fallback tile when none is set. */
export function ProductThumb({
  imagePath,
  name,
  size = 'sm',
  className = '',
}: ProductThumbProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imagePath]);

  const showImage = imagePath.trim() !== '' && isRenderableImage(imagePath) && !failed;
  const box = `${SIZES[size]} shrink-0 rounded-lg ${className}`;

  if (!showImage) {
    return (
      <div
        aria-hidden
        className={`${box} grid place-items-center bg-brand-50 text-brand-400 dark:bg-brand-900/30 dark:text-brand-300`}
      >
        <UtensilsCrossed
          className={size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-7 w-7'}
        />
      </div>
    );
  }

  return (
    <img
      src={imagePath}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${box} bg-white object-cover ring-1 ring-slate-200 dark:ring-slate-700`}
    />
  );
}

/** Placeholder used when a row's stored path is a bare filesystem path that cannot load. */
export function UnavailableImageBadge(): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
      <ImageOff className="h-3 w-3" /> image missing
    </span>
  );
}
