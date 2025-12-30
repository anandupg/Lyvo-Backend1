const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true,
        trim: true
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    paidBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        required: true
    },
    category: {
        type: String,
        default: 'other',
        enum: ['groceries', 'utilities', 'food', 'food delivery', 'cleaning', 'cleaning supplies', 'internet', 'maintenance', 'other']
    },
    date: {
        type: Date,
        default: Date.now
    },
    targetUpiId: {
        type: String,
        trim: true,
        required: true
    },
    splits: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'settled'],
            default: 'pending'
        },
        settledAt: {
            type: Date
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Expense', expenseSchema);
