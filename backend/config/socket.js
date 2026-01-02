// Socket.IO configuration

const socketConfig = {
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token', 'Accept', 'Origin', 'X-Requested-With']
  }
};

module.exports = { socketConfig };
