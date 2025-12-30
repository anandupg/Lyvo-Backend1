require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import database connection
const connectDB = require('./db');

// Import routes
const chatRoutes = require('./routes/chatRoutes');

// Import socket manager
const SocketManager = require('./socket');

/**
 * Express App Configuration
 */
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const socketManager = new SocketManager(server);

// Make socket manager available globally for other modules
global.socketManager = socketManager;

/**
 * Security Middleware
 */
app.use(helmet({
  contentSecurityPolicy: false, // Disable for Socket.io compatibility
  crossOriginEmbedderPolicy: false
}));

/**
 * CORS Configuration
 */
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Internal-Key'],
  credentials: true
};
app.use(cors(corsOptions));

/**
 * Rate Limiting
 */
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    error: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes except health check
app.use((req, res, next) => {
  if (req.path === '/api/chat/health') {
    return next();
  }
  return limiter(req, res, next);
});

/**
 * Body Parsing Middleware
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Request Logging Middleware
 */
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

/**
 * Routes
 */
app.use('/api/chat', chatRoutes);

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Lyvo Chat Service API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/chat/health',
      docs: '/api/chat/docs',
      websocket: 'ws://localhost:5002'
    }
  });
});

/**
 * 404 Handler
 */
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    error: 'NOT_FOUND',
    availableEndpoints: [
      'GET /',
      'GET /api/chat/health',
      'GET /api/chat/docs',
      'POST /api/chat/initiate',
      'GET /api/chat/user/:userId',
      'GET /api/chat/:chatId/messages',
      'POST /api/chat/:chatId/message',
      'POST /api/chat/:chatId/read',
      'PUT /api/chat/:chatId/status',
      'GET /api/chat/:chatId'
    ]
  });
});

/**
 * Global Error Handler
 */
app.use((error, req, res, next) => {
  console.error('Global Error Handler:', error);

  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors,
      error: 'VALIDATION_ERROR'
    });
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
      error: 'DUPLICATE_KEY'
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: 'INVALID_TOKEN'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      error: 'TOKEN_EXPIRED'
    });
  }

  // Default error response
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal Server Error',
    error: error.name || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

/**
 * Graceful Shutdown Handler
 */
const gracefulShutdown = async (signal) => {
  console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close HTTP server
    await new Promise((resolve) => {
      server.close(() => {
        console.log('✅ HTTP server closed');
        resolve();
      });
    });
    
    // Close database connection (no callback in Mongoose 7+)
    if (global.mongoose && global.mongoose.connection) {
      await global.mongoose.connection.close();
      console.log('✅ Database connection closed');
    }
    
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Start Server
 */
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Store mongoose connection globally
    global.mongoose = require('mongoose');

    // Start HTTP server
    const PORT = process.env.PORT || 5002;
    server.listen(PORT, () => {
      console.log('\n🚀 Lyvo Chat Service Started Successfully!');
      console.log('=====================================');
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🌐 HTTP API: http://localhost:${PORT}`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api/chat/docs`);
      console.log(`❤️  Health Check: http://localhost:${PORT}/api/chat/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('=====================================\n');

      // Optional: Log connected users count every 5 minutes (uncomment if needed)
      // setInterval(() => {
      //   const connectedUsers = socketManager.getConnectedUsersCount();
      //   console.log(`👥 Connected users: ${connectedUsers}`);
      // }, 300000); // 5 minutes
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = { app, server, socketManager };
