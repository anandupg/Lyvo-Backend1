require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./src/config/db');
const { Server } = require('socket.io');

// Initialize App
const app = express();
const server = http.createServer(app);

// Connect Database
connectDB();

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'https://lyvoplatform.vercel.app',
            // Add any other domains here
        ];

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || process.env.CORS_ORIGIN?.split(',').includes(origin)) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(helmet());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Socket.io (Global)
const io = new Server(server, {
    cors: {
        origin: [
            'http://localhost:5173',
            'http://localhost:3000',
            'https://lyvoplatform.vercel.app'
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});
global.io = io; // Make io accessible globally if needed, or pass it to routes

const { socketAuthMiddleware } = require('./src/middleware/auth');
const initChatSocket = require('./src/chat/socket');

// Routes
const userRoutes = require('./src/user/routes');
const chatRoutes = require('./src/chat/routes');

app.use('/api', userRoutes);
app.use('/api/chat', chatRoutes);

// Property Service Routes
const propertyRoutes = require('./src/property/routes');
const notificationRoutes = require('./src/property/notificationRoutes');

app.use('/api/property', propertyRoutes);
app.use('/api/notifications', notificationRoutes);

// OCR Service Routes
const ocrRoutes = require('./src/ocr/routes');
app.use('/api/ocr', ocrRoutes);

// Maintenance Service Routes
const maintenanceRoutes = require('./src/maintenance/routes');
app.use('/api/maintenance', maintenanceRoutes);

// Socket.io Middleware
io.use(socketAuthMiddleware);

// Initialize Socket Modules
initChatSocket(io);

// Start Python OCR Service (for Single Service Deployment)
const { spawn } = require('child_process');
const path = require('path');

try {
    const pythonScriptPath = path.join(__dirname, 'src', 'OCR-services', 'app.py');
    const pythonProcess = spawn('python', [pythonScriptPath], {
        stdio: 'inherit' // Pipe output
    });

    pythonProcess.on('error', (err) => {
        console.error('❌ Failed to start Python OCR service:', err);
    });

    console.log('✅ Python OCR Service started via spawn');
} catch (error) {
    console.error('⚠️ Error spawning Python process:', error);
}

// Output:
// ...
// Root endpoint
app.get('/', (req, res) => {
    res.send("Lyvo Backend is running 🚀");
});

// Port
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
