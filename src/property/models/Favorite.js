const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        required: true,
        index: true
    },
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: false // Optional - can favorite entire property or specific room
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    // Additional metadata
    notes: {
        type: String,
        default: ''
    },
    tags: [{
        type: String,
        default: []
    }]
}, {
    timestamps: true
});

// Compound index to ensure unique user-property-room combination
favoriteSchema.index({ userId: 1, propertyId: 1, roomId: 1 }, { unique: true });

// Index for efficient queries
favoriteSchema.index({ userId: 1, addedAt: -1 });

module.exports = mongoose.models.Favorite || mongoose.model('Favorite', favoriteSchema);
