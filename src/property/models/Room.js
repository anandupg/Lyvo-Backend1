const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    property_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    room_number: { type: Number, required: true },
    room_type: { type: String, required: true, enum: ['Single', 'Double', 'Triple', 'Quad', 'Master', 'Studio'] },
    room_size: { type: Number, required: true },
    bed_type: { type: String, required: true, enum: ['Single Bed', 'Double Bed', 'Queen Bed', 'King Bed', 'Bunk Bed', 'No Bed'] },
    occupancy: { type: Number, required: true },
    rent: { type: Number, required: true },
    perPersonRent: { type: Number, required: true, default: 0 },
    amenities: {
        ac: { type: Boolean, default: false },
        wifi: { type: Boolean, default: false },
        tv: { type: Boolean, default: false },
        fridge: { type: Boolean, default: false },
        wardrobe: { type: Boolean, default: false },
        studyTable: { type: Boolean, default: false },
        balcony: { type: Boolean, default: false },
        attachedBathroom: { type: Boolean, default: false }
    },
    description: { type: String, default: '' },
    room_image: { type: String, default: null },
    toilet_image: { type: String, default: null },
    is_available: { type: Boolean, default: true },
    status: { type: String, enum: ['active', 'inactive', 'maintenance'], default: 'active' },
    room_status: { type: String, enum: ['available', 'full', 'maintenance'], default: 'available' },
    // Admin approval for rooms
    approval_status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approved: { type: Boolean, default: false },
    approved_at: { type: Date, default: null },
    approved_by: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);
