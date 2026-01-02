const helmet = require('helmet');

// Security configuration using Helmet
const helmetConfig = helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "wss:", "ws:", "wss://dungeonlair.ddns.net", "https://dungeonlair.ddns.net"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  }
});

module.exports = { helmetConfig };
