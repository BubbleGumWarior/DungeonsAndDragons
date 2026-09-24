/**
 * Helpers for turning the image references we get from the API into something a browser can load
 * cheaply.
 *
 * - Pictures stored in the database (portraits, monsters, NPCs, shadows, family members) come back
 *   as small `/api/images/...` URLs that the browser caches indefinitely. `sizedImageUrl` asks the
 *   server for a smaller WebP copy so a 50px map token doesn't download a full-size portrait.
 * - Built-in artwork under `/images/...` ships as optimised WebP (see scripts/optimize-images.js).
 *   Older database rows and code that still say `.png` / `.jpg` are mapped to the `.webp` file.
 */

/** Widths the server will resize to (must match THUMB_WIDTHS in backend/utils/imageService.js). */
export const IMAGE_WIDTH = {
  /** Map tokens, avatars, small combat tokens */
  avatar: 96,
  /** Dashboard character avatars, family tree nodes */
  small: 192,
  /** Cards and grids (encyclopedia, NPCs) */
  card: 384,
  /** Detail views */
  detail: 768,
  /** Click-to-enlarge viewers */
  large: 1280,
} as const;

// Art folders for which every .png/.jpg has a generated .webp twin.
const OPTIMISED_STATIC_ART = /^\/images\/(?:CityImages|monsters|Mounts|Beasts)\/.+\.(?:png|jpe?g)$/i;

/** The static `.webp` path for a built-in art file, e.g. `/images/CityImages/Yllwyn.jpg` -> `.webp`. */
export const toWebpArt = (path: string): string =>
  OPTIMISED_STATIC_ART.test(path) ? path.replace(/\.(?:png|jpe?g)$/i, '.webp') : path;

/**
 * Origin of the backend that serves `/api/...` and `/uploads/...` files, mirroring how the API
 * client (services/api.ts) picks its base URL: an absolute REACT_APP_API_URL wins (frontend and
 * API on different hosts), production otherwise uses the page's own origin, and local
 * development talks to the backend on port 5000.
 */
const backendOrigin = (): string => {
  const explicit = process.env.REACT_APP_API_URL;
  if (explicit && /^https?:\/\//i.test(explicit)) {
    try {
      return new URL(explicit).origin;
    } catch {
      // malformed value: fall through to the defaults below
    }
  }
  return process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
};

/**
 * Resolves an image reference from the API to a loadable URL:
 * data URLs and absolute URLs pass through, built-in art maps to its WebP twin (it ships with the
 * frontend), and uploaded/database images (`/api/...`, `/uploads/...`) are served by the backend.
 */
export const resolveImageUrl = (imageUrl?: string | null): string | undefined => {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith('data:')) return imageUrl;
  if (imageUrl.startsWith('http')) return imageUrl;
  if (imageUrl.startsWith('/images/')) return toWebpArt(imageUrl);
  return `${backendOrigin()}${imageUrl}`;
};

/**
 * Like `resolveImageUrl`, but for images stored in the database it requests a copy no wider than
 * `width` px (use the IMAGE_WIDTH presets). Any other kind of URL is returned unchanged.
 */
export const sizedImageUrl = (imageUrl: string | null | undefined, width: number): string | undefined => {
  const url = resolveImageUrl(imageUrl);
  if (!url || !url.includes('/api/images/')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}w=${width}`;
};
