const mongoose = require('mongoose');

const rentPaymentSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true
    },
    userId: { // The user account of the tenant
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        required: true
    },
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true
    },

    // Payment Details
    amount: {
        type: Number,
        required: true
    },
    dueDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'paid', 'overdue', 'cancelled'],
        default: 'pending',
        index: true
    },
    type: {
        type: String,
        enum: ['rent', 'electricity', 'maintenance', 'security_deposit', 'other'],
        default: 'rent'
    },
    description: { // e.g. "Rent for Jan 2026"
        type: String
    },

    // Payment Record (if paid)
    paidAt: {
        type: Date
    },
    paymentMethod: {
        type: String, // 'cash', 'upi', 'bank_transfer', 'razorpay'
        default: null
    },
    transactionId: { // External reference
        type: String
    },
    receiptUrl: {
        type: String
    },

    // Metadata
    isRecurring: {
        type: Boolean,
        default: true
    },

    notes: {
        type: String
    },

    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
rentPaymentSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('RentPayment', rentPaymentSchema);
