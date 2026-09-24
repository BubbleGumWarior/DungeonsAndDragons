#!/usr/bin/env node
/**
 * Generates optimised WebP copies of the artwork the app ships to browsers (city pictures,
 * monster / mount / beast art, the world map, theme backgrounds, character placeholders).
 *
 * The original PNG/JPG/AVIF files are left untouched; the app references the generated .webp
 * files. Re-running only converts files whose source is newer than the existing .webp
 * (pass --force to redo everything).
 *
 * sharp is intentionally not a project dependency, install it on demand:
 *
 *   cd frontend
 *   npm install --no-save sharp
 *   node scripts/optimize-images.js [--force]
 */
const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.error('This script needs sharp. Run: npm install --no-save sharp');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const force = process.argv.includes('--force');

// `width` / `height` are upper bounds (the image is never enlarged and keeps its aspect ratio).
// Sizes are picked from where each kind of image is displayed, with headroom for 2x screens.
const JOBS = [
  // Shown in a modal (max ~75vh tall); the sources were up to 3.6 MB each.
  { dir: 'public/images/CityImages', width: 1600, height: 1600, quality: 80 },
  // Encyclopedia cards (~160px tall) and the click-to-enlarge view.
  { dir: 'public/images/monsters', width: 768, height: 1024, quality: 78 },
  // Companion market / mount cards and beast selection.
  { dir: 'public/images/Mounts', width: 640, height: 960, quality: 78 },
  { dir: 'public/images/Beasts', width: 640, height: 960, quality: 78 },
  // The world map is displayed at container width; 2048px is its native size.
  { dir: 'src/assets/images/Campaign', only: ['WorldMap.jpg'], width: 2048, height: 2048, quality: 82 },
  // Placeholder silhouettes (displayed well under 500px wide).
  { dir: 'src/assets/images/Board', width: 640, height: 640, quality: 85 },
  // Full-page atmospheric backgrounds (background-size: cover). Width-bound because `cover`
  // scales by width on wide screens; they are dark/soft art so a lower quality is invisible.
  { dir: 'src/assets/images/backgrounds', only: ['BlackBackground.avif', 'BlueBackground.jpg', 'GreenBackground.jpg', 'RedBackground.jpg'], width: 2560, quality: 68 },
];

const SOURCE_EXT = /\.(png|jpe?g|avif)$/i;
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

async function convert(file, job) {
  const src = path.join(root, job.dir, file);
  const out = src.replace(SOURCE_EXT, '.webp');
  if (!force && fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) {
    return null;
  }

  let image = sharp(src).rotate().resize({
    width: job.width,
    height: job.height,
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Many of the source PNGs carry an alpha channel that is fully opaque; dropping it saves space.
  const stats = await sharp(src).stats();
  if (stats.isOpaque) image = image.removeAlpha();

  await image.webp({ quality: job.quality, alphaQuality: 90, effort: 6, smartSubsample: true }).toFile(out);
  return { file, before: fs.statSync(src).size, after: fs.statSync(out).size };
}

(async () => {
  let totalBefore = 0;
  let totalAfter = 0;
  for (const job of JOBS) {
    const dir = path.join(root, job.dir);
    const files = fs.readdirSync(dir).filter((f) => SOURCE_EXT.test(f) && (!job.only || job.only.includes(f)));
    for (const file of files) {
      const result = await convert(file, job);
      if (!result) continue;
      totalBefore += result.before;
      totalAfter += result.after;
      console.log(`${job.dir}/${file}`.padEnd(70), kb(result.before).padStart(9), '->', kb(result.after).padStart(8));
    }
  }
  console.log(`\nConverted total: ${kb(totalBefore)} -> ${kb(totalAfter)}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
