const { Server } = require('socket.io');
const Chat = require('./models/Chat');
const Message = require('./models/Message');
const { socketAuthMiddleware } = require('./middleware/authMiddleware');

/**
 * Socket.io configuration and event handlers
 */
class SocketManager {
  constructor(io) {
    this.io = io;

    // Middleware is already set up in server.js, but we can add chat-specific ones if needed
    // this.setupMiddleware(); 

    this.setupEventHandlers();
    this.setupConnectionHandlers();
  }

  /**
   * Setup Socket.io middleware
   */
  setupMiddleware() {
    // Authentication middleware
    this.io.use(socketAuthMiddleware);

    // Connection logging
    this.io.use((socket, next) => {
      console.log(`🔌 New socket connection attempt from user: ${socket.user?.id || 'unknown'}`);
      next();
    });
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const userId = socket.user.id;
      console.log(`✅ User ${userId} connected to chat service`);

      // Join user to their personal room for notifications
      socket.join(`user_${userId}`);

      // Handle joining a chat room
      socket.on('join_chat', async (data) => {
        try {
          const { chatId } = data;

          if (!chatId) {
            socket.emit('error', { message: 'Chat ID is required' });
            return;
          }

          // Verify user is participant in this chat
          const chat = await Chat.findById(chatId);
          if (!chat || !chat.isParticipant(userId)) {
            socket.emit('error', { message: 'Access denied to this chat' });
            return;
          }

          // Join the chat room
          socket.join(`chat_${chatId}`);
          socket.currentChatId = chatId;

          console.log(`👥 User ${userId} joined chat ${chatId}`);

          // Notify user they successfully joined
          socket.emit('chat_joined', { chatId, status: 'success' });

          // Mark messages as read when joining
          await this.markMessagesAsRead(chatId, userId);

        } catch (error) {
          console.error('Error joining chat:', error);
          socket.emit('error', { message: 'Failed to join chat' });
        }
      });

      // Handle leaving a chat room
      socket.on('leave_chat', (data) => {
        const { chatId } = data;
        if (chatId) {
          socket.leave(`chat_${chatId}`);
          socket.currentChatId = null;
          console.log(`👋 User ${userId} left chat ${chatId}`);
        }
      });

      // Handle sending messages
      socket.on('send_message', async (data) => {
        try {
          const { chatId, content, contentType = 'text', metadata = {} } = data;

          if (!chatId || !content) {
            socket.emit('error', { message: 'Chat ID and content are required' });
            return;
          }

          // Verify user is participant in this chat
          const chat = await Chat.findById(chatId);
          if (!chat || !chat.isParticipant(userId)) {
            socket.emit('error', { message: 'Access denied to this chat' });
            return;
          }

          // Check if chat is active
          if (chat.status !== 'active') {
            socket.emit('error', { message: 'Cannot send messages to inactive chat' });
            return;
          }

          // Create new message
          const newMessage = new Message({
            chatId,
            senderId: userId,
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
          const otherParticipantId = chat.getOtherParticipant(userId);
          await chat.incrementUnreadCount(otherParticipantId);

          // Broadcast message to all participants in the chat room
          this.io.to(`chat_${chatId}`).emit('receive_message', {
            messageId: newMessage._id,
            chatId: newMessage.chatId,
            senderId: newMessage.senderId,
            content: newMessage.content,
            contentType: newMessage.contentType,
            metadata: newMessage.metadata,
            createdAt: newMessage.createdAt,
            readBy: newMessage.readBy
          });

          console.log(`💬 Message sent in chat ${chatId} by user ${userId}`);

        } catch (error) {
          console.error('Error sending message:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // Handle marking messages as read
      socket.on('mark_read', async (data) => {
        try {
          const { chatId, messageIds = [] } = data;

          if (!chatId) {
            socket.emit('error', { message: 'Chat ID is required' });
            return;
          }

          // Verify user is participant in this chat
          const chat = await Chat.findById(chatId);
          if (!chat || !chat.isParticipant(userId)) {
            socket.emit('error', { message: 'Access denied to this chat' });
            return;
          }

          // Mark messages as read
          await Message.markAsRead(chatId, userId, messageIds);

          // Reset unread count for this user
          await chat.resetUnreadCount(userId);

          // Notify other participants that messages were read
          socket.to(`chat_${chatId}`).emit('messages_read', {
            chatId,
            readBy: userId,
            messageIds
          });

          console.log(`👁️ Messages marked as read in chat ${chatId} by user ${userId}`);

        } catch (error) {
          console.error('Error marking messages as read:', error);
          socket.emit('error', { message: 'Failed to mark messages as read' });
        }
      });

      // Handle typing indicators
      socket.on('typing', (data) => {
        const { chatId, isTyping } = data;

        if (chatId && socket.currentChatId === chatId) {
          // Broadcast typing status to other participants
          socket.to(`chat_${chatId}`).emit('user_typing', {
            chatId,
            userId,
            isTyping
          });
        }
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`❌ User ${userId} disconnected: ${reason}`);

        // Notify other participants in current chat that user went offline
        if (socket.currentChatId) {
          socket.to(`chat_${socket.currentChatId}`).emit('user_offline', {
            chatId: socket.currentChatId,
            userId
          });
        }
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`Socket error for user ${userId}:`, error);
      });
    });
  }

  /**
   * Setup connection handlers
   */
  setupConnectionHandlers() {
    // Handle connection errors
    this.io.engine.on('connection_error', (err) => {
      console.error('Socket.io connection error:', err);
    });

    // Handle server shutdown
    process.on('SIGTERM', () => {
      console.log('🔄 Shutting down Socket.io server...');
      this.io.close(() => {
        console.log('✅ Socket.io server closed');
        process.exit(0);
      });
    });
  }

  /**
   * Mark messages as read for a user in a chat
   */
  async markMessagesAsRead(chatId, userId) {
    try {
      await Message.markAsRead(chatId, userId);

      const chat = await Chat.findById(chatId);
      if (chat) {
        await chat.resetUnreadCount(userId);
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }

  /**
   * Broadcast system message to a chat
   */
  async broadcastSystemMessage(chatId, content, systemAction = null) {
    try {
      const chat = await Chat.findById(chatId);
      if (!chat) return;

      const systemMessage = new Message({
        chatId,
        senderId: 'system',
        content,
        contentType: 'system',
        metadata: {
          systemAction
        }
      });

      await systemMessage.save();

      // Update chat with last message
      await chat.updateLastMessage({
        content: systemMessage.content,
        senderId: systemMessage.senderId,
        createdAt: systemMessage.createdAt
      });

      // Broadcast to all participants in the chat room
      this.io.to(`chat_${chatId}`).emit('receive_message', {
        messageId: systemMessage._id,
        chatId: systemMessage.chatId,
        senderId: systemMessage.senderId,
        content: systemMessage.content,
        contentType: systemMessage.contentType,
        metadata: systemMessage.metadata,
        createdAt: systemMessage.createdAt,
        readBy: systemMessage.readBy
      });

      console.log(`📢 System message broadcasted to chat ${chatId}`);

    } catch (error) {
      console.error('Error broadcasting system message:', error);
    }
  }

  /**
   * Update chat status and notify participants
   */
  async updateChatStatus(chatId, status) {
    try {
      const chat = await Chat.findById(chatId);
      if (!chat) return;

      chat.status = status;
      await chat.save();

      // Notify all participants about status change
      this.io.to(`chat_${chatId}`).emit('chat_status_updated', {
        chatId,
        status,
        updatedAt: chat.updatedAt
      });

      console.log(`📝 Chat ${chatId} status updated to ${status}`);

    } catch (error) {
      console.error('Error updating chat status:', error);
    }
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount() {
    return this.io.engine.clientsCount;
  }

  /**
   * Get connected users in a specific chat
   */
  getChatParticipants(chatId) {
    const room = this.io.sockets.adapter.rooms.get(`chat_${chatId}`);
    return room ? room.size : 0;
  }

  /**
   * Get Socket.io instance
   */
  getIO() {
    return this.io;
  }
}

module.exports = (io) => {
  new SocketManager(io);
};
