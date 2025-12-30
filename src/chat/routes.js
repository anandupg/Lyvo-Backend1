const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const ChatController = require('./controllers/chatController');
const { authMiddleware, internalApiKeyMiddleware } = require('./middleware/authMiddleware');

const router = express.Router();

/**
 * Validation middleware
 */
const validateInitiateChat = [
  body('bookingId')
    .notEmpty()
    .withMessage('Booking ID is required')
    .isString()
    .withMessage('Booking ID must be a string')
    .trim(),
  body('ownerId')
    .notEmpty()
    .withMessage('Owner ID is required')
    .isString()
    .withMessage('Owner ID must be a string')
    .trim(),
  body('seekerId')
    .notEmpty()
    .withMessage('Seeker ID is required')
    .isString()
    .withMessage('Seeker ID must be a string')
    .trim()
];

const validateSendMessage = [
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isString()
    .withMessage('Content must be a string')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Content must be between 1 and 2000 characters')
    .trim(),
  body('contentType')
    .optional()
    .isIn(['text', 'image', 'system', 'file'])
    .withMessage('Content type must be text, image, system, or file'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

const validateMarkAsRead = [
  body('messageIds')
    .optional()
    .isArray()
    .withMessage('Message IDs must be an array'),
  body('messageIds.*')
    .optional()
    .isMongoId()
    .withMessage('Each message ID must be a valid MongoDB ObjectId')
];

const validateUpdateStatus = [
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['active', 'closed', 'readonly'])
    .withMessage('Status must be active, closed, or readonly')
];

const validateUserId = [
  param('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .isString()
    .withMessage('User ID must be a string')
    .trim()
];

const validateChatId = [
  param('chatId')
    .notEmpty()
    .withMessage('Chat ID is required')
    .isMongoId()
    .withMessage('Chat ID must be a valid MongoDB ObjectId')
];

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['active', 'closed', 'readonly'])
    .withMessage('Status must be active, closed, or readonly')
];

/**
 * Error handling middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
      error: 'VALIDATION_ERROR'
    });
  }
  next();
};

/**
 * Routes
 */

// Internal API routes (called by other services)
router.post('/initiate',
  internalApiKeyMiddleware,
  validateInitiateChat,
  handleValidationErrors,
  ChatController.initiateChat
);

router.post('/delete-by-booking',
  internalApiKeyMiddleware,
  [
    body('bookingId')
      .notEmpty()
      .withMessage('Booking ID is required')
      .isString()
      .withMessage('Booking ID must be a string')
      .trim()
  ],
  handleValidationErrors,
  ChatController.deleteChatByBookingId
);

// Public API routes (require JWT authentication)
router.get('/user/:userId',
  authMiddleware,
  validateUserId,
  handleValidationErrors,
  ChatController.getUserChats
);

router.get('/:chatId/messages',
  authMiddleware,
  validateChatId,
  validatePagination,
  handleValidationErrors,
  ChatController.getChatMessages
);

router.post('/:chatId/message',
  authMiddleware,
  validateChatId,
  validateSendMessage,
  handleValidationErrors,
  ChatController.sendMessage
);

router.post('/:chatId/read',
  authMiddleware,
  validateChatId,
  validateMarkAsRead,
  handleValidationErrors,
  ChatController.markMessagesAsRead
);

router.put('/:chatId/status',
  authMiddleware,
  validateChatId,
  validateUpdateStatus,
  handleValidationErrors,
  ChatController.updateChatStatus
);

router.get('/:chatId',
  authMiddleware,
  validateChatId,
  handleValidationErrors,
  ChatController.getChatDetails
);

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Chat service is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * API documentation endpoint
 */
router.get('/docs', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Chat Service API Documentation',
    version: '1.0.0',
    endpoints: {
      'POST /api/chat/initiate': {
        description: 'Initiate a new chat when booking is approved',
        authentication: 'Internal API Key',
        body: {
          bookingId: 'string (required)',
          ownerId: 'string (required)',
          seekerId: 'string (required)'
        }
      },
      'POST /api/chat/delete-by-booking': {
        description: 'Delete chat and all messages when booking is cancelled',
        authentication: 'Internal API Key',
        body: {
          bookingId: 'string (required)'
        }
      },
      'GET /api/chat/user/:userId': {
        description: 'Get all active chats for a user',
        authentication: 'JWT Bearer Token',
        query: {
          status: 'string (optional: active, closed, readonly)'
        }
      },
      'GET /api/chat/:chatId/messages': {
        description: 'Get messages for a specific chat with pagination',
        authentication: 'JWT Bearer Token',
        query: {
          page: 'number (optional, default: 1)',
          limit: 'number (optional, default: 50, max: 100)'
        }
      },
      'POST /api/chat/:chatId/message': {
        description: 'Send a message via HTTP (fallback for WebSocket)',
        authentication: 'JWT Bearer Token',
        body: {
          content: 'string (required, max: 2000)',
          contentType: 'string (optional: text, image, system, file)',
          metadata: 'object (optional)'
        }
      },
      'POST /api/chat/:chatId/read': {
        description: 'Mark messages as read',
        authentication: 'JWT Bearer Token',
        body: {
          messageIds: 'array (optional)'
        }
      },
      'PUT /api/chat/:chatId/status': {
        description: 'Update chat status',
        authentication: 'JWT Bearer Token',
        body: {
          status: 'string (required: active, closed, readonly)'
        }
      },
      'GET /api/chat/:chatId': {
        description: 'Get chat details',
        authentication: 'JWT Bearer Token'
      }
    },
    websocket: {
      'send_message': {
        description: 'Send a message via WebSocket',
        data: {
          chatId: 'string (required)',
          content: 'string (required)',
          contentType: 'string (optional)',
          metadata: 'object (optional)'
        }
      },
      'receive_message': {
        description: 'Receive a message via WebSocket',
        data: {
          messageId: 'string',
          chatId: 'string',
          senderId: 'string',
          content: 'string',
          contentType: 'string',
          createdAt: 'string (ISO date)'
        }
      },
      'mark_read': {
        description: 'Mark messages as read',
        data: {
          chatId: 'string (required)',
          messageIds: 'array (optional)'
        }
      },
      'typing': {
        description: 'Broadcast typing status',
        data: {
          chatId: 'string (required)',
          isTyping: 'boolean (required)'
        }
      }
    }
  });
});

module.exports = router;
