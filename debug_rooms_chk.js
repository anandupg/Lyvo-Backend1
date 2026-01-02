require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

const checkDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            fs.writeFileSync('debug_output.txt', 'No MONGO_URI found');
            return;
        }

        await mongoose.connect(process.env.MONGO_URI);
        const Room = require('./src/property/models/Room');

        // Get all rooms, lean() for raw JS objects
        const rooms = await Room.find({}).sort({ created_at: -1 }).limit(10).lean();

        let output = 'Room Data Check:\n';
        rooms.forEach(r => {
            output += `Room ${r.room_number}: is_available=${r.is_available} (${typeof r.is_available}), status=${r.status}\n`;
        });

        fs.writeFileSync('debug_output.txt', output);
        console.log('Done writing to file');

    } catch (error) {
        fs.writeFileSync('debug_output.txt', 'Error: ' + error.message);
    } finally {
        process.exit();
    }
};

checkDB();
