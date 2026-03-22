// Rate limiting disabled
const limiter = (_req, _res, next) => next();

module.exports = { limiter };
