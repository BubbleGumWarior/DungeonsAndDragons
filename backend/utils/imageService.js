const crypto = require('crypto');

// Images uploaded through the app (portraits, monsters, NPCs, shadows, family members) live in
// the database as BYTEA. They used to be inlined into every JSON response as base64 data URLs,
// which meant each campaign load / tab open re-downloaded every picture (+33% for base64) and the
// browser could never cache them. Instead, JSON now carries a small URL for each image, and the
// bytes are served by GET /api/images/:kind/:id with a long-lived, immutable cache header.
//
// The URL is versioned (?v=<content hash>) so replacing a picture produces a new URL, and signed
// (&s=<hmac>) so a <img> tag can load it without an Authorization header while IDs still can't be
// enumerated by outsiders (e.g. to peek at monsters the DM hasn't revealed yet).

// sharp is optional: without it (or without a prebuilt binary for this platform) thumbnails are
// simply not generated and the stored original is served instead.
let sharp = null;
try {
  sharp = require('sharp');
  console.log(`[images] sharp ${sharp.versions.sharp} loaded: thumbnails enabled`);
} catch (err) {
  sharp = null;
  console.warn(`[images] sharp unavailable (${err.message.split('\n')[0]}): serving original images without thumbnails`);
}

// kind -> table holding image_data / image_mime_type columns
const KINDS = {
  characters: 'characters',
  monsters: 'monsters',
  npcs: 'campaign_npcs',
  shadows: 'character_shadows',
  family: 'family_members',
};

// Widths a client may request: avatars/tokens, cards, detail views and click-to-enlarge.
// Kept to a short list so the variant cache can't be flooded with arbitrary sizes.
const THUMB_WIDTHS = [96, 192, 384, 768, 1280];

const IMAGE_MIME = /^image\/(jpeg|png|gif|webp|avif)$/;
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const secret = () => process.env.JWT_SECRET || 'dungeon-lair-image-url-secret';

const versionOf = (data) => crypto.createHash('md5').update(data).digest('hex').slice(0, 12);

const sign = (kind, id, version) =>
  crypto.createHmac('sha256', secret()).update(`${kind}:${id}:${version}`).digest('base64url').slice(0, 24);

function verifySignature(kind, id, version, signature) {
  if (typeof version !== 'string' || typeof signature !== 'string') return false;
  const expected = Buffer.from(sign(kind, id, version));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/**
 * URL that serves the image bytes for `kind`/`id`, or null when there are no bytes.
 * `data` is the raw BYTEA value (Buffer) as read from the database.
 */
function buildImageUrl(kind, id, data) {
  const numericId = Number.parseInt(id, 10);
  if (!data || !KINDS[kind] || !Number.isInteger(numericId) || numericId <= 0) return null;
  const version = versionOf(data);
  return `/api/images/${kind}/${numericId}?v=${version}&s=${sign(kind, numericId, version)}`;
}

/**
 * Returns the stored bytes, or a resized WebP copy when `width` is given and sharp is available.
 * A "thumbnail" is never served if it ended up larger than the original.
 */
async function renderVariant(data, mimeType, width) {
  const type = IMAGE_MIME.test(mimeType || '') ? mimeType : 'image/jpeg';
  // Animated GIFs would lose their animation when resized, so they are always served as stored.
  if (!width || !sharp || type === 'image/gif') return { buffer: data, type };
  try {
    const resized = await sharp(data, { failOn: 'none' })
      .rotate() // honour EXIF orientation before the metadata is dropped
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    if (resized.length < data.length) return { buffer: resized, type: 'image/webp' };
  } catch (err) {
    console.warn('Thumbnail generation failed, serving original image:', err.message);
  }
  return { buffer: data, type };
}

// Small in-memory LRU so several players opening the same page don't each trigger a DB read
// and a resize. Bounded by total bytes; anything bigger than MAX_ENTRY_BYTES isn't cached.
const CACHE_BUDGET_BYTES = 48 * 1024 * 1024;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
const variantCache = new Map();
let cachedBytes = 0;

function cacheGet(key) {
  const hit = variantCache.get(key);
  if (!hit) return null;
  variantCache.delete(key); // re-insert to mark as most recently used
  variantCache.set(key, hit);
  return hit;
}

function cacheSet(key, value) {
  const size = value.buffer.length;
  if (size > MAX_ENTRY_BYTES) return;
  const existing = variantCache.get(key);
  if (existing) {
    cachedBytes -= existing.buffer.length;
    variantCache.delete(key);
  }
  variantCache.set(key, value);
  cachedBytes += size;
  for (const [oldKey, old] of variantCache) {
    if (cachedBytes <= CACHE_BUDGET_BYTES) break;
    variantCache.delete(oldKey);
    cachedBytes -= old.buffer.length;
  }
}

/** Parses the optional ?w= query value into one of THUMB_WIDTHS, or null. */
function parseWidth(value) {
  const width = Number.parseInt(value, 10);
  return THUMB_WIDTHS.includes(width) ? width : null;
}

module.exports = {
  KINDS,
  THUMB_WIDTHS,
  CACHE_CONTROL,
  buildImageUrl,
  verifySignature,
  renderVariant,
  parseWidth,
  cacheGet,
  cacheSet,
};
