# Lyvo Chat Service

A real-time chat microservice for the Lyvo room booking platform that enables communication between room owners and seekers after booking approval.

## 🚀 Features

- **Real-time Messaging**: WebSocket-based instant messaging
- **JWT Authentication**: Secure user authentication
- **MongoDB Integration**: Scalable data storage with Mongoose
- **REST API**: HTTP endpoints for chat management
- **Message Types**: Support for text, image, system, and file messages
- **Read Receipts**: Track message read status
- **Typing Indicators**: Real-time typing status
- **Chat Status Management**: Active, closed, and readonly states
- **Rate Limiting**: Protection against abuse
- **CORS Support**: Cross-origin resource sharing
- **Error Handling**: Comprehensive error management

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB Atlas account
- Existing Lyvo backend with JWT tokens

## 🛠️ Installation

1. **Clone and navigate to the chat service directory:**
   ```bash
   cd Lyvo-Backend/chat-service
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Configuration:**
   ```bash
   cp env.example .env
   ```

4. **Configure environment variables in `.env`:**
   ```env
   # Server Configuration
   PORT=5002
   NODE_ENV=development

   # MongoDB Atlas Configuration
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/lyvo_chat?retryWrites=true&w=majority

   # JWT Configuration (use same secret as main backend)
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRES_IN=7d

   # Internal API Key (for booking-service integration)
   INTERNAL_API_KEY=your-internal-api-key-here

   # CORS Configuration
   CORS_ORIGIN=http://localhost:3000,http://localhost:3001

   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100

   # Socket.io Configuration
   SOCKET_CORS_ORIGIN=http://localhost:3000,http://localhost:3001
   ```

## 🚀 Running the Service

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Using Start Scripts
```bash
# Windows
start.bat

# Linux/Mac
chmod +x start.sh
./start.sh
```

## 📡 API Endpoints

### Internal API (Booking Service Integration)

#### POST /api/chat/initiate
Creates a new chat when booking is approved.

**Headers:**
```
X-API-Key: your-internal-api-key
Content-Type: application/json
```

**Body:**
```json
{
  "bookingId": "booking123",
  "ownerId": "owner456",
  "seekerId": "seeker789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Chat initiated successfully",
  "data": {
    "chatId": "chat_object_id",
    "bookingId": "booking123",
    "ownerId": "owner456",
    "seekerId": "seeker789",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Public API (Frontend Integration)

#### GET /api/chat/user/:userId
Get all active chats for a user.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `status` (optional): active, closed, readonly

#### GET /api/chat/:chatId/messages
Get messages for a specific chat with pagination.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Messages per page (default: 50, max: 100)

#### POST /api/chat/:chatId/message
Send a message via HTTP (fallback for WebSocket).

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "content": "Hello, when can I move in?",
  "contentType": "text",
  "metadata": {}
}
```

#### POST /api/chat/:chatId/read
Mark messages as read.

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "messageIds": ["message_id_1", "message_id_2"]
}
```

#### PUT /api/chat/:chatId/status
Update chat status.

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "status": "readonly"
}
```

#### GET /api/chat/:chatId
Get chat details.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

## 🔌 WebSocket Events

### Client → Server Events

#### join_chat
Join a chat room.
```javascript
socket.emit('join_chat', { chatId: 'chat_object_id' });
```

#### send_message
Send a message.
```javascript
socket.emit('send_message', {
  chatId: 'chat_object_id',
  content: 'Hello!',
  contentType: 'text',
  metadata: {}
});
```

#### mark_read
Mark messages as read.
```javascript
socket.emit('mark_read', {
  chatId: 'chat_object_id',
  messageIds: ['message_id_1', 'message_id_2']
});
```

#### typing
Broadcast typing status.
```javascript
socket.emit('typing', {
  chatId: 'chat_object_id',
  isTyping: true
});
```

#### leave_chat
Leave a chat room.
```javascript
socket.emit('leave_chat', { chatId: 'chat_object_id' });
```

### Server → Client Events

#### receive_message
Receive a new message.
```javascript
socket.on('receive_message', (data) => {
  console.log('New message:', data);
  // data: { messageId, chatId, senderId, content, contentType, createdAt, readBy }
});
```

#### messages_read
Messages marked as read.
```javascript
socket.on('messages_read', (data) => {
  console.log('Messages read:', data);
  // data: { chatId, readBy, messageIds }
});
```

#### user_typing
User typing status.
```javascript
socket.on('user_typing', (data) => {
  console.log('User typing:', data);
  // data: { chatId, userId, isTyping }
});
```

#### chat_joined
Successfully joined chat.
```javascript
socket.on('chat_joined', (data) => {
  console.log('Joined chat:', data);
  // data: { chatId, status }
});
```

#### chat_status_updated
Chat status changed.
```javascript
socket.on('chat_status_updated', (data) => {
  console.log('Chat status updated:', data);
  // data: { chatId, status, updatedAt }
});
```

#### error
Error occurred.
```javascript
socket.on('error', (data) => {
  console.error('Socket error:', data);
  // data: { message }
});
```

## 🗄️ Database Schema

### Chat Collection
```javascript
{
  _id: ObjectId,
  bookingId: String (unique),
  ownerId: String,
  seekerId: String,
  status: String (active|closed|readonly),
  lastMessage: {
    content: String,
    senderId: String,
    createdAt: Date
  },
  unreadCounts: {
    owner: Number,
    seeker: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Message Collection
```javascript
{
  _id: ObjectId,
  chatId: ObjectId (ref: Chat),
  senderId: String,
  content: String,
  contentType: String (text|image|system|file),
  readBy: [String],
  metadata: {
    imageUrl: String,
    fileName: String,
    systemAction: String,
    isEdited: Boolean,
    replyTo: ObjectId
  },
  createdAt: Date
}
```

## 🔧 Integration with Existing Services

### Booking Service Integration

When a booking is approved, call the chat initiation endpoint:

```javascript
// In your booking service
const response = await fetch('http://localhost:5002/api/chat/initiate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.INTERNAL_API_KEY
  },
  body: JSON.stringify({
    bookingId: booking._id,
    ownerId: booking.ownerId,
    seekerId: booking.seekerId
  })
});
```

### Frontend Integration

#### React Socket.io Client Setup

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5002', {
  auth: {
    token: localStorage.getItem('authToken')
  }
});

// Join a chat
socket.emit('join_chat', { chatId: 'chat_id' });

// Send a message
socket.emit('send_message', {
  chatId: 'chat_id',
  content: 'Hello!',
  contentType: 'text'
});

// Listen for messages
socket.on('receive_message', (message) => {
  // Handle new message
});
```

## 🛡️ Security Features

- **JWT Authentication**: All endpoints require valid JWT tokens
- **Internal API Key**: Protects internal endpoints from unauthorized access
- **Rate Limiting**: Prevents abuse and spam
- **CORS Protection**: Configurable cross-origin resource sharing
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Secure error responses without sensitive data

## 📊 Monitoring and Logging

The service includes comprehensive logging for:
- Connection events
- Message sending/receiving
- Authentication attempts
- Error occurrences
- Performance metrics

## 🚨 Error Handling

All errors are handled gracefully with appropriate HTTP status codes and meaningful error messages:

- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (access denied)
- `404` - Not Found (resource not found)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## 🔄 Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=5002
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/lyvo_chat
JWT_SECRET=your-production-jwt-secret
INTERNAL_API_KEY=your-production-api-key
CORS_ORIGIN=https://yourdomain.com
```

### Docker Support (Optional)

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5002
CMD ["npm", "start"]
```

## 📚 API Documentation

Visit `http://localhost:5002/api/chat/docs` for complete API documentation.

## 🆘 Support

For issues and questions:
1. Check the logs for error details
2. Verify environment configuration
3. Ensure MongoDB Atlas connectivity
4. Check JWT token validity

## 📝 License

MIT License - See LICENSE file for details.