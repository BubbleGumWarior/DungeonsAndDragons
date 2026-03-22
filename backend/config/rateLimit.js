const rateLimit = require('express-rate-limit');

// Rate limiting configuration
// Campaign apps make many requests on load (characters, kingdoms, armies, socket, etc.)
// and multiple players may share the same IP (NAT/proxy). 1000 req/min per IP is a
// practical floor; genuine DoS attempts will still be blocked.
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 50000, // 1000 requests per minute per IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { limiter };
