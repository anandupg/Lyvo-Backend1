const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient_id: {
        type: String,
        required: true,
        index: true
    },
    recipient_type: {
        type: String,
        enum: ['owner', 'seeker', 'admin'],
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['property_approved', 'property_rejected', 'room_approved', 'room_rejected', 'booking_request', 'booking_approved', 'booking_rejected', 'payment_received', 'maintenance_request', 'general', 'booking'],
        default: 'general'
    },
    related_property_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        default: null
    },
    related_room_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        default: null
    },
    related_booking_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        default: null
    },
    action_url: {
        type: String,
        default: null
    },
    is_read: {
        type: Boolean,
        default: false
    },
    read_at: {
        type: Date,
        default: null
    },
    created_by: {
        type: String,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Index for efficient queries
notificationSchema.index({ recipient_id: 1, is_read: 1, createdAt: -1 });
notificationSchema.index({ created_at: 1 }, { expireAfterSeconds: 2592000 }); // Auto-delete after 30 days

module.exports = mongoose.model('Notification', notificationSchema);
