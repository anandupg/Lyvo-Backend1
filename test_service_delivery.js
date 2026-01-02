
const mongoose = require('mongoose');
require('dotenv').config();

// Mock User model to avoid require issues if path is tricky
const User = { findById: () => ({ select: () => null }) };

// Mock global.io
global.io = {
    to: (room) => ({
        emit: (event, data) => {
            console.log(`[TEST MOCK IO] Emitting '${event}' to '${room}':`, data.title);
        }
    })
};

// Import Service (Adjust path if needed)
const NotificationService = require('./src/property/services/notificationService');

async function testService() {
    try {
        console.log('Connecting to Mongo...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const ownerId = "6944ebfaccd01fda432f0dad"; // From previous check
        // Search for a real property ID
        const Property = mongoose.model('Property', new mongoose.Schema({}, { strict: false }));
        const prop = await Property.findOne({ owner_id: ownerId });

        const propId = prop ? prop._id : new mongoose.Types.ObjectId();
        const propName = prop ? prop.property_name : 'Test Property';

        console.log(`Testing with Owner: ${ownerId}, Property: ${propName} (${propId})`);

        await NotificationService.sendAdminMessageToOwner(
            ownerId,
            propId,
            propName,
            "TEST MESSAGE FROM DEBUG SCRIPT " + new Date().toISOString(),
            "admin_debug_id"
        );

        console.log('Test function finished.');

        setTimeout(() => {
            mongoose.disconnect();
            console.log('Disconnected.');
            process.exit(0);
        }, 2000);

    } catch (error) {
        console.error('Test FAILED:', error);
        process.exit(1);
    }
}

testService();
