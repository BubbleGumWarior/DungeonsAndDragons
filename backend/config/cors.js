// CORS configuration for the application

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In production, allow dungeonlair.ddns.net and any origin
    if (process.env.NODE_ENV === 'production') {
      return callback(null, true);
    }
    
    // In development, only allow localhost
    const allowedOrigins = [
      'http://localhost:3000', 
      'http://127.0.0.1:3000', 
      'http://localhost:3001',
      'http://localhost:5000'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token', 'Accept', 'Origin', 'X-Requested-With'],
  preflightContinue: false
};

module.exports = { corsOptions };
