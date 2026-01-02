require('dotenv').config();
const mongoose = require('mongoose');

const fixRooms = async () => {
    try {
        if (!process.env.MONGO_URI) {
            console.log('No MONGO_URI, using fallback');
            await mongoose.connect('mongodb://127.0.0.1:27017/lyvo');
        } else {
            await mongoose.connect(process.env.MONGO_URI);
        }

        const Room = require('./src/property/models/Room');

        // Update all active rooms to be available
        const result = await Room.updateMany(
            { status: 'active' },
            { $set: { is_available: true } }
        );

        console.log(`Updated ${result.modifiedCount} rooms to be available.`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
};

fixRooms();
