const Chat = require('../models/Chat');
const Message = require('../models/Message');
const jwt = require('jsonwebtoken');

/**
 * Socket Handler for Real-time Chat
 * Handles WebSocket connections and real-time messaging
 */
class SocketHandler {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> socketId mapping
    this.userSockets = new Map(); // socketId -> userId mapping
    
    this.setupSocketHandlers();
  }

  /**
   * Setup socket event handlers
   */
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('🔌 New socket connection:', socket.id);

      // Handle user authentication and connection
      socket.on('authenticate', async (data) => {
        try {
          const { token } = data;
          
          if (!token) {
            socket.emit('auth_error', { message: 'No token provided' });
            return;
          }

          // Verify JWT token
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const userId = decoded.id || decoded.userId;

          if (!userId) {
            socket.emit('auth_error', { message: 'Invalid token' });
            return;
          }

          // Store user connection
          this.connectedUsers.set(userId, socket.id);
          this.userSockets.set(socket.id, userId);
          
          socket.userId = userId;
          
          console.log(`✅ User ${userId} connected to chat service`);
          socket.emit('authenticated', { userId });

          // Join user to their personal room for notifications
          socket.join(`user_${userId}`);

        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('auth_error', { message: 'Authentication failed' });
        }
      });

      // Handle joining a chat room
      socket.on('join_chat', async (data) => {
        try {
          const { chatId } = data;
          
          if (!socket.userId) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
          }

          // Verify user is participant in this chat
          const chat = await Chat.findById(chatId);
          
          if (!chat) {
            socket.emit('error', { message: 'Chat not found' });
            return;
          }

          if (!chat.isParticipant(socket.userId)) {
            socket.emit('error', { message: 'Access denied' });
            return;
          }

          // Join the chat room
          socket.join(`chat_${chatId}`);
          
          console.log(`👥 User ${socket.userId} joined chat ${chatId}`);
          socket.emit('joined_chat', { chatId });

          // Notify other participants
          socket.to(`chat_${chatId}`).emit('user_joined', {
            chatId,
            userId: socket.userId
          });

        } catch (error) {
          console.error('Error joining chat:', error);
          socket.emit('error', { message: 'Failed to join chat' });
        }
      });

      // Handle leaving a chat room
      socket.on('leave_chat', async (data) => {
        try {
          const { chatId } = data;
          
          socket.leave(`chat_${chatId}`);
          
          console.log(`👋 User ${socket.userId} left chat ${chatId}`);
          socket.emit('left_chat', { chatId });

          // Notify other participants
          socket.to(`chat_${chatId}`).emit('user_left', {
            chatId,
            userId: socket.userId
          });

        } catch (error) {
          console.error('Error leaving chat:', error);
          socket.emit('error', { message: 'Failed to leave chat' });
        }
      });

      // Handle sending messages
      socket.on('send_message', async (data) => {
        try {
          const { chatId, content, contentType = 'text', metadata = {} } = data;
          
          if (!socket.userId) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
          }

          if (!content || !content.trim()) {
            socket.emit('error', { message: 'Message content is required' });
            return;
          }

          // Verify user is participant in this chat
          const chat = await Chat.findById(chatId);
          
          if (!chat) {
            socket.emit('error', { message: 'Chat not found' });
            return;
          }

          if (!chat.isParticipant(socket.userId)) {
            socket.emit('error', { message: 'Access denied' });
            return;
          }

          if (chat.status !== 'active') {
            socket.emit('error', { message: 'Chat is not active' });
            return;
          }

          // Create new message
          const newMessage = new Message({
            chatId,
            senderId: socket.userId,
            content: content.trim(),
            contentType,
            metadata
          });

          await newMessage.save();

          // Update chat with last message
          await chat.updateLastMessage({
            content: newMessage.content,
            senderId: newMessage.senderId,
            createdAt: newMessage.createdAt
          });

          // Increment unread count for other participant
          const otherParticipantId = chat.getOtherParticipant(socket.userId);
          await chat.incrementUnreadCount(otherParticipantId);

          // Emit message to all participants in the chat room
          const messageData = {
            messageId: newMessage._id,
            chatId: newMessage.chatId,
            senderId: newMessage.senderId,
            content: newMessage.content,
            contentType: newMessage.contentType,
            createdAt: newMessage.createdAt,
            metadata: newMessage.metadata
          };

          this.io.to(`chat_${chatId}`).emit('new_message', messageData);

          // Send notification to other participant if they're not in the chat room
          const otherParticipantSocketId = this.connectedUsers.get(otherParticipantId);
          if (otherParticipantSocketId) {
            this.io.to(otherParticipantSocketId).emit('message_notification', {
              chatId,
              message: messageData,
              unreadCount: chat.ownerId === otherParticipantId ? chat.unreadCounts.owner : chat.unreadCounts.seeker
            });
          }

          console.log(`💬 Message sent in chat ${chatId} by user ${socket.userId}`);

        } catch (error) {
          console.error('Error sending message:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // Handle marking messages as read
      socket.on('mark_read', async (data) => {
        try {
          const { chatId, messageIds = [] } = data;
          
          if (!socket.userId) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
          }

          // Verify user is participant in this chat
          const chat = await Chat.findById(chatId);
          
          if (!chat) {
            socket.emit('error', { message: 'Chat not found' });
            return;
          }

          if (!chat.isParticipant(socket.userId)) {
            socket.emit('error', { message: 'Access denied' });
            return;
          }

          // Mark messages as read
          await Message.markAsRead(chatId, socket.userId, messageIds);

          // Reset unread count for this user
          await chat.resetUnreadCount(socket.userId);

          // Notify other participants
          socket.to(`chat_${chatId}`).emit('messages_read', {
            chatId,
            userId: socket.userId,
            messageIds
          });

          console.log(`👁️ Messages marked as read in chat ${chatId} by user ${socket.userId}`);

        } catch (error) {
          console.error('Error marking messages as read:', error);
          socket.emit('error', { message: 'Failed to mark messages as read' });
        }
      });

      // Handle typing indicators
      socket.on('typing', (data) => {
        try {
          const { chatId, isTyping } = data;
          
          if (!socket.userId) {
            return;
          }

          // Broadcast typing status to other participants
          socket.to(`chat_${chatId}`).emit('user_typing', {
            chatId,
            userId: socket.userId,
            isTyping
          });

        } catch (error) {
          console.error('Error handling typing:', error);
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        try {
          const userId = this.userSockets.get(socket.id);
          
          if (userId) {
            this.connectedUsers.delete(userId);
            this.userSockets.delete(socket.id);
            console.log(`❌ User ${userId} disconnected from chat service`);
          }
        } catch (error) {
          console.error('Error handling disconnect:', error);
        }
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    });
  }

  /**
   * Get count of connected users
   */
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  /**
   * Get connected user IDs
   */
  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  /**
   * Send notification to specific user
   */
  sendNotificationToUser(userId, event, data) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }

  /**
   * Broadcast to all users in a chat
   */
  broadcastToChat(chatId, event, data) {
    this.io.to(`chat_${chatId}`).emit(event, data);
  }

  /**
   * Broadcast to all connected users
   */
  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }
}

module.exports = SocketHandler;