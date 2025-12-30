const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
    owner_id: { type: String, required: true, index: true },
    property_name: { type: String, required: true },
    description: { type: String, required: true },
    property_mode: { type: String, enum: ['room'], required: true, default: 'room' },

    // Address Information
    address: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: String, required: true },
        landmark: { type: String, default: '' }
    },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },

    // Pricing Information
    security_deposit: { type: Number, required: true },

    // Property-level Amenities
    amenities: {
        parking4w: { type: Boolean, default: false },
        parking2w: { type: Boolean, default: false },
        kitchen: { type: Boolean, default: false },
        powerBackup: { type: Boolean, default: false }
    },

    // Rules and Policies
    rules: {
        petsAllowed: { type: Boolean, default: false },
        smokingAllowed: { type: Boolean, default: false },
        visitorsAllowed: { type: Boolean, default: true },
        cookingAllowed: { type: Boolean, default: true }
    },

    // Property Images
    images: {
        front: { type: String, default: null },
        back: { type: String, default: null },
        hall: { type: String, default: null },
        kitchen: { type: String, default: null },
        gallery: { type: [String], default: [] }
    },

    // Outside Toilet
    toilet_outside: { type: Boolean, default: false },
    outside_toilet_image: { type: String, default: null },

    // Documents
    land_tax_receipt: { type: String, default: null },

    // Status and Approval
    status: { type: String, default: 'active', enum: ['active', 'inactive', 'maintenance'] },
    approval_status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
    approved: { type: Boolean, default: false },
    approved_at: { type: Date, default: null },
    approved_by: { type: String, default: null },

    // Timestamps
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Property', propertySchema);
