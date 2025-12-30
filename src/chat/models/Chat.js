const mongoose = require('mongoose');

/**
 * Chat Schema
 * Represents a chat conversation between room owner and seeker
 * Created automatically when booking is approved
 */
const chatSchema = new mongoose.Schema({
  // Reference to the booking document in the main booking service
  bookingId: {
    type: String,
    required: [true, 'Booking ID is required'],
    unique: true,
    trim: true
  },
  
  // Owner's user ID
  ownerId: {
    type: String,
    required: [true, 'Owner ID is required'],
    trim: true
  },
  
  // Seeker's user ID
  seekerId: {
    type: String,
    required: [true, 'Seeker ID is required'],
    trim: true
  },
  
  // Chat status
  status: {
    type: String,
    enum: {
      values: ['active', 'closed', 'readonly'],
      message: 'Status must be either active, closed, or readonly'
    },
    default: 'active',
    index: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Optional: Last message preview for quick access
  lastMessage: {
    content: {
      type: String,
      maxlength: [200, 'Last message content cannot exceed 200 characters']
    },
    senderId: {
      type: String
    },
    createdAt: {
      type: Date
    }
  },
  
  // Optional: Unread message counts for each participant
  unreadCounts: {
    owner: {
      type: Number,
      default: 0,
      min: 0
    },
    seeker: {
      type: Number,
      default: 0,
      min: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
chatSchema.index({ ownerId: 1, status: 1 });
chatSchema.index({ seekerId: 1, status: 1 });
chatSchema.index({ bookingId: 1 });
chatSchema.index({ updatedAt: -1 });

// Virtual for getting the other participant's ID
chatSchema.virtual('getOtherParticipant').get(function() {
  return function(userId) {
    if (this.ownerId === userId) {
      return this.seekerId;
    } else if (this.seekerId === userId) {
      return this.ownerId;
    }
    return null;
  };
});

// Virtual for checking if user is participant
chatSchema.virtual('isParticipant').get(function() {
  return function(userId) {
    return this.ownerId === userId || this.seekerId === userId;
  };
});

// Pre-save middleware to update updatedAt
chatSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to find chat by booking ID
chatSchema.statics.findByBookingId = function(bookingId) {
  return this.findOne({ bookingId });
};

// Static method to find user's active chats
chatSchema.statics.findUserChats = function(userId, status = 'active') {
  return this.find({
    $or: [
      { ownerId: userId },
      { seekerId: userId }
    ],
    status: status
  }).sort({ updatedAt: -1 });
};

// Static method to check if chat exists for booking
chatSchema.statics.existsForBooking = function(bookingId) {
  return this.exists({ bookingId });
};

// Instance method to update last message
chatSchema.methods.updateLastMessage = function(messageData) {
  this.lastMessage = {
    content: messageData.content,
    senderId: messageData.senderId,
    createdAt: messageData.createdAt
  };
  return this.save();
};

// Instance method to increment unread count
chatSchema.methods.incrementUnreadCount = function(userId) {
  if (this.ownerId === userId) {
    this.unreadCounts.owner += 1;
  } else if (this.seekerId === userId) {
    this.unreadCounts.seeker += 1;
  }
  return this.save();
};

// Instance method to reset unread count
chatSchema.methods.resetUnreadCount = function(userId) {
  if (this.ownerId === userId) {
    this.unreadCounts.owner = 0;
  } else if (this.seekerId === userId) {
    this.unreadCounts.seeker = 0;
  }
  return this.save();
};

module.exports = mongoose.model('Chat', chatSchema);
