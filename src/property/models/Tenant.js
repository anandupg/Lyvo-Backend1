const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
    // Tenant/User Information
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    userName: {
        type: String,
        required: true,
    },
    userEmail: {
        type: String,
        required: true,
    },
    userPhone: {
        type: String,
    },
    profilePicture: {
        type: String,
    },

    // Property and Room Information
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        required: true,
        index: true,
    },
    propertyName: {
        type: String,
        required: true,
    },
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
        index: true,
    },
    roomNumber: {
        type: String,
        required: true,
    },

    // Owner Information
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    ownerName: {
        type: String,
    },
    ownerEmail: {
        type: String,
    },
    ownerPhone: {
        type: String,
    },

    // Booking Reference
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
    },

    // Payment Information
    paymentId: {
        type: String,
    },
    razorpayOrderId: {
        type: String,
    },
    razorpayPaymentId: {
        type: String,
    },
    amountPaid: {
        type: Number,
        required: true,
    },

    // Tenancy Dates
    checkInDate: {
        type: Date,
        required: true,
    },
    checkOutDate: {
        type: Date,
    },
    actualCheckInDate: {
        type: Date,
    },
    actualCheckOutDate: {
        type: Date,
    },

    // Tenancy Status
    status: {
        type: String,
        enum: ['active', 'completed', 'terminated', 'extended'],
        default: 'active',
    },

    // Additional Information
    securityDeposit: {
        type: Number,
        default: 0,
    },
    monthlyRent: {
        type: Number,
        required: true,
    },

    // Agreement Details
    agreementUrl: {
        type: String, // URL to rental agreement document
    },
    agreementStartDate: {
        type: Date,
    },
    agreementEndDate: {
        type: Date,
    },

    // Notes and Comments
    notes: {
        type: String,
    },
    specialRequests: {
        type: String,
    },

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },

    // Metadata
    confirmedBy: {
        type: mongoose.Schema.Types.ObjectId, // Owner who confirmed
    },
    confirmedAt: {
        type: Date,
    },

    // Cancellation Information
    cancelledBy: { type: String, enum: ['user', 'owner', 'admin', null], default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null },

    // Soft Delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
});

// Indexes for efficient queries
tenantSchema.index({ userId: 1, status: 1 });
tenantSchema.index({ ownerId: 1, status: 1 });
tenantSchema.index({ propertyId: 1, status: 1 });
tenantSchema.index({ roomId: 1, status: 1 });
tenantSchema.index({ checkInDate: 1, checkOutDate: 1 });

// Update the updatedAt timestamp before saving
tenantSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Virtual for tenancy duration
tenantSchema.virtual('tenancyDuration').get(function () {
    if (this.checkInDate && this.checkOutDate) {
        const diff = this.checkOutDate - this.checkInDate;
        return Math.ceil(diff / (1000 * 60 * 60 * 24)); // Days
    }
    return null;
});

// Virtual for active tenancy
tenantSchema.virtual('isActive').get(function () {
    return this.status === 'active' && (!this.checkOutDate || new Date() <= this.checkOutDate);
});

// Ensure virtuals are included in JSON
tenantSchema.set('toJSON', { virtuals: true });
tenantSchema.set('toObject', { virtuals: true });

const Tenant = mongoose.model('Tenant', tenantSchema);

module.exports = Tenant;
