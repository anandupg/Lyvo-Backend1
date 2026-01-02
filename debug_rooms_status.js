const mongoose = require('mongoose');
const Room = require('./src/property/models/Room');

const checkRooms = async () => {
    try {
        // Fallback to local if env var is missing/broken in this context
        const uri = 'mongodb://127.0.0.1:27017/lyvo';
        await mongoose.connect(uri);
        console.log('Connected to MongoDB at', uri);

        const rooms = await Room.find({}).sort({ created_at: -1 }).limit(20);

        console.log('\n--- Recent 20 Rooms Status ---');
        rooms.forEach(r => {
            console.log(`Room ${r.room_number} (ID: ${r._id}): Available=${r.is_available}, Status=${r.status}, Approved=${r.approved}`);
        });
        console.log('------------------------------\n');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

checkRooms();
