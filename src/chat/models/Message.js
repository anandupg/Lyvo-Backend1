const mongoose = require('mongoose');

/**
 * Message Schema
 * Represents individual messages within a chat
 */
const messageSchema = new mongoose.Schema({
  // Reference to the chat document
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: [true, 'Chat ID is required'],
    index: true
  },
  
  // Sender's user ID
  senderId: {
    type: String,
    required: [true, 'Sender ID is required'],
    trim: true,
    index: true
  },
  
  // Message content
  content: {
    type: String,
    required: [true, 'Message content is required'],
    maxlength: [2000, 'Message content cannot exceed 2000 characters'],
    trim: true
  },
  
  // Type of message content
  contentType: {
    type: String,
    enum: {
      values: ['text', 'image', 'system', 'file'],
      message: 'Content type must be text, image, system, or file'
    },
    default: 'text'
  },
  
  // Array of user IDs who have read this message
  readBy: [{
    type: String,
    trim: true
  }],
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Optional: Message metadata
  metadata: {
    // For image messages
    imageUrl: String,
    imageSize: Number,
    
    // For file messages
    fileName: String,
    fileSize: Number,
    fileType: String,
    
    // For system messages
    systemAction: String, // e.g., 'booking_confirmed', 'booking_cancelled'
    
    // Message status
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: Date,
    
    // Reply to another message
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for better query performance
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ chatId: 1, senderId: 1 });
messageSchema.index({ createdAt: -1 });

// Virtual for checking if message is read by user
messageSchema.virtual('isReadBy').get(function() {
  return function(userId) {
    return this.readBy.includes(userId);
  };
});

// Virtual for getting read status
messageSchema.virtual('readStatus').get(function() {
  return {
    isRead: this.readBy.length > 0,
    readBy: this.readBy,
    readCount: this.readBy.length
  };
});

// Pre-save middleware to validate content based on type
messageSchema.pre('save', function(next) {
  // Validate image messages
  if (this.contentType === 'image' && !this.metadata?.imageUrl) {
    return next(new Error('Image URL is required for image messages'));
  }
  
  // Validate file messages
  if (this.contentType === 'file' && !this.metadata?.fileName) {
    return next(new Error('File name is required for file messages'));
  }
  
  // System messages should not have empty content
  if (this.contentType === 'system' && !this.content.trim()) {
    return next(new Error('System messages must have content'));
  }
  
  next();
});

// Static method to find messages by chat ID with pagination
messageSchema.statics.findByChatId = function(chatId, options = {}) {
  const {
    page = 1,
    limit = 50,
    sort = { createdAt: -1 }
  } = options;
  
  const skip = (page - 1) * limit;
  
  return this.find({ chatId })
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Static method to get unread message count for user in chat
messageSchema.statics.getUnreadCount = function(chatId, userId) {
  return this.countDocuments({
    chatId,
    senderId: { $ne: userId },
    readBy: { $nin: [userId] }
  });
};

// Static method to mark messages as read
messageSchema.statics.markAsRead = function(chatId, userId, messageIds = []) {
  const query = {
    chatId,
    readBy: { $nin: [userId] }
  };
  
  if (messageIds.length > 0) {
    query._id = { $in: messageIds };
  }
  
  return this.updateMany(query, {
    $addToSet: { readBy: userId }
  });
};

// Static method to get latest message in chat
messageSchema.statics.getLatestMessage = function(chatId) {
  return this.findOne({ chatId })
    .sort({ createdAt: -1 })
    .limit(1);
};

// Instance method to mark message as read by user
messageSchema.methods.markAsReadBy = function(userId) {
  if (!this.readBy.includes(userId)) {
    this.readBy.push(userId);
    return this.save();
  }
  return Promise.resolve(this);
};

// Instance method to check if user can read this message
messageSchema.methods.canBeReadBy = function(userId, chat) {
  // User must be participant in the chat
  return chat.ownerId === userId || chat.seekerId === userId;
};

// Instance method to get message preview (for chat list)
messageSchema.methods.getPreview = function() {
  const maxLength = 100;
  let preview = this.content;
  
  if (this.contentType === 'image') {
    preview = '📷 Image';
  } else if (this.contentType === 'file') {
    preview = `📎 ${this.metadata?.fileName || 'File'}`;
  } else if (this.contentType === 'system') {
    preview = `🔔 ${this.content}`;
  }
  
  if (preview.length > maxLength) {
    preview = preview.substring(0, maxLength) + '...';
  }
  
  return preview;
};

module.exports = mongoose.model('Message', messageSchema);