const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'payment_pending', 'payment_completed', 'pending_approval', 'approved', 'rejected', 'checked_in'], default: 'payment_pending', index: true },
    bookedAt: { type: Date, default: Date.now },

    // Approval Information
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: null },

    // Check-in Information
    checkInDate: { type: Date, default: null },

    // Cancellation Information
    cancelledBy: { type: String, enum: ['user', 'owner', 'admin', null], default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null },

    // Soft Delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },

    // Payment Information
    payment: {
        totalAmount: { type: Number, required: true },
        securityDeposit: { type: Number, required: true },
        monthlyRent: { type: Number, required: true },
        currency: { type: String, default: 'INR' },
        razorpayOrderId: { type: String, default: null },
        razorpayPaymentId: { type: String, default: null },
        razorpaySignature: { type: String, default: null },
        paymentStatus: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
        paymentMethod: { type: String, default: 'razorpay' },
        paidAt: { type: Date, default: null }
    },

    // Snapshot fields (denormalized for historical accuracy and faster reads)
    userSnapshot: {
        name: String,
        email: String,
        phone: String,
        profilePicture: String,
    },
    ownerSnapshot: {
        name: String,
        email: String,
        phone: String,
    },
    propertySnapshot: {
        name: String,
        address: Object,
        latitude: Number,
        longitude: Number,
        security_deposit: Number,
    },
    roomSnapshot: {
        roomNumber: Number,
        roomType: String,
        roomSize: Number,
        bedType: String,
        occupancy: Number,
        rent: Number,
        amenities: Object,
        images: {
            room: String,
            toilet: String,
        }
    }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
