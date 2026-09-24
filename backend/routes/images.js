const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');
const {
  KINDS,
  CACHE_CONTROL,
  verifySignature,
  renderVariant,
  parseWidth,
  cacheGet,
  cacheSet,
} = require('../utils/imageService');

// GET /api/images/:kind/:id?v=<version>&s=<signature>[&w=<thumbnail width>]
// Serves an image stored in the database. No Authorization header is needed (so <img> tags and
// CSS backgrounds work); access is granted by the signature the server put in the URL it handed
// out to an authorised viewer. Because the URL changes whenever the image does, the response can
// be cached by the browser "forever".
router.get('/:kind/:id', async (req, res) => {
  try {
    const { kind } = req.params;
    const table = KINDS[kind];
    const id = Number.parseInt(req.params.id, 10);
    const { v, s } = req.query;

    // Unknown kind, bad id or bad signature all look the same to the caller.
    if (!table || !Number.isInteger(id) || id <= 0 || !verifySignature(kind, id, v, s)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const width = parseWidth(req.query.w);
    const etag = `"${v}-${width || 0}"`;
    res.set('Cache-Control', CACHE_CONTROL);
    res.set('ETag', etag);
    if (req.fresh) return res.status(304).end();

    const cacheKey = `${kind}:${id}:${v}:${width || 0}`;
    let variant = cacheGet(cacheKey);
    if (!variant) {
      // `table` comes from the KINDS whitelist above, never from user input.
      const result = await pool.query(`SELECT image_data, image_mime_type FROM ${table} WHERE id = $1`, [id]);
      const row = result.rows[0];
      if (!row || !row.image_data) {
        res.removeHeader('Cache-Control');
        res.removeHeader('ETag');
        return res.status(404).json({ error: 'Image not found' });
      }
      variant = await renderVariant(row.image_data, row.image_mime_type, width);
      cacheSet(cacheKey, variant);
    }

    res.set('Content-Type', variant.type);
    res.send(variant.buffer);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to load image' });
  }
});

module.exports = router;
