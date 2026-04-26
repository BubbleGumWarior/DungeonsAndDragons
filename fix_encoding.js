#!/usr/bin/env node
// Fix Mojibake in source files: UTF-8 emoji bytes were interpreted as Windows-1252
// and re-saved as UTF-8, turning e.g. 🎯 into ðŸŽ¯

const fs = require('fs');
const path = require('path');

// Windows-1252 special mappings for bytes 0x80-0x9F
// Maps Unicode codepoint (as stored in the garbled file) → original byte value
const win1252Reverse = {
  0x20AC: 0x80, // €
  0x201A: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201E: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02C6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8A, // Š
  0x2039: 0x8B, // ‹
  0x0152: 0x8C, // Œ
  0x017D: 0x8E, // Ž
  0x2018: 0x91, // '
  0x2019: 0x92, // '
  0x201C: 0x93, // "
  0x201D: 0x94, // "
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02DC: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9A, // š
  0x203A: 0x9B, // ›
  0x0153: 0x9C, // œ
  0x017E: 0x9E, // ž
  0x0178: 0x9F, // Ÿ
};

function cpToWin1252Byte(cp) {
  if (cp >= 0xA0 && cp <= 0xFF) return cp; // Latin-1 supplement maps 1:1
  if (cp in win1252Reverse) return win1252Reverse[cp];
  // Control chars 0x80-0x9F that have no special mapping pass through
  if (cp >= 0x0081 && cp <= 0x009F) return cp;
  return null; // Not a Win-1252 byte
}

function fixMojibake(content) {
  let result = '';
  let i = 0;

  while (i < content.length) {
    const cp = content.codePointAt(i);
    const charLen = cp > 0xFFFF ? 2 : 1;

    if (cp < 0x80) {
      // Plain ASCII — keep as-is
      result += content[i];
      i++;
      continue;
    }

    // Non-ASCII: try to collect a run of Win-1252-mappable chars and decode as UTF-8
    const bytes = [];
    let j = i;

    while (j < content.length) {
      const c = content.codePointAt(j);
      const cLen = c > 0xFFFF ? 2 : 1;
      if (c < 0x80) break;
      const b = cpToWin1252Byte(c);
      if (b === null) break;
      bytes.push(b);
      j += cLen;
    }

    if (bytes.length > 0) {
      const buf = Buffer.from(bytes);
      const decoded = buf.toString('utf8');
      // Only use decoded version if it doesn't contain replacement chars
      if (!decoded.includes('\uFFFD')) {
        result += decoded;
      } else {
        result += content.slice(i, j);
      }
      i = j;
    } else {
      result += content.slice(i, i + charLen);
      i += charLen;
    }
  }

  return result;
}

const filesToFix = process.argv.slice(2);
if (filesToFix.length === 0) {
  console.error('Usage: node fix_encoding.js <file> [file2 ...]');
  process.exit(1);
}

for (const filePath of filesToFix) {
  const abs = path.resolve(filePath);
  const content = fs.readFileSync(abs, 'utf8');
  const fixed = fixMojibake(content);
  if (fixed !== content) {
    fs.writeFileSync(abs, fixed, 'utf8');
    // Count changes
    let changed = 0;
    for (let i = 0; i < Math.max(content.length, fixed.length); i++) {
      if (content[i] !== fixed[i]) { changed++; }
    }
    console.log(`Fixed: ${abs} (${changed} char positions changed)`);
  } else {
    console.log(`No changes: ${abs}`);
  }
}
