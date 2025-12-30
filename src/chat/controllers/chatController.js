const Chat = require('../models/Chat');
const Message = require('../models/Message');
const userService = require('../services/userService');
const { validationResult } = require('express-validator');

/**
 * Chat Controller
 * Handles all chat-related business logic and API endpoints
 */
class ChatController {
  
  /**
   * Initiate a new chat when booking is approved
   * Called by booking-service via internal API
   */
  static async initiateChat(req, res) {
    try {
      const { bookingId, ownerId, seekerId } = req.body;

      // Validate required fields
      if (!bookingId || !ownerId || !seekerId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: bookingId, ownerId, seekerId',
          error: 'MISSING_FIELDS'
        });
      }

      // Check if chat already exists for this booking
      const existingChat = await Chat.findByBookingId(bookingId);
      
      if (existingChat) {
        return res.status(200).json({
          success: true,
          message: 'Chat already exists for this booking',
          data: {
            chatId: existingChat._id,
            status: existingChat.status,
            createdAt: existingChat.createdAt
          }
        });
      }

      // Create new chat
      const newChat = new Chat({
        bookingId,
        ownerId,
        seekerId,
        status: 'active'
      });

      await newChat.save();

      // Create initial system message
      const systemMessage = new Message({
        chatId: newChat._id,
        senderId: 'system',
        content: 'Booking confirmed! You can now chat with each other.',
        contentType: 'system',
        metadata: {
          systemAction: 'booking_confirmed'
        }
      });

      await systemMessage.save();

      // Update chat with last message
      await newChat.updateLastMessage({
        content: systemMessage.content,
        senderId: systemMessage.senderId,
        createdAt: systemMessage.createdAt
      });

      res.status(201).json({
        success: true,
        message: 'Chat initiated successfully',
        data: {
          chatId: newChat._id,
          bookingId: newChat.bookingId,
          ownerId: newChat.ownerId,
          seekerId: newChat.seekerId,
          status: newChat.status,
          createdAt: newChat.createdAt
        }
      });

    } catch (error) {
      console.error('Error initiating chat:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate chat',
        error: error.message
      });
    }
  }

  /**
   * Get all active chats for a user
   */
  static async getUserChats(req, res) {
    try {
      const { userId } = req.params;
      const { status = 'active' } = req.query;

      // Verify user is requesting their own chats
      if (req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own chats.',
          error: 'ACCESS_DENIED'
        });
      }

      // Get user's chats
      const chats = await Chat.findUserChats(userId, status);

      // Populate with latest message and participant details
      const chatsWithDetails = await Promise.all(
        chats.map(async (chat) => {
          const latestMessage = await Message.getLatestMessage(chat._id);
          const otherParticipantId = chat.getOtherParticipant(userId);
          
          // Get enriched chat data with real user details
          const enrichedChat = await userService.getEnrichedChatData(chat);
          const otherParticipant = await userService.getOtherParticipantDetails(chat, userId);
          
          return {
            chatId: chat._id,
            bookingId: chat.bookingId,
            status: chat.status,
            otherParticipantId,
            otherParticipant: otherParticipant ? {
              id: otherParticipant.id,
              name: otherParticipant.name,
              email: otherParticipant.email,
              phone: otherParticipant.phone,
              avatar: otherParticipant.avatar,
              role: otherParticipant.role
            } : null,
            propertyDetails: enrichedChat.propertyDetails,
            bookingDetails: enrichedChat.bookingDetails,
            lastMessage: latestMessage ? {
              content: latestMessage.getPreview(),
              senderId: latestMessage.senderId,
              createdAt: latestMessage.createdAt,
              contentType: latestMessage.contentType
            } : null,
            unreadCount: chat.ownerId === userId ? chat.unreadCounts.owner : chat.unreadCounts.seeker,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt
          };
        })
      );

      res.status(200).json({
        success: true,
        message: 'User chats retrieved successfully',
        data: {
          chats: chatsWithDetails,
          total: chatsWithDetails.length
        }
      });

    } catch (error) {
      console.error('Error getting user chats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user chats',
        error: error.message
      });
    }
  }

  /**
   * Get messages for a specific chat with pagination
   */
  static async getChatMessages(req, res) {
    try {
      const { chatId } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const userId = req.user.id;

      // Find chat and verify user is participant
      const chat = await Chat.findById(chatId);
      
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat not found',
          error: 'CHAT_NOT_FOUND'
        });
      }

      if (!chat.isParticipant(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not a participant in this chat.',
          error: 'ACCESS_DENIED'
        });
      }

      // Get messages with pagination
      const messages = await Message.findByChatId(chatId, {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { createdAt: -1 }
      });

      // Mark messages as read by current user
      const unreadMessageIds = messages
        .filter(msg => msg.senderId !== userId && !msg.isReadBy(userId))
        .map(msg => msg._id);

      if (unreadMessageIds.length > 0) {
        await Message.markAsRead(chatId, userId, unreadMessageIds);
        
        // Reset unread count for this user
        await chat.resetUnreadCount(userId);
      }

      res.status(200).json({
        success: true,
        message: 'Chat messages retrieved successfully',
        data: {
          messages: messages.reverse(), // Return in chronological order
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: messages.length
          },
          chat: {
            id: chat._id,
            bookingId: chat.bookingId,
            status: chat.status
          }
        }
      });

    } catch (error) {
      console.error('Error getting chat messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve chat messages',
        error: error.message
      });
    }
  }

  /**
   * Send a message via HTTP (fallback for WebSocket)
   */
  static async sendMessage(req, res) {
    try {
      const { chatId } = req.params;
      const { content, contentType = 'text', metadata = {} } = req.body;
      const userId = req.user.id;

      // Validate required fields
      if (!content || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Message content is required',
          error: 'MISSING_CONTENT'
        });
      }

      // Find chat and verify user is participant
      const chat = await Chat.findById(chatId);
      
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat not found',
          error: 'CHAT_NOT_FOUND'
        });
      }

      if (!chat.isParticipant(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not a participant in this chat.',
          error: 'ACCESS_DENIED'
        });
      }

      // Check if chat is active
      if (chat.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Cannot send messages to inactive chat',
          error: 'CHAT_INACTIVE'
        });
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

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: {
          messageId: newMessage._id,
          chatId: newMessage.chatId,
          senderId: newMessage.senderId,
          content: newMessage.content,
          contentType: newMessage.contentType,
          createdAt: newMessage.createdAt
        }
      });

    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message',
        error: error.message
      });
    }
  }

  /**
   * Mark messages as read
   */
  static async markMessagesAsRead(req, res) {
    try {
      const { chatId } = req.params;
      const { messageIds = [] } = req.body;
      const userId = req.user.id;

      // Find chat and verify user is participant
      const chat = await Chat.findById(chatId);
      
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat not found',
          error: 'CHAT_NOT_FOUND'
        });
      }

      if (!chat.isParticipant(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not a participant in this chat.',
          error: 'ACCESS_DENIED'
        });
      }

      // Mark messages as read
      await Message.markAsRead(chatId, userId, messageIds);

      // Reset unread count for this user
      await chat.resetUnreadCount(userId);

      res.status(200).json({
        success: true,
        message: 'Messages marked as read successfully'
      });

    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark messages as read',
        error: error.message
      });
    }
  }

  /**
   * Update chat status (e.g., when booking is cancelled)
   */
  static async updateChatStatus(req, res) {
    try {
      const { chatId } = req.params;
      const { status } = req.body;

      if (!['active', 'closed', 'readonly'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be active, closed, or readonly.',
          error: 'INVALID_STATUS'
        });
      }

      const chat = await Chat.findById(chatId);
      
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat not found',
          error: 'CHAT_NOT_FOUND'
        });
      }

      chat.status = status;
      await chat.save();

      res.status(200).json({
        success: true,
        message: 'Chat status updated successfully',
        data: {
          chatId: chat._id,
          status: chat.status,
          updatedAt: chat.updatedAt
        }
      });

    } catch (error) {
      console.error('Error updating chat status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update chat status',
        error: error.message
      });
    }
  }

  /**
   * Delete chat and all messages (called when booking is cancelled)
   * Internal API endpoint for other services
   */
  static async deleteChatByBookingId(req, res) {
    try {
      const { bookingId } = req.body;

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required',
          error: 'MISSING_BOOKING_ID'
        });
      }

      // Find chat by booking ID
      const chat = await Chat.findByBookingId(bookingId);
      
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat not found for this booking',
          error: 'CHAT_NOT_FOUND'
        });
      }

      // Delete all messages in the chat
      const deletedMessages = await Message.deleteMany({ chatId: chat._id });
      
      // Delete the chat itself
      await Chat.findByIdAndDelete(chat._id);

      console.log(`✅ Chat deleted for booking ${bookingId}: ${deletedMessages.deletedCount} messages deleted`);

      res.status(200).json({
        success: true,
        message: 'Chat and messages deleted successfully',
        data: {
          bookingId,
          chatId: chat._id,
          deletedMessagesCount: deletedMessages.deletedCount,
          deletedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Error deleting chat:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete chat',
        error: error.message
      });
    }
  }

  /**
   * Get chat details
   */
  static async getChatDetails(req, res) {
    try {
      const { chatId } = req.params;
      const userId = req.user.id;

      const chat = await Chat.findById(chatId);
      
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat not found',
          error: 'CHAT_NOT_FOUND'
        });
      }

      if (!chat.isParticipant(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not a participant in this chat.',
          error: 'ACCESS_DENIED'
        });
      }

      const otherParticipantId = chat.getOtherParticipant(userId);

      res.status(200).json({
        success: true,
        message: 'Chat details retrieved successfully',
        data: {
          chatId: chat._id,
          bookingId: chat.bookingId,
          status: chat.status,
          otherParticipantId,
          unreadCount: chat.ownerId === userId ? chat.unreadCounts.owner : chat.unreadCounts.seeker,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt
        }
      });

    } catch (error) {
      console.error('Error getting chat details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve chat details',
        error: error.message
      });
    }
  }
}

module.exports = ChatController;
